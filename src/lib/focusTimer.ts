import type { FocusMode } from '@/types';

// ─── Zeit-Formatierung ───────────────────────────────────────────────────────

/** Uhr-Format für laufende Timer: „1:05:09", „25:00", „00:42". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Kompakte Dauer für Statistiken: „2 h 15 min", „45 min", „0 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

// ─── Timer-Zustand (serialisierbar, übersteht Reload/Navigation) ────────────

export const STORAGE_KEY = 'fokus-timer-v1';

/** Eigenes Signal, damit die Seitenleiste sofort auf Start/Pause reagiert. */
export const TIMER_EVENT = 'fokus-timer-change';

export interface TimerState {
  mode: FocusMode;
  subjectId?: string;
  gradeId?: string;
  phase: 'focus' | 'break';
  cycles: number;
  running: boolean;
  segStart: number | null;
  phaseBase: number;
  focusAccum: number;
  sessionStart: number | null;
  pomoFocusMin: number;
  pomoBreakMin: number;
  timerMin: number;
}

export function initialTimer(): TimerState {
  return {
    mode: 'pomodoro',
    subjectId: undefined,
    gradeId: undefined,
    phase: 'focus',
    cycles: 0,
    running: false,
    segStart: null,
    phaseBase: 0,
    focusAccum: 0,
    sessionStart: null,
    pomoFocusMin: 25,
    pomoBreakMin: 5,
    timerMin: 30,
  };
}

export function loadTimer(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialTimer();
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    return { ...initialTimer(), ...parsed };
  } catch {
    return initialTimer();
  }
}

export function saveTimer(tm: TimerState): TimerState {
  try {
    // Wenn nichts läuft und keine Session aktiv → Speicher räumen.
    if (!tm.running && tm.sessionStart == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(tm));
  } catch { /* ignore */ }
  // Seitenleiste (und alles andere im selben Tab) benachrichtigen.
  try { window.dispatchEvent(new Event(TIMER_EVENT)); } catch { /* ignore */ }
  return tm;
}

export function phaseElapsed(tm: TimerState, now: number): number {
  return tm.phaseBase + (tm.running && tm.segStart ? now - tm.segStart : 0);
}

export function phaseTarget(tm: TimerState): number | null {
  if (tm.mode === 'stopwatch') return null;
  if (tm.mode === 'timer') return tm.timerMin * 60000;
  return (tm.phase === 'focus' ? tm.pomoFocusMin : tm.pomoBreakMin) * 60000;
}

export function liveFocusedMs(tm: TimerState, now: number): number {
  return tm.focusAccum + (tm.phase === 'focus' ? phaseElapsed(tm, now) : 0);
}

export function resetKeepingConfig(tm: TimerState): TimerState {
  return {
    ...tm,
    phase: 'focus',
    cycles: 0,
    running: false,
    segStart: null,
    phaseBase: 0,
    focusAccum: 0,
    sessionStart: null,
  };
}
