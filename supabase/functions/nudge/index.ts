// Supabase Edge Function — "Anstupsen" (Nudge).
//
// Erlaubt es einem eingeloggten Nutzer, einem *bestätigten Freund* sofort
// eine Push-Benachrichtigung zu schicken ("Schau mal her!"). Wird vom
// versteckten /anstupsen-Screen aufgerufen (Geheim-Code im Rechner).
//
// Sicherheit:
//   - JWT des Aufrufers wird verifiziert (verify_jwt, Standard an).
//   - Es wird serverseitig geprüft, dass zwischen Aufrufer und Ziel eine
//     akzeptierte Freundschaft besteht – sonst 403. So kann niemand
//     Fremde anstupsen.
//
// Body:  { toUserId: string, message?: string }
// Antwort: { ok: true, delivered: number }  (delivered = erreichte Geräte)
//
// Deploy:  supabase functions deploy nudge

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// @ts-ignore
import webpush from 'npm:web-push@3.6.7';

// @ts-ignore
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Promise<Response> | Response) => void };

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface SubRow { endpoint: string; p256dh: string; auth: string; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);

  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: 'Server-Config fehlt.' }, 500);
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID-Keys fehlen.' }, 500);

  // 1) Aufrufer aus dem JWT bestimmen.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Nicht eingeloggt.' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const me = userData?.user?.id;
  if (userErr || !me) return json({ error: 'Nicht eingeloggt.' }, 401);

  // 2) Body lesen.
  let body: { toUserId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiger Body.' }, 400);
  }
  const toUserId = typeof body.toUserId === 'string' ? body.toUserId : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 160) : '';
  if (!toUserId) return json({ error: 'toUserId fehlt.' }, 400);
  if (toUserId === me) return json({ error: 'Du kannst dich nicht selbst anstupsen.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // 3) Freundschaft prüfen (muss akzeptiert sein, in beide Richtungen erlaubt).
  const { data: fr, error: frErr } = await admin
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(requester.eq.${me},addressee.eq.${toUserId}),and(requester.eq.${toUserId},addressee.eq.${me})`)
    .limit(1);
  if (frErr) return json({ error: 'Freundschafts-Check fehlgeschlagen.' }, 500);
  if (!fr || fr.length === 0) return json({ error: 'Ihr seid (noch) keine Freunde.' }, 403);

  // 4) Anzeigename des Absenders.
  const { data: prof } = await admin
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', me)
    .maybeSingle();
  const fromName = (prof?.display_name as string | undefined)?.trim() || 'Jemand';

  // 5) Push-Subscriptions des Ziels laden.
  const { data: subsData } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', toUserId);
  const subs = (subsData ?? []) as SubRow[];

  const payload = JSON.stringify({
    title: `👋 ${fromName} stupst dich an!`,
    body: message || 'Schau mal kurz her 👀',
    url: '/',
    tag: `nudge-${me}`,
    renotify: true,
    vibrate: [80, 40, 80],
    requireInteraction: false,
    data: { type: 'nudge', from: me },
  });

  // 6) An alle Geräte des Ziels senden, tote Subscriptions aufräumen.
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      delivered++;
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else {
        console.error('nudge push error', status, e?.body ?? e?.message);
      }
    }
  }

  return json({ ok: true, delivered });
});
