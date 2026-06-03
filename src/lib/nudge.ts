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
