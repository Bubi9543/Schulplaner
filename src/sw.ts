/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */

// Custom Service Worker für Notenapp.
// - Workbox-Precache via VitePWA injectManifest
// - Push-Handler für Web-Push-Benachrichtigungen
// - Notification-Click öffnet/fokussiert die App auf einer sinnvollen Route

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

// Sofort aktivieren, damit Updates schnell greifen.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push-Empfang ──────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Beliebige Zusatz-Daten, landen in notification.data. */
  data?: Record<string, unknown>;
  /** Eigener Tag → neue Pushes mit gleichem Tag ersetzen frühere. */
  tag?: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Schulplaner', body: event.data.text() };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: '/icon.svg',
    badge: '/favicon.svg',
    tag: payload.tag,
    data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = (event.notification.data as any)?.url ?? '/';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const targetUrl = new URL(url, self.registration.scope).href;

    // Bereits offenes Fenster der App fokussieren + Route ändern.
    for (const client of clientsList) {
      if (client.url.startsWith(self.registration.scope)) {
        try {
          await (client as WindowClient).navigate(targetUrl);
        } catch {
          // navigate() darf laut Spec werfen, wenn die URL aus dem scope fällt.
        }
        return (client as WindowClient).focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
