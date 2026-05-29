import { supabase } from './supabase';

/**
 * Push-Notification-Subscription (Web Push API).
 *
 * Flow:
 *  1. requestPermission() fragt den Browser nach Erlaubnis.
 *  2. subscribePush() registriert das Gerät beim PushManager (mit VAPID-Public-Key)
 *     und speichert das Endpoint + die Keys in der Supabase-Tabelle
 *     `push_subscriptions`.
 *  3. Die Edge Function `push-runner` liest diese Subscriptions und sendet
 *     Pushes per Web-Push-Protokoll (mit VAPID-Private-Key).
 *
 * Plattform-Notizen:
 *  - Android/Desktop: funktioniert wie native, auch wenn Tab/Browser im
 *    Hintergrund läuft.
 *  - iOS/iPadOS: braucht installierte PWA (Add to Home Screen) – im
 *    Safari-Tab ohne Install ist Push deaktiviert (Apple-Limit).
 */

/** Wird im Build via VITE_VAPID_PUBLIC_KEY ersetzt – siehe SUPABASE_SETUP.md. */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function currentPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermission;
}

/**
 * Holt die aktuelle Push-Subscription dieses Browsers (oder null).
 * Funktioniert nur, wenn der Service Worker bereits aktiv ist.
 */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Fragt nach Permission. Returnt den finalen Status. */
export async function requestPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return 'unsupported';
  const status = await Notification.requestPermission();
  return status as PushPermission;
}

/**
 * Subscribed dieses Gerät beim Push-Service + speichert Endpoint in Supabase.
 * Vorher muss permission='granted' und ein eingeloggter User vorhanden sein.
 */
export async function subscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Push wird auf diesem Gerät nicht unterstützt.' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: 'VAPID-Public-Key fehlt (VITE_VAPID_PUBLIC_KEY).' };
  if (!supabase) return { ok: false, error: 'Cloud-Sync nicht eingerichtet.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Bitte erst einloggen.' };

  if (Notification.permission !== 'granted') {
    return { ok: false, error: 'Keine Push-Erlaubnis.' };
  }

  const reg = await navigator.serviceWorker.ready;

  // Bestehende Subscription wiederverwenden, falls sie auf dem gleichen Key basiert.
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Wenn Key nicht zu unserem aktuellen VAPID passt, unsubscriben + neu.
    const existingKey = sub.options.applicationServerKey;
    if (existingKey) {
      const existingArr = new Uint8Array(existingKey);
      const targetArr = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const same = existingArr.length === targetArr.length
        && existingArr.every((b, i) => b === targetArr[i]);
      if (!same) {
        await sub.unsubscribe();
        sub = null;
      }
    }
  }

  if (!sub) {
    try {
      // Cast nötig wegen TS-Lib-Konflikt zwischen Uint8Array<ArrayBufferLike>
      // und PushSubscriptionOptions.applicationServerKey (BufferSource).
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
      });
    } catch (e) {
      return { ok: false, error: 'Konnte nicht abonnieren: ' + (e instanceof Error ? e.message : String(e)) };
    }
  }

  const payload = sub.toJSON();
  const p256dh = payload.keys?.p256dh ?? '';
  const auth = payload.keys?.auth ?? '';
  if (!payload.endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Subscription unvollständig.' };
  }

  // In Supabase speichern – Endpoint als Primary Key, replaceAndInsert pro Gerät.
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: payload.endpoint,
    user_id: user.id,
    p256dh,
    auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) return { ok: false, error: 'Speichern fehlgeschlagen: ' + error.message };
  return { ok: true };
}

/** Abmelden + Endpoint in Supabase löschen. */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;
  const sub = await getActiveSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
}

/** Sendet eine lokale Test-Benachrichtigung (kein Server-Push). */
export async function showLocalTestNotification(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Test geklappt!', {
    body: 'Wenn du das siehst, funktionieren Push-Benachrichtigungen auf diesem Gerät.',
    icon: '/icon.svg',
    badge: '/favicon.svg',
    tag: 'notenapp-test',
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** VAPID-Key (base64url) → Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}
