import type { FocusSession, Grade, Subject } from '@/types';
import { getKindLabel } from '@/lib/grading';
import type { GradingSystemConfig } from '@/types';

export const DAY = 86400000;

/** Standard-Werte beim Anlegen eines neuen Fokus-Ziels. */
export const DEFAULT_GOAL_MINUTES = 300;
export const DEFAULT_GOAL_DAYS = 7;

/** Wandelt einen ms-Timestamp in den Wert eines <input type="date"> (yyyy-mm-dd). */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Tagesende (23:59:59) des gewählten Datums als ms-Timestamp. */
export function endOfDay(dateStr: string): number {
  return new Date(dateStr + 'T23:59:59').getTime();
}

export interface GoalProgress {
  doneMs: number;
  goalMs: number;
  remMs: number;
  daysLeft: number;
  perDayMs: number;
  barPct: number;
  overdue: boolean;
}

/**
 * Fortschritt eines Fokus-Ziels. `match` filtert die relevanten Sessions
 * (z. B. nach subjectId fürs Fach-Ziel oder gradeId fürs Test-Ziel).
 */
export function goalProgress(
  sessions: FocusSession[],
  match: (f: FocusSession) => boolean,
  start: number,
  goalMinutes: number,
  deadline: number,
  now = Date.now(),
): GoalProgress {
  const doneMs = sessions.filter(f => f.startedAt >= start && match(f)).reduce((a, f) => a + f.focusedMs, 0);
  const goalMs = goalMinutes * 60000;
  const remMs = Math.max(0, goalMs - doneMs);
  const overdue = deadline < now;
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / DAY));
  const perDayMs = daysLeft > 0 ? remMs / daysLeft : remMs;
  const barPct = goalMs > 0 ? Math.min(100, Math.round((doneMs / goalMs) * 100)) : 0;
  return { doneMs, goalMs, remMs, daysLeft, perDayMs, barPct, overdue };
}

export interface DayBar { label: string; min: number; heightPct: number }

/** 7-Tage-Balken (heute als letzter) der gelernten Minuten für die gematchten Sessions. */
export function goalDayBars(sessions: FocusSession[], match: (f: FocusSession) => boolean, now = Date.now()): DayBar[] {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const base = todayStart.getTime();
  const labels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const bars = Array.from({ length: 7 }, (_, i) => ({ dayStart: base - (6 - i) * DAY, ms: 0 }));
  for (const f of sessions) {
    if (!match(f)) continue;
    const idx = Math.floor((f.startedAt - bars[0].dayStart) / DAY);
    if (idx >= 0 && idx < 7) bars[idx].ms += f.focusedMs;
  }
  const maxMs = Math.max(1, ...bars.map(b => b.ms));
  return bars.map(b => ({ label: labels[new Date(b.dayStart).getDay()], min: Math.round(b.ms / 60000), heightPct: (b.ms / maxMs) * 100 }));
}

export interface ActiveGoal {
  key: string;
  kind: 'subject' | 'test';
  subjectId: string;
  gradeId?: string;
  label: string;
  color: string;
  goalMinutes: number;
  deadline: number;
  start: number;
  /** Filter für die zugehörigen Fokus-Sessions. */
  match: (f: FocusSession) => boolean;
}

function hasGoal(x: { focusGoalMinutes?: number; focusDeadline?: number }): boolean {
  return typeof x.focusGoalMinutes === 'number' && typeof x.focusDeadline === 'number';
}

/** Sammelt alle aktiven Fokus-Ziele (Fach- und Test-Ziele) für die Übersicht. */
export function collectGoals(subjects: Subject[], grades: Grade[], config?: GradingSystemConfig): ActiveGoal[] {
  const subjectsById = new Map(subjects.map(s => [s.id, s]));
  const goals: ActiveGoal[] = [];

  for (const s of subjects) {
    if (!hasGoal(s)) continue;
    goals.push({
      key: `subject-${s.id}`,
      kind: 'subject',
      subjectId: s.id,
      label: s.name,
      color: s.color,
      goalMinutes: s.focusGoalMinutes!,
      deadline: s.focusDeadline!,
      start: s.focusGoalStart ?? s.createdAt,
      match: f => f.subjectId === s.id,
    });
  }

  for (const g of grades) {
    if (!hasGoal(g)) continue;
    const s = subjectsById.get(g.subjectId);
    goals.push({
      key: `test-${g.id}`,
      kind: 'test',
      subjectId: g.subjectId,
      gradeId: g.id,
      label: `${s?.name ?? 'Fach'} · ${g.title || getKindLabel(g.kind, config)}`,
      color: s?.color ?? '#6366f1',
      goalMinutes: g.focusGoalMinutes!,
      deadline: g.focusDeadline!,
      start: g.focusGoalStart ?? Date.now(),
      match: f => f.gradeId === g.id,
    });
  }

  // Bald fällige zuerst.
  return goals.sort((a, b) => a.deadline - b.deadline);
}
