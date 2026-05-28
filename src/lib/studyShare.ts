import { supabase } from './supabase';

/**
 * Wöchentliche Lern-Rangliste mit Freunden.
 *
 * - Jeder Nutzer veröffentlicht seine fokussierte Lernzeit pro ISO-Woche
 *   (Montag–Sonntag) in der Tabelle `study_weekly`.
 * - Freunde sind dieselben Leute wie beim Hausaufgaben-Sharing
 *   (`homeworkSubscriptions` → deren `userId`).
 * - Die Rangliste holt sich die Wochen-Totals der Freunde + des eigenen Accounts.
 *
 * Benötigte Supabase-Tabelle: → siehe FOCUS_LEADERBOARD_SETUP.md
 */

export interface WeeklyStudyEntry {
  userId: string;
  displayName: string;
  /** Beginn der Woche (Montag) als ms-Timestamp (lokal, 00:00). */
  weekStart: number;
  /** Fokussierte Lernzeit dieser Woche in Millisekunden. */
  totalMs: number;
}

interface WeeklyRow {
  user_id: string;
  display_name: string;
  week_start: string; // YYYY-MM-DD
  total_ms: number;
}

/**
 * Gibt den Montag 00:00 (lokal) der Woche zurück, in der `ts` liegt.
 * Standardisiert auf Montag, damit alle Freunde dieselbe Wocheneinteilung haben.
 */
export function startOfISOWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = So … 6 = Sa
  const diff = (day === 0 ? -6 : 1 - day); // auf Montag zurück
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

/** YYYY-MM-DD aus einem ms-Timestamp (lokale Zeit). */
function toDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD (als lokale Mitternacht) → ms-Timestamp. */
function fromDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

/**
 * Veröffentlicht (upsert) die fokussierte Lernzeit der aktuellen Woche.
 * Wird nach jeder gespeicherten Fokus-Session aufgerufen.
 */
export async function publishWeeklyStudy(weekStart: number, totalMs: number, displayName: string): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('study_weekly').upsert({
    user_id: user.id,
    week_start: toDateKey(weekStart),
    display_name: displayName,
    total_ms: Math.round(totalMs),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,week_start' });
}

/**
 * Holt die Wochen-Totals für eine Liste von User-IDs (Freunde + man selbst)
 * für die angegebene Woche.
 */
export async function fetchWeeklyLeaderboard(userIds: string[], weekStart: number): Promise<WeeklyStudyEntry[]> {
  if (!supabase || userIds.length === 0) return [];
  const weekKey = toDateKey(weekStart);

  const { data, error } = await supabase
    .from('study_weekly')
    .select('user_id, display_name, week_start, total_ms')
    .eq('week_start', weekKey)
    .in('user_id', userIds);

  if (error) {
    console.warn('fetchWeeklyLeaderboard error:', error.message);
    return [];
  }

  return (data as WeeklyRow[]).map(row => ({
    userId: row.user_id,
    displayName: row.display_name,
    weekStart: fromDateKey(row.week_start),
    totalMs: row.total_ms,
  }));
}
