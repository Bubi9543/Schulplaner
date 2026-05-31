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
  /** Profilbild-URL (aus user_profiles), falls vorhanden. */
  avatarUrl?: string;
  /** Aktuelle Lern-Streak (aufeinanderfolgende Tage mit Lernzeit). */
  streak?: number;
}

interface WeeklyRow {
  user_id: string;
  display_name: string;
  week_start: string; // YYYY-MM-DD
  total_ms: number;
  streak?: number | null;
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
 * Berechnet die aktuelle Lern-Streak: die Anzahl aufeinanderfolgender
 * Kalendertage (lokal) mit mindestens einer Fokus-Session, gerechnet ab heute.
 *
 * Wurde heute noch nicht gelernt, die Streak aber gestern noch lief, bleibt sie
 * bis Tagesende „am Leben" und zählt durch gestern – so verliert man sie nicht
 * nur, weil der heutige Tag noch jung ist.
 */
export function computeStreak(sessions: { startedAt: number; focusedMs: number }[], now: number = Date.now()): number {
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.focusedMs > 0) days.add(toDateKey(s.startedAt));
  }
  if (days.size === 0) return 0;

  const DAY = 86400000;
  const todayKey = toDateKey(now);
  const yesterdayKey = toDateKey(now - DAY);

  let cursor: number;
  if (days.has(todayKey)) cursor = now;
  else if (days.has(yesterdayKey)) cursor = now - DAY;
  else return 0;

  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

/**
 * Veröffentlicht (upsert) die fokussierte Lernzeit der aktuellen Woche.
 * Wird nach jeder gespeicherten Fokus-Session aufgerufen.
 */
export async function publishWeeklyStudy(weekStart: number, totalMs: number, displayName: string, streak = 0): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const base = {
    user_id: user.id,
    week_start: toDateKey(weekStart),
    display_name: displayName,
    total_ms: Math.round(totalMs),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('study_weekly')
    .upsert({ ...base, streak: Math.round(streak) }, { onConflict: 'user_id,week_start' });

  // Fallback, falls die `streak`-Spalte noch nicht migriert wurde.
  if (error && /streak/i.test(error.message)) {
    await supabase.from('study_weekly').upsert(base, { onConflict: 'user_id,week_start' });
  }
}

/**
 * Holt die Wochen-Totals für eine Liste von User-IDs (Freunde + man selbst)
 * für die angegebene Woche.
 */
export async function fetchWeeklyLeaderboard(userIds: string[], weekStart: number): Promise<WeeklyStudyEntry[]> {
  if (!supabase || userIds.length === 0) return [];
  const weekKey = toDateKey(weekStart);

  const selectWeekly = (cols: string) =>
    supabase!
      .from('study_weekly')
      .select(cols)
      .eq('week_start', weekKey)
      .in('user_id', userIds);

  const [weeklyResRaw, profilesRes] = await Promise.all([
    selectWeekly('user_id, display_name, week_start, total_ms, streak'),
    supabase
      .from('user_profiles')
      .select('user_id, avatar_url')
      .in('user_id', userIds),
  ]);

  // Fallback ohne `streak`, falls die Spalte noch nicht migriert wurde.
  let weeklyRes = weeklyResRaw;
  if (weeklyRes.error && /streak/i.test(weeklyRes.error.message)) {
    weeklyRes = await selectWeekly('user_id, display_name, week_start, total_ms');
  }

  if (weeklyRes.error) {
    console.warn('fetchWeeklyLeaderboard error:', weeklyRes.error.message);
    return [];
  }

  const avatars = new Map<string, string | undefined>();
  for (const p of (profilesRes.data as { user_id: string; avatar_url: string | null }[] | null) ?? []) {
    avatars.set(p.user_id, p.avatar_url ?? undefined);
  }

  return (weeklyRes.data as unknown as WeeklyRow[]).map(row => ({
    userId: row.user_id,
    displayName: row.display_name,
    weekStart: fromDateKey(row.week_start),
    totalMs: row.total_ms,
    avatarUrl: avatars.get(row.user_id),
    streak: row.streak ?? 0,
  }));
}
