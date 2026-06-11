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

/** Zeiträume für die Rangliste-Umschaltung im Fokus-Tab. */
export type LeaderboardPeriod = 'today' | 'week' | 'month' | 'year';

/** Lokale Mitternacht (00:00) des Tages, in dem `ts` liegt. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Erster des Monats, 00:00 (lokal), in dem `ts` liegt. */
export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * Beginn des aktuellen Schuljahres (Bayern): 1. September, 00:00 lokal.
 * Ab September zählt das laufende Kalenderjahr, davor das Vorjahr.
 */
export function startOfSchoolYear(ts: number): number {
  const d = new Date(ts);
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; // 8 = September
  return new Date(year, 8, 1).getTime();
}

/**
 * Liefert den Tages-Bereich [startKey, endKey) (jeweils YYYY-MM-DD) für einen
 * Zeitraum. `endKey` ist exklusiv (der Tag nach dem letzten gezählten Tag).
 */
export function rangeForPeriod(period: LeaderboardPeriod, now: number = Date.now()): { startKey: string; endKey: string } {
  let start: number;
  switch (period) {
    case 'today': start = startOfDay(now); break;
    case 'week': start = startOfISOWeek(now); break;
    case 'month': start = startOfMonth(now); break;
    case 'year': start = startOfSchoolYear(now); break;
  }
  // Ende = morgen 00:00, damit der heutige Tag immer einschließlich gezählt wird.
  const end = startOfDay(now) + 86400000;
  return { startKey: toDateKey(start), endKey: toDateKey(end) };
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

// ─── Tagesbasis (für den Zeitraum-Umschalter im Fokus-Tab) ──────────────────

interface DailyRow {
  user_id: string;
  display_name: string;
  day: string; // YYYY-MM-DD
  total_ms: number;
  streak?: number | null;
}

/** Eine einzelne Tagessumme zum Hochladen. */
export interface DailyStudyTotal {
  /** YYYY-MM-DD (lokale Tagesgrenze). */
  dayKey: string;
  totalMs: number;
}

/**
 * Rechnet aus einzelnen Fokus-Sessions die fokussierte Lernzeit pro Kalendertag
 * (lokal) zusammen – nur Tage ab `since` (Standard: Beginn des Schuljahres),
 * damit nicht die ganze Historie hochgeladen wird.
 */
export function dailyTotalsFromSessions(
  sessions: { startedAt: number; focusedMs: number }[],
  since: number = startOfSchoolYear(Date.now()),
): DailyStudyTotal[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (s.focusedMs <= 0 || s.startedAt < since) continue;
    const key = toDateKey(s.startedAt);
    map.set(key, (map.get(key) ?? 0) + s.focusedMs);
  }
  return [...map.entries()].map(([dayKey, totalMs]) => ({ dayKey, totalMs }));
}

/**
 * Veröffentlicht (upsert) die fokussierte Lernzeit pro Tag in einem Rutsch.
 * Die `streak` wird auf jede Tageszeile geschrieben; die Rangliste liest sie
 * aus der jüngsten Zeile.
 */
export async function publishDailyStudy(totals: DailyStudyTotal[], displayName: string, streak = 0): Promise<void> {
  if (!supabase || totals.length === 0) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  const base = totals.map(t => ({
    user_id: user.id,
    day: t.dayKey,
    display_name: displayName,
    total_ms: Math.round(t.totalMs),
    updated_at: now,
  }));

  const { error } = await supabase
    .from('study_daily')
    .upsert(base.map(b => ({ ...b, streak: Math.round(streak) })), { onConflict: 'user_id,day' });

  // Fallback, falls die `streak`-Spalte noch nicht migriert wurde.
  if (error && /streak/i.test(error.message)) {
    await supabase.from('study_daily').upsert(base, { onConflict: 'user_id,day' });
  }
}

/**
 * Holt die Tageszeilen im Bereich [startKey, endKey) für die User und summiert
 * sie pro Person zu einem Zeitraum-Total. `streak` kommt aus der jüngsten
 * Tageszeile, Avatare aus `user_profiles`.
 */
export async function fetchDailyLeaderboard(userIds: string[], startKey: string, endKey: string): Promise<WeeklyStudyEntry[]> {
  if (!supabase || userIds.length === 0) return [];

  const selectDaily = (cols: string) =>
    supabase!
      .from('study_daily')
      .select(cols)
      .gte('day', startKey)
      .lt('day', endKey)
      .in('user_id', userIds);

  const [dailyResRaw, profilesRes] = await Promise.all([
    selectDaily('user_id, display_name, day, total_ms, streak'),
    supabase
      .from('user_profiles')
      .select('user_id, avatar_url')
      .in('user_id', userIds),
  ]);

  // Fallback ohne `streak`, falls die Spalte noch nicht migriert wurde.
  let dailyRes = dailyResRaw;
  if (dailyRes.error && /streak/i.test(dailyRes.error.message)) {
    dailyRes = await selectDaily('user_id, display_name, day, total_ms');
  }

  if (dailyRes.error) {
    console.warn('fetchDailyLeaderboard error:', dailyRes.error.message);
    return [];
  }

  const avatars = new Map<string, string | undefined>();
  for (const p of (profilesRes.data as { user_id: string; avatar_url: string | null }[] | null) ?? []) {
    avatars.set(p.user_id, p.avatar_url ?? undefined);
  }

  // Pro User: Lernzeit summieren, Name + Streak aus der jüngsten Tageszeile.
  const agg = new Map<string, { displayName: string; totalMs: number; latestDay: string; streak: number }>();
  for (const row of (dailyRes.data as unknown as DailyRow[])) {
    const cur = agg.get(row.user_id);
    if (!cur) {
      agg.set(row.user_id, { displayName: row.display_name, totalMs: row.total_ms, latestDay: row.day, streak: row.streak ?? 0 });
    } else {
      cur.totalMs += row.total_ms;
      if (row.day >= cur.latestDay) { cur.latestDay = row.day; cur.displayName = row.display_name; cur.streak = row.streak ?? 0; }
    }
  }

  return [...agg.entries()].map(([userId, v]) => ({
    userId,
    displayName: v.displayName,
    weekStart: fromDateKey(startKey),
    totalMs: v.totalMs,
    avatarUrl: avatars.get(userId),
    streak: v.streak,
  }));
}
