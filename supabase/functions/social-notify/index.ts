// Supabase Edge Function — Social-Benachrichtigungen (sofort).
//
// Löst SOFORT eine Push-Benachrichtigung aus, wenn ein Nutzer im Social-Feed
// oder bei Freundschaften etwas tut. Wird vom Client direkt nach der jeweiligen
// Aktion aufgerufen (fire-and-forget, blockiert die UI nicht).
//
// Unterstützte Typen (Body `{ type, ... }`):
//   - 'post'          { postId }          → alle Empfänger (Audience) des Posts
//   - 'reaction'      { postId }          → der Autor des Posts
//   - 'comment'       { commentId }       → der Autor des Posts
//   - 'friend_request'{ friendshipId }    → der Empfänger der Anfrage
//   - 'friend_accept' { friendshipId }    → der ursprüngliche Anfrager
//   - 'shared_task'   { taskId }          → alle bestätigten Freunde des Besitzers
//
// Sicherheit:
//   - JWT des Aufrufers wird verifiziert; der Aufrufer muss serverseitig der
//     tatsächliche Urheber sein (z. B. Post-Autor, Kommentar-Autor). Niemand
//     kann im Namen anderer Pushes auslösen.
//   - Pro Empfänger werden dessen Notification-Settings + Stille Zeit geprüft.
//   - `shared_task` wird via notification_log entdoppelt, damit das wiederholte
//     Speichern derselben geteilten Aufgabe nicht mehrfach benachrichtigt.
//
// Deploy:  supabase functions deploy social-notify

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Settings-Typen (Spiegel der App-Types, nur was wir brauchen) ──────────────

interface SocialNotifSettings {
  enabled: boolean;
  social?: { posts?: boolean; reactions?: boolean; comments?: boolean };
  friends?: { requests?: boolean; accepted?: boolean; sharedHomework?: boolean };
  quietHours?: { enabled: boolean; from: string; to: string };
}

interface SubRow { endpoint: string; p256dh: string; auth: string; }

/** Welche Setting-Flagge ein Typ braucht. */
type NotifKind =
  | 'post' | 'reaction' | 'comment'
  | 'friend_request' | 'friend_accept' | 'shared_task';

function isAllowed(s: SocialNotifSettings, kind: NotifKind): boolean {
  if (!s.enabled) return false;
  switch (kind) {
    case 'post': return s.social?.posts ?? true;
    case 'reaction': return s.social?.reactions ?? true;
    case 'comment': return s.social?.comments ?? true;
    case 'friend_request': return s.friends?.requests ?? true;
    case 'friend_accept': return s.friends?.accepted ?? true;
    case 'shared_task': return s.friends?.sharedHomework ?? true;
  }
}

// ─── Stille Zeit (Berlin-Lokalzeit) ────────────────────────────────────────────

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

