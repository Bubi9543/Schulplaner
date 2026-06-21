import { supabase } from './supabase';

/**
 * Stößt die Edge Function `social-notify` an, die *sofort* eine Push-
 * Benachrichtigung an den/die richtigen Empfänger schickt (Post, Reaktion,
 * Kommentar, Freundschaftsanfrage/-Annahme, geteilte Aufgabe).
 *
 * Bewusst „fire-and-forget": Fehler werden nur geloggt, nie geworfen. Eine
 * fehlgeschlagene Benachrichtigung darf die eigentliche Aktion (posten,
 * kommentieren …) niemals blockieren oder einen Fehler zeigen.
 */
type SocialNotifyArgs =
  | { type: 'post'; postId: string }
  | { type: 'reaction'; postId: string }
  | { type: 'comment'; commentId: string }
  | { type: 'friend_request'; friendshipId: string }
  | { type: 'friend_accept'; friendshipId: string }
  | { type: 'shared_task'; taskId: string };

export function notifySocial(args: SocialNotifyArgs): void {
  if (!supabase) return;
  // Nicht awaiten – läuft im Hintergrund weiter.
  supabase.functions
    .invoke('social-notify', { body: args })
    .catch((e) => console.warn('social-notify failed:', e?.message ?? e));
}
