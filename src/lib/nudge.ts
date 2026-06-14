import { supabase } from './supabase';

export interface NudgeResult {
  /** Anzahl erreichter Geräte. 0 = Freund hat Push aus / nicht abonniert. */
  delivered: number;
}

/**
 * Stupst einen Freund an → löst sofort eine Push-Benachrichtigung auf seinen
 * Geräten aus. Die Edge Function `nudge` prüft serverseitig, dass eine
 * akzeptierte Freundschaft besteht.
 */
export async function sendNudge(toUserId: string, message?: string): Promise<NudgeResult> {
  if (!supabase) throw new Error('Cloud-Sync nicht eingerichtet – bitte erst anmelden.');

  const { data, error } = await supabase.functions.invoke('nudge', {
    body: { toUserId, message: message?.trim() || undefined },
  });

  if (error) {
    // Bei non-2xx liefert die Function ein { error }-JSON im Response-Body.
    let msg = error.message || 'Anstupsen fehlgeschlagen.';
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (ctx?.json) {
        const parsed = await ctx.json();
        if (parsed?.error) msg = parsed.error;
      }
    } catch {
      /* Body nicht lesbar – generische Meldung behalten. */
    }
    throw new Error(msg);
  }

  return { delivered: Number((data as { delivered?: number })?.delivered ?? 0) };
}

/**
 * Liefert die User-IDs der Freunde, die auf mindestens einem Gerät Push
 * aktiviert haben – also „anstupsbar" sind. Nutzt die Datenbank-Funktion
 * `friends_with_push` (siehe NUDGE_STATUS_SETUP.md), die sicher nur die
 * user_ids zurückgibt. Fehlt die Funktion (Setup noch nicht eingespielt),
 * wird eine leere Menge zurückgegeben – dann zeigt die App keine Buttons.
 */
export async function fetchNudgeableFriendIds(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.rpc('friends_with_push');
  if (error) {
    console.warn('friends_with_push error:', error.message);
    return new Set();
  }
  const rows = (data as { user_id: string }[] | null) ?? [];
  return new Set(rows.map(r => r.user_id));
}