function berlinNow(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = fmt.formatToParts(new Date()).reduce((acc, x) => {
    if (x.type !== 'literal') acc[x.type] = x.value;
    return acc;
  }, {} as Record<string, string>);
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`);
}

function inQuietHours(q?: { enabled: boolean; from: string; to: string }): boolean {
  if (!q || !q.enabled) return false;
  const now = berlinNow();
  const { h: fH, m: fM } = parseHM(q.from);
  const { h: tH, m: tM } = parseHM(q.to);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fromMin = fH * 60 + fM;
  const toMin = tH * 60 + tM;
  if (fromMin === toMin) return false;
  if (fromMin < toMin) return nowMin >= fromMin && nowMin < toMin;
  return nowMin >= fromMin || nowMin < toMin; // über Mitternacht
}

// ─── Push-Versand an einen Empfänger ───────────────────────────────────────────

interface Notification { title: string; body: string; url: string; tag: string; }

/**
 * Schickt eine Benachrichtigung an EINEN Empfänger, sofern dieser den Typ
 * aktiviert hat und nicht in der Stille-Zeit ist. Gibt die Anzahl erreichter
 * Geräte zurück.
 */
async function notifyUser(
  admin: ReturnType<typeof createClient>,
  recipientId: string,
  kind: NotifKind,
  build: () => Notification,
): Promise<number> {
  // 1) Settings des Empfängers laden + Typ/Quiet-Hours prüfen.
  const { data: setRow } = await admin
    .from('user_settings').select('data').eq('user_id', recipientId).maybeSingle();
  const settings = ((setRow?.data as { notifications?: SocialNotifSettings } | null)?.notifications) ?? null;
  if (!settings) return 0;
  if (!isAllowed(settings, kind)) return 0;
  if (inQuietHours(settings.quietHours)) return 0;

  // 2) Geräte laden.
  const { data: subsData } = await admin
    .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', recipientId);
  const subs = (subsData ?? []) as SubRow[];
  if (subs.length === 0) return 0;

  // 3) Senden, tote Geräte aufräumen.
  const n = build();
  const payload = JSON.stringify({
    title: n.title, body: n.body, url: n.url, tag: n.tag,
    renotify: true, vibrate: [60, 30, 60],
    data: { type: kind, url: n.url },
  });
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      delivered++;
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else {
        console.error('social-notify push error', kind, status, e?.body ?? e?.message);
      }
    }
  }
  return delivered;
}

/** Anzeigename eines Nutzers (für „X hat …"). */
async function displayName(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('display_name').eq('user_id', userId).maybeSingle();
  return ((data?.display_name as string | undefined)?.trim()) || 'Jemand';
}

function snippet(text: string | null | undefined, max = 80): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST.' }, 405);

  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: 'Server-Config fehlt.' }, 500);
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID-Keys fehlen.' }, 500);

  // Aufrufer aus JWT.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Nicht eingeloggt.' }, 401);
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const me = userData?.user?.id;
  if (userErr || !me) return json({ error: 'Nicht eingeloggt.' }, 401);

  let body: { type?: unknown; postId?: unknown; commentId?: unknown; friendshipId?: unknown; taskId?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Ungültiger Body.' }, 400); }
  const type = String(body.type ?? '') as NotifKind;

  const admin = createClient(supabaseUrl, serviceKey);
  const meName = await displayName(admin, me);

  let delivered = 0;

  try {
    switch (type) {
      // ── Neuer Post → alle Empfänger der Audience ───────────────────────────
      case 'post': {
        const postId = String(body.postId ?? '');
        if (!postId) return json({ error: 'postId fehlt.' }, 400);
        const { data: post } = await admin
          .from('social_posts').select('user_id, subject, caption').eq('id', postId).maybeSingle();
        if (!post) return json({ error: 'Post nicht gefunden.' }, 404);
        if (post.user_id !== me) return json({ error: 'Nicht dein Post.' }, 403);

        const { data: aud } = await admin
          .from('social_post_audience').select('user_id').eq('post_id', postId);
        const recipients = [...new Set(((aud ?? []) as { user_id: string }[]).map(r => r.user_id))]
          .filter(id => id && id !== me);
        for (const rid of recipients) {
          delivered += await notifyUser(admin, rid, 'post', () => ({
            title: `📸 ${meName} hat gepostet`,
            body: snippet(post.caption as string) || `Neuer Beitrag in ${post.subject ?? 'Lern-Feed'}`,
            url: '/socials',
            tag: `post-${postId}`,
          }));
        }
        break;
      }

      // ── Reaktion auf einen Post → Autor ────────────────────────────────────
      case 'reaction': {
        const postId = String(body.postId ?? '');
        if (!postId) return json({ error: 'postId fehlt.' }, 400);
        const { data: post } = await admin
          .from('social_posts').select('user_id, subject, caption').eq('id', postId).maybeSingle();
        if (!post) return json({ error: 'Post nicht gefunden.' }, 404);
        const author = post.user_id as string;
        if (author === me) break; // eigene Reaktion → nichts.
        // Reaktion des Aufrufers muss wirklich existieren.
        const { data: react } = await admin
          .from('social_reactions').select('emoji').eq('post_id', postId).eq('user_id', me).maybeSingle();
        if (!react) break;
        delivered += await notifyUser(admin, author, 'reaction', () => ({
          title: `${react.emoji ?? '❤️'} ${meName} hat reagiert`,
          body: snippet(post.caption as string) || `auf deinen Beitrag in ${post.subject ?? 'Lern-Feed'}`,
          url: '/socials',
          tag: `react-${postId}`,
        }));
        break;
      }

      // ── Kommentar → Autor des Posts; Antwort → Autor des Eltern-Kommentars ──
      case 'comment': {
        const commentId = String(body.commentId ?? '');
        if (!commentId) return json({ error: 'commentId fehlt.' }, 400);
        const { data: comment } = await admin
          .from('social_comments').select('post_id, user_id, parent_id, text').eq('id', commentId).maybeSingle();
        if (!comment) return json({ error: 'Kommentar nicht gefunden.' }, 404);
        if (comment.user_id !== me) return json({ error: 'Nicht dein Kommentar.' }, 403);

        // Antwort auf einen Kommentar → Autor des Eltern-Kommentars benachrichtigen.
        if (comment.parent_id) {
          const { data: parent } = await admin
            .from('social_comments').select('user_id').eq('id', comment.parent_id).maybeSingle();
          const target = parent?.user_id as string | undefined;
          if (target && target !== me) {
            delivered += await notifyUser(admin, target, 'comment', () => ({
              title: `💬 ${meName} hat dir geantwortet`,
              body: snippet(comment.text as string) || 'Neue Antwort auf deinen Kommentar',
              url: '/socials',
              tag: `comment-${comment.post_id}`,
            }));
          }
          break;
        }

        // Normaler Kommentar → Autor des Posts benachrichtigen.
        const { data: post } = await admin
          .from('social_posts').select('user_id, subject').eq('id', comment.post_id).maybeSingle();
        if (!post) break;
        const author = post.user_id as string;
        if (author === me) break; // Kommentar auf eigenen Post.
        delivered += await notifyUser(admin, author, 'comment', () => ({
          title: `💬 ${meName} hat kommentiert`,
          body: snippet(comment.text as string) || `auf deinen Beitrag in ${post.subject ?? 'Lern-Feed'}`,
          url: '/socials',
          tag: `comment-${comment.post_id}`,
        }));
        break;
      }

      // ── Freundschaftsanfrage → Empfänger ───────────────────────────────────
      case 'friend_request': {
        const friendshipId = String(body.friendshipId ?? '');
        if (!friendshipId) return json({ error: 'friendshipId fehlt.' }, 400);
        const { data: fr } = await admin
          .from('friendships').select('requester, addressee, status').eq('id', friendshipId).maybeSingle();
        if (!fr) return json({ error: 'Anfrage nicht gefunden.' }, 404);
        if (fr.requester !== me) return json({ error: 'Nicht deine Anfrage.' }, 403);
        delivered += await notifyUser(admin, fr.addressee as string, 'friend_request', () => ({
          title: '👋 Neue Freundschaftsanfrage',
          body: `${meName} möchte dein Freund sein.`,
          url: '/freunde',
          tag: `friendreq-${friendshipId}`,
        }));
        break;
      }

      // ── Anfrage angenommen → ursprünglicher Anfrager ───────────────────────
      case 'friend_accept': {
        const friendshipId = String(body.friendshipId ?? '');
        if (!friendshipId) return json({ error: 'friendshipId fehlt.' }, 400);
        const { data: fr } = await admin
          .from('friendships').select('requester, addressee, status').eq('id', friendshipId).maybeSingle();
        if (!fr) return json({ error: 'Anfrage nicht gefunden.' }, 404);
        if (fr.addressee !== me) return json({ error: 'Du bist nicht der Empfänger.' }, 403);
        if (fr.status !== 'accepted') return json({ error: 'Noch nicht angenommen.' }, 400);
        delivered += await notifyUser(admin, fr.requester as string, 'friend_accept', () => ({
          title: '🎉 Anfrage angenommen',
          body: `${meName} ist jetzt dein Freund.`,
          url: '/freunde',
          tag: `friendacc-${friendshipId}`,
        }));
        break;
      }

      // ── Geteilte Hausaufgabe → alle bestätigten Freunde (einmalig) ─────────
      case 'shared_task': {
        const taskId = String(body.taskId ?? '');
        if (!taskId) return json({ error: 'taskId fehlt.' }, 400);
        const { data: task } = await admin
          .from('shared_tasks').select('owner_user_id, title, subject_name').eq('id', taskId).maybeSingle();
        if (!task) return json({ error: 'Aufgabe nicht gefunden.' }, 404);
        if (task.owner_user_id !== me) return json({ error: 'Nicht deine Aufgabe.' }, 403);

        // Dedup: nur beim ersten Teilen benachrichtigen (publishTask ist ein upsert,
        // der bei jeder Bearbeitung erneut feuert).
        const dedupKey = `shared-${taskId}`;
        const { data: already } = await admin
          .from('notification_log').select('event_key').eq('user_id', me).eq('event_key', dedupKey).maybeSingle();
        if (already) break;

        // Bestätigte Freunde des Besitzers ermitteln.
        const { data: fr } = await admin
          .from('friendships').select('requester, addressee')
          .eq('status', 'accepted')
          .or(`requester.eq.${me},addressee.eq.${me}`);
        const friendIds = [...new Set(((fr ?? []) as { requester: string; addressee: string }[])
          .map(f => (f.requester === me ? f.addressee : f.requester)))].filter(Boolean);

        for (const rid of friendIds) {
          delivered += await notifyUser(admin, rid, 'shared_task', () => ({
            title: `📚 ${meName} teilt eine Aufgabe`,
            body: snippet(task.title as string) + (task.subject_name ? ` · ${task.subject_name}` : ''),
            url: '/aufgaben',
            tag: `shared-${taskId}`,
          }));
        }
        // Erst NACH dem Versand loggen → bei Fehler wird beim nächsten Mal erneut versucht.
        await admin.from('notification_log').insert({ user_id: me, event_key: dedupKey });
        break;
      }

      default:
        return json({ error: 'Unbekannter Typ.' }, 400);
    }
  } catch (e: any) {
    console.error('social-notify error', type, e?.message ?? e);
    return json({ error: 'Interner Fehler.' }, 500);
  }

  return json({ ok: true, delivered });
});
