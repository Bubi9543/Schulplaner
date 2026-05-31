import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, Check, Timer as TimerIcon, Hourglass, Infinity as InfinityIcon,
  Brain, Coffee, Flame, Clock, Trash2, BarChart3, Target, ChevronRight,
  Pencil, Plus, Minus, X, Lock, Unlock,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { useStore } from '@/store/useStore';
import { getKindLabel } from '@/lib/grading';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { FocusMode, FocusSession, Grade, Subject } from '@/types';
import { startOfISOWeek, computeStreak } from '@/lib/studyShare';
import { chartTooltipProps } from '@/lib/chartTheme';
import { StudyLeaderboard } from '@/components/StudyLeaderboard';
import { StreakFlame } from '@/components/StreakFlame';
import { SubjectIcon } from '@/components/SubjectIcon';

// ─── Helfer ────────────────────────────────────────────────────────────────

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Kompakte Dauer für Statistiken: „2 h 15 min", „45 min", „0 min". */
function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  } catch { /* ignore */ }
  try { navigator.vibrate?.(200); } catch { /* ignore */ }
}

// ─── Timer-Zustand (serialisierbar, übersteht Reload/Navigation) ────────────

const STORAGE_KEY = 'fokus-timer-v1';

interface TimerState {
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

function initialTimer(): TimerState {
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

function loadTimer(): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialTimer();
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    return { ...initialTimer(), ...parsed };
  } catch {
    return initialTimer();
  }
}

function saveTimer(tm: TimerState): TimerState {
  try {
    // Wenn nichts läuft und keine Session aktiv → Speicher räumen.
    if (!tm.running && tm.sessionStart == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(tm));
  } catch { /* ignore */ }
  return tm;
}

function phaseElapsed(tm: TimerState, now: number): number {
  return tm.phaseBase + (tm.running && tm.segStart ? now - tm.segStart : 0);
}

function phaseTarget(tm: TimerState): number | null {
  if (tm.mode === 'stopwatch') return null;
  if (tm.mode === 'timer') return tm.timerMin * 60000;
  return (tm.phase === 'focus' ? tm.pomoFocusMin : tm.pomoBreakMin) * 60000;
}

function liveFocusedMs(tm: TimerState, now: number): number {
  return tm.focusAccum + (tm.phase === 'focus' ? phaseElapsed(tm, now) : 0);
}

function resetKeepingConfig(tm: TimerState): TimerState {
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

const MODE_META: Record<FocusMode, { label: string; icon: typeof TimerIcon; hint: string }> = {
  pomodoro: { label: 'Pomodoro', icon: Brain, hint: 'Fokus- und Pausenblöcke im Wechsel' },
  timer: { label: 'Timer', icon: Hourglass, hint: 'Countdown auf eine feste Dauer' },
  stopwatch: { label: 'Stoppuhr', icon: InfinityIcon, hint: 'Offen hochzählen, selbst stoppen' },
};

// ─── Fortschritts-Ring ───────────────────────────────────────────────────────

function ProgressRing({ progress, color, size = 264, stroke = 18, children }: {
  progress: number; color: string; size?: number; stroke?: number; children: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          style={{ stroke: 'rgb(var(--ink-300) / 0.35)' }}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          style={{ stroke: color, filter: 'drop-shadow(0 4px 12px rgb(var(--theme-primary-rgb) / 0.25))' }}
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - clamped) }}
          transition={{ ease: 'linear', duration: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export function FokusPage() {
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const focusSessions = useStore(s => s.focusSessions);
  const settings = useStore(s => s.settings);
  const addFocusSession = useStore(s => s.addFocusSession);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;

  const [tm, setTm] = useState<TimerState>(loadTimer);
  const [now, setNow] = useState(() => Date.now());

  // Versteckter „Ehrlichkeits"-Schalter: 5× auf die „Letzte Sessions"-Überschrift
  // tippen, um beim Bearbeiten auch das Verlängern der Zeit freizuschalten.
  const [extendUnlocked, setExtendUnlocked] = useState(false);
  const unlockClicks = useRef(0);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSecretTap = useCallback(() => {
    if (extendUnlocked) return;
    unlockClicks.current += 1;
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => { unlockClicks.current = 0; }, 1500);
    if (unlockClicks.current >= 5) {
      setExtendUnlocked(true);
      unlockClicks.current = 0;
    }
  }, [extendUnlocked]);

  const update = useCallback((fn: (s: TimerState) => TimerState) => {
    setTm(prev => saveTimer(fn(prev)));
  }, []);

  // Tick, solange etwas läuft.
  useEffect(() => {
    if (!tm.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [tm.running]);

  const subject = tm.subjectId ? subjects.find(s => s.id === tm.subjectId) : undefined;
  const linkedGrade = tm.gradeId ? grades.find(g => g.id === tm.gradeId) : undefined;
  const active = tm.running || tm.sessionStart != null;

  const finishSession = useCallback(async (focusedMsOverride?: number) => {
    setTm(prev => {
      const focused = focusedMsOverride ?? liveFocusedMs(prev, Date.now());
      if (focused >= 1000) {
        const start = prev.sessionStart ?? (Date.now() - focused);
        void addFocusSession({
          subjectId: prev.subjectId,
          gradeId: prev.gradeId,
          mode: prev.mode,
          focusedMs: focused,
          startedAt: start,
          endedAt: Date.now(),
        });
      }
      return saveTimer(resetKeepingConfig(prev));
    });
  }, [addFocusSession]);

  // Phasenübergänge / Timer-Ende.
  useEffect(() => {
    if (!tm.running) return;
    const target = phaseTarget(tm);
    if (target == null) return; // Stoppuhr läuft offen
    const pe = phaseElapsed(tm, now);
    if (pe < target) return;

    if (tm.mode === 'timer') {
      playChime();
      void finishSession(target);
      return;
    }
    // Pomodoro
    if (tm.phase === 'focus') {
      playChime();
      update(s => ({ ...s, focusAccum: s.focusAccum + target, cycles: s.cycles + 1, phase: 'break', phaseBase: 0, segStart: Date.now() }));
    } else {
      playChime();
      update(s => ({ ...s, phase: 'focus', phaseBase: 0, segStart: Date.now() }));
    }
  }, [now, tm, finishSession, update]);

  // ── Timer-Steuerung ──
  const start = () => update(s => ({ ...s, running: true, segStart: Date.now(), sessionStart: s.sessionStart ?? Date.now() }));
  const pause = () => update(s => ({ ...s, running: false, phaseBase: phaseElapsed(s, Date.now()), segStart: null }));
  const reset = () => update(s => resetKeepingConfig(s));
  const skipBreak = () => update(s => ({ ...s, phase: 'focus', phaseBase: 0, segStart: s.running ? Date.now() : null }));

  // ── Anzeige-Werte ──
  const target = phaseTarget(tm);
  const pe = phaseElapsed(tm, now);
  const displayMs = tm.mode === 'stopwatch' ? pe : Math.max(0, (target ?? 0) - pe);
  const progress = tm.mode === 'stopwatch' ? (pe % 60000) / 60000 : (target ? pe / target : 0);
  const isBreak = tm.mode === 'pomodoro' && tm.phase === 'break';
  const ringColor = isBreak ? '#10b981' : (subject?.color ?? 'var(--theme-primary)');
  const sessionFocused = liveFocusedMs(tm, now);

  // ── Statistik (aktuelles Schuljahr) ──
  const weekStart = startOfISOWeek(now);
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, [now]);

  const stats = useMemo(() => {
    let week = 0, today = 0, all = 0;
    for (const f of focusSessions) {
      all += f.focusedMs;
      if (f.startedAt >= weekStart) week += f.focusedMs;
      if (f.startedAt >= todayStart) today += f.focusedMs;
    }
    return { week, today, all };
  }, [focusSessions, weekStart, todayStart]);

  // Lern-Streak: aufeinanderfolgende Tage mit Lernzeit.
  const streak = useMemo(() => computeStreak(focusSessions, now), [focusSessions, now]);
  const studiedToday = stats.today > 0;

  // Lernzeit pro Fach (gesamt)
  const perSubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of focusSessions) {
      if (!f.subjectId) continue;
      map.set(f.subjectId, (map.get(f.subjectId) ?? 0) + f.focusedMs);
    }
    return [...map.entries()]
      .map(([id, ms]) => ({ subject: subjects.find(s => s.id === id), ms }))
      .filter((x): x is { subject: Subject; ms: number } => !!x.subject)
      .sort((a, b) => b.ms - a.ms);
  }, [focusSessions, subjects]);

  // Lernzeit pro Test (verknüpfte Grades)
  const perTest = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of focusSessions) {
      if (!f.gradeId) continue;
      map.set(f.gradeId, (map.get(f.gradeId) ?? 0) + f.focusedMs);
    }
    return [...map.entries()]
      .map(([id, ms]) => ({ grade: grades.find(g => g.id === id), ms }))
      .filter((x): x is { grade: Grade; ms: number } => !!x.grade)
      .sort((a, b) => {
        // Anstehende Tests zuerst, dann nach Lernzeit
        const ap = a.grade.isPending ? 0 : 1;
        const bp = b.grade.isPending ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return b.ms - a.ms;
      });
  }, [focusSessions, grades]);

  // 7-Tage-Wochenbalken (Mo–So)
  const weekBars = useMemo(() => {
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const bars = labels.map((label, i) => ({ label, ms: 0, dayStart: weekStart + i * 86400000 }));
    for (const f of focusSessions) {
      const idx = Math.floor((f.startedAt - weekStart) / 86400000);
      if (idx >= 0 && idx < 7) bars[idx].ms += f.focusedMs;
    }
    return bars.map(b => ({ label: b.label, min: Math.round(b.ms / 60000) }));
  }, [focusSessions, weekStart]);

  // Tests des gewählten Fachs für den Selektor
  const subjectTests = useMemo(() => {
    if (!tm.subjectId) return [];
    return grades
      .filter(g => g.subjectId === tm.subjectId)
      .sort((a, b) => {
        const ap = a.isPending ? 0 : 1;
        const bp = b.isPending ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b.date ?? 0) - (a.date ?? 0);
      });
  }, [grades, tm.subjectId]);

  const hasSessions = focusSessions.length > 0;

  return (
    <PageShell
      title="Fokus"
      subtitle="Lern-Sessions starten und deine Konzentration tracken"
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">

        {/* ─── Timer-Hero ─── */}
        <Card delay={0} className="col-span-12 lg:col-span-7 overflow-hidden">
          {/* Modus-Umschalter */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[rgb(var(--ink-200)/0.5)] w-fit mx-auto mb-5">
            {(Object.keys(MODE_META) as FocusMode[]).map(m => {
              const M = MODE_META[m];
              const isActive = tm.mode === m;
              return (
                <button
                  key={m}
                  disabled={active}
                  onClick={() => update(s => ({ ...resetKeepingConfig(s), mode: m }))}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${isActive ? 'text-white' : 'text-ink-600 hover:text-ink-900'}`}
                >
                  {isActive && <motion.span layoutId="fokus-mode" className="absolute inset-0 rounded-xl theme-gradient shadow-glow" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
                  <span className="relative flex items-center gap-1.5"><M.icon className="size-4" />{M.label}</span>
                </button>
              );
            })}
          </div>

          {/* Ring */}
          <div className="flex flex-col items-center">
            <ProgressRing progress={progress} color={ringColor}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={isBreak ? 'break' : 'focus'}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-1"
                    style={{ color: isBreak ? '#10b981' : 'rgb(var(--ink-400))' }}>
                    {isBreak ? <><Coffee className="size-3.5" />Pause</> : tm.mode === 'pomodoro' ? <><Brain className="size-3.5" />Fokus</> : MODE_META[tm.mode].label}
                  </div>
                  <div className="font-display font-extrabold tabular-nums text-6xl md:text-7xl leading-none text-ink-900">
                    {formatClock(displayMs)}
                  </div>
                  {tm.mode === 'pomodoro' && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {Array.from({ length: Math.max(4, tm.cycles + (tm.cycles >= 4 ? 1 : 0)) }).slice(0, 8).map((_, i) => (
                        <span key={i} className={`size-2 rounded-full transition ${i < tm.cycles ? '' : 'bg-[rgb(var(--ink-300))]'}`}
                          style={i < tm.cycles ? { background: 'var(--theme-primary)' } : undefined} />
                      ))}
                    </div>
                  )}
                  {tm.mode !== 'pomodoro' && active && (
                    <div className="text-xs text-ink-500 mt-2">{formatDuration(sessionFocused)} fokussiert</div>
                  )}
                </motion.div>
              </AnimatePresence>
            </ProgressRing>

            {/* Steuerung */}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={reset}
                disabled={!active}
                className="size-12 grid place-items-center rounded-full bg-[rgb(var(--ink-200))] text-ink-600 hover:bg-[rgb(var(--ink-300))] transition disabled:opacity-30"
                title="Zurücksetzen"
              >
                <RotateCcw className="size-5" />
              </button>

              {tm.running ? (
                <button onClick={pause} className="h-16 px-8 rounded-full theme-gradient text-white font-bold text-lg shadow-glow flex items-center gap-2 hover:brightness-105 transition">
                  <Pause className="size-6" />Pause
                </button>
              ) : (
                <button onClick={start} className="h-16 px-8 rounded-full theme-gradient text-white font-bold text-lg shadow-glow flex items-center gap-2 hover:brightness-105 transition">
                  <Play className="size-6" />{active ? 'Weiter' : 'Start'}
                </button>
              )}

              <button
                onClick={() => finishSession()}
                disabled={!active}
                className="size-12 grid place-items-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition disabled:opacity-30"
                title="Session beenden & speichern"
              >
                <Check className="size-5" />
              </button>
            </div>

            {isBreak && (
              <button onClick={skipBreak} className="mt-3 text-xs font-semibold text-ink-500 hover:text-ink-800 transition flex items-center gap-1">
                Pause überspringen <ChevronRight className="size-3.5" />
              </button>
            )}
          </div>

          {/* Dauer-Presets */}
          {!active && (
            <div className="mt-6 pt-4 border-t border-[rgb(var(--ink-200)/0.6)]">
              {tm.mode === 'pomodoro' && (
                <div className="space-y-2">
                  <PresetRow label="Fokus" value={tm.pomoFocusMin} options={[15, 25, 30, 45, 50]} onPick={v => update(s => ({ ...s, pomoFocusMin: v }))} />
                  <PresetRow label="Pause" value={tm.pomoBreakMin} options={[5, 10, 15]} onPick={v => update(s => ({ ...s, pomoBreakMin: v }))} />
                </div>
              )}
              {tm.mode === 'timer' && (
                <PresetRow label="Dauer" value={tm.timerMin} options={[10, 15, 25, 30, 45, 60, 90]} onPick={v => update(s => ({ ...s, timerMin: v }))} />
              )}
              {tm.mode === 'stopwatch' && (
                <p className="text-center text-xs text-ink-500">Die Stoppuhr zählt offen hoch – beende die Session mit dem grünen Haken.</p>
              )}
            </div>
          )}
        </Card>

        {/* ─── Fach + Test Auswahl & Wochen-Überblick ─── */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 md:gap-5">
          <Card delay={0.05}>
            <h3 className="h3 mb-1 flex items-center gap-2"><Target className="size-5" style={{ color: 'var(--theme-primary)' }} />Woran arbeitest du?</h3>
            <p className="subtle mb-3 text-xs">Optional – dann landet die Zeit in deinen Statistiken.</p>

            {subjects.length === 0 ? (
              <p className="text-sm text-ink-500">Leg zuerst ein Fach an, um Sessions zuzuordnen.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => update(s => ({ ...s, subjectId: undefined, gradeId: undefined }))}
                    disabled={active}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition disabled:opacity-50 ${!tm.subjectId ? 'text-white' : ''}`}
                    style={!tm.subjectId
                      ? { background: 'rgb(var(--ink-500))', borderColor: 'rgb(var(--ink-500))' }
                      : { borderColor: 'rgb(var(--ink-300))', color: 'rgb(var(--ink-600))' }}
                  >
                    Allgemein
                  </button>
                  {subjects.map(s => {
                    const sel = tm.subjectId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => update(t => ({ ...t, subjectId: s.id, gradeId: undefined }))}
                        disabled={active}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                        style={sel
                          ? { background: s.color, borderColor: s.color, color: 'white' }
                          : { borderColor: s.color, color: s.color }}
                      >
                        {sel ? <Check className="size-3" /> : <SubjectIcon subject={s} className="size-3.5" />}{s.name}
                      </button>
                    );
                  })}
                </div>

                {tm.subjectId && subjectTests.length > 0 && (
                  <div className="mt-3">
                    <label className="label text-xs">Test / Prüfung (optional)</label>
                    <select
                      value={tm.gradeId ?? ''}
                      onChange={e => update(s => ({ ...s, gradeId: e.target.value || undefined }))}
                      disabled={active}
                      className="input mt-1 text-sm disabled:opacity-50"
                    >
                      <option value="">Kein bestimmter Test</option>
                      {subjectTests.map(g => (
                        <option key={g.id} value={g.id}>
                          {(g.title || getKindLabel(g.kind, config))}
                          {g.isPending ? ' · geplant' : ''}
                          {g.date ? ` · ${new Date(g.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {active && (subject || linkedGrade) && (
                  <div className="mt-3 text-xs text-ink-500 flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full animate-pulse" style={{ background: subject?.color ?? 'var(--theme-primary)' }} />
                    Läuft für <strong className="text-ink-700">{subject?.name ?? 'Allgemein'}</strong>
                    {linkedGrade && <>· {linkedGrade.title || getKindLabel(linkedGrade.kind, config)}</>}
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Wochen-Überblick */}
          <Card delay={0.1}>
            {/* Streak-Banner */}
            <div className="flex items-center gap-3 mb-4 rounded-2xl p-3 bg-gradient-to-r from-orange-500/10 to-amber-400/10 border border-orange-500/20">
              <StreakFlame size={34} active={streak > 0} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display font-extrabold text-2xl leading-none tabular-nums text-ink-900">{streak}</span>
                  <span className="text-sm font-semibold text-ink-600">{streak === 1 ? 'Tag' : 'Tage'} Streak</span>
                </div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  {streak === 0
                    ? 'Lern heute, um eine Streak zu starten 🔥'
                    : studiedToday
                      ? 'Stark – heute schon dabei! Bleib dran.'
                      : 'Heute noch nicht gelernt – halt die Flamme am Leben!'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatMini icon={Clock} label="Heute" value={formatDuration(stats.today)} />
              <StatMini icon={Flame} label="Diese Woche" value={formatDuration(stats.week)} highlight />
              <StatMini icon={BarChart3} label="Gesamt" value={formatDuration(stats.all)} />
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekBars} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="rgb(var(--ink-200) / 0.5)" vertical={false} />
                  <XAxis dataKey="label" stroke="rgb(var(--ink-400))" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis stroke="rgb(var(--ink-400))" tickLine={false} axisLine={false} fontSize={10} width={32} unit="m" />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--theme-primary-rgb) / 0.08)' }}
                    {...chartTooltipProps}
                    formatter={(v: unknown) => [`${typeof v === 'number' ? v : 0} min`, 'Lernzeit']}
                  />
                  <Bar dataKey="min" radius={[8, 8, 2, 2]} fill="var(--theme-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* ─── Lernzeit pro Fach ─── */}
        <Card delay={0.15} className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-3 flex items-center gap-2"><BarChart3 className="size-5" style={{ color: 'var(--theme-primary)' }} />Lernzeit pro Fach</h3>
          {perSubject.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">Noch keine fachbezogenen Sessions.</p>
          ) : (
            <ul className="space-y-2.5">
              {perSubject.slice(0, 8).map(({ subject: s, ms }) => {
                const max = perSubject[0].ms || 1;
                return (
                  <li key={s.id}>
                    <Link to={`/noten/${s.id}`} className="block group">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-semibold text-ink-800 flex items-center gap-2">
                          <span className="size-3 rounded-full" style={{ background: s.color }} />{s.name}
                        </span>
                        <span className="text-ink-500 tabular-nums">{formatDuration(ms)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[rgb(var(--ink-200))] overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ background: s.color }}
                          initial={{ width: 0 }} animate={{ width: `${(ms / max) * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ─── Lernzeit pro Test ─── */}
        <Card delay={0.2} className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-3 flex items-center gap-2"><Target className="size-5" style={{ color: 'var(--theme-primary)' }} />Lernzeit pro Test</h3>
          {perTest.length === 0 ? (
            <p className="text-sm text-ink-500 py-6 text-center">Wähle vor einer Session einen Test, um hier zu sehen, wie viel du dafür gelernt hast.</p>
          ) : (
            <ul className="space-y-2">
              {perTest.slice(0, 6).map(({ grade: g, ms }) => {
                const s = subjects.find(x => x.id === g.subjectId);
                return (
                  <li key={g.id}>
                    <Link to={s ? `/noten/${s.id}` : '/fokus'} className="flex items-center gap-3 rounded-2xl p-2.5 bg-[rgb(var(--surface-rgb))] hover:bg-[rgb(var(--ink-100))] transition">
                      <div className="size-10 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: s?.color ?? 'var(--theme-primary)' }}>
                        <SubjectIcon subject={s ?? {}} className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-ink-800 truncate text-sm">{g.title || getKindLabel(g.kind, config)}</div>
                        <div className="text-xs text-ink-500">
                          {s?.name ?? 'Fach'}{g.isPending ? ' · geplant' : ''}{g.date ? ` · ${new Date(g.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : ''}
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--theme-primary)' }}>{formatDuration(ms)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ─── Wöchentliche Rangliste ─── */}
        <div className="col-span-12 md:col-span-6">
          <StudyLeaderboard weekTotalMs={stats.week} weekStart={weekStart} />
        </div>

        {/* ─── Letzte Sessions ─── */}
        <Card delay={0.3} className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-3 flex items-center gap-2">
            {/* Die Überschrift ist der versteckte 5-Tap-Schalter. */}
            <button
              onClick={handleSecretTap}
              className="flex items-center gap-2 select-none cursor-default"
              title={extendUnlocked ? 'Zeit-Verlängern ist freigeschaltet' : undefined}
            >
              <Clock className="size-5" style={{ color: 'var(--theme-primary)' }} />Letzte Sessions
            </button>
            {extendUnlocked && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-500" title="Beim Bearbeiten lässt sich die Zeit jetzt auch verlängern.">
                <Unlock className="size-3" />offen
              </span>
            )}
          </h3>
          {!hasSessions ? (
            <Empty icon={TimerIcon} title="Noch keine Sessions" description="Starte deinen ersten Fokus-Timer oben." />
          ) : (
            <ul className="space-y-1.5">
              {focusSessions.slice(0, 8).map(f => <SessionRow key={f.id} session={f} extendUnlocked={extendUnlocked} />)}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

// ─── Sub-Komponenten ──────────────────────────────────────────────────────

function PresetRow({ label, value, options, onPick }: { label: string; value: number; options: number[]; onPick: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-ink-500 w-12 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const sel = o === value;
          return (
            <button key={o} onClick={() => onPick(o)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${sel ? 'text-white' : 'bg-[rgb(var(--ink-200))] text-ink-600 hover:bg-[rgb(var(--ink-300))]'}`}
              style={sel ? { background: 'var(--theme-primary)' } : undefined}>
              {o} min
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatMini({ icon: Icon, label, value, highlight }: { icon: typeof Clock; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${highlight ? 'theme-gradient text-white shadow-glow' : 'bg-[rgb(var(--ink-100))]'}`}>
      <Icon className={`size-4 mx-auto mb-1 ${highlight ? 'text-white/90' : 'text-ink-400'}`} />
      <div className={`text-sm font-display font-extrabold leading-tight ${highlight ? '' : 'text-ink-900'}`}>{value}</div>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${highlight ? 'text-white/80' : 'text-ink-500'}`}>{label}</div>
    </div>
  );
}

function SessionRow({ session, extendUnlocked }: { session: FocusSession; extendUnlocked: boolean }) {
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const settings = useStore(s => s.settings);
  const updateFocusSession = useStore(s => s.updateFocusSession);
  const deleteFocusSession = useStore(s => s.deleteFocusSession);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const s = session.subjectId ? subjects.find(x => x.id === session.subjectId) : undefined;
  const g = session.gradeId ? grades.find(x => x.id === session.gradeId) : undefined;
  const ModeIcon = MODE_META[session.mode].icon;

  if (editing) {
    return (
      <SessionEditor
        session={session}
        extendUnlocked={extendUnlocked}
        onClose={() => setEditing(false)}
        onSave={patch => { void updateFocusSession(session.id, patch); setEditing(false); }}
      />
    );
  }

  if (confirm) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-2xl p-2.5 bg-rose-50 border border-rose-200">
        <span className="text-sm text-rose-700 font-medium">Session löschen?</span>
        <div className="flex gap-1.5">
          <button onClick={() => { void deleteFocusSession(session.id); }} className="px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-bold">Ja</button>
          <button onClick={() => setConfirm(false)} className="px-3 py-1 rounded-lg bg-white text-ink-600 text-xs font-bold border">Nein</button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 rounded-2xl p-2.5 bg-[rgb(var(--surface-rgb))] hover:bg-[rgb(var(--ink-100))] transition">
      <div className="size-9 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: s?.color ?? 'rgb(var(--ink-400))' }}>
        <ModeIcon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink-800 truncate text-sm">
          {s?.name ?? 'Allgemein'}{g && <span className="text-ink-500 font-normal"> · {g.title || getKindLabel(g.kind, config)}</span>}
        </div>
        <div className="text-xs text-ink-500">
          {new Date(session.startedAt).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
          {' · '}{MODE_META[session.mode].label}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums text-ink-700 flex-shrink-0">{formatDuration(session.focusedMs)}</span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition text-ink-400 hover:text-[var(--theme-primary)] flex-shrink-0" title="Bearbeiten">
        <Pencil className="size-4" />
      </button>
      <button onClick={() => setConfirm(true)} className="opacity-0 group-hover:opacity-100 transition text-ink-400 hover:text-rose-500 flex-shrink-0" title="Löschen">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

// ─── Session-Editor ──────────────────────────────────────────────────────────

function SessionEditor({ session, extendUnlocked, onClose, onSave }: {
  session: FocusSession;
  extendUnlocked: boolean;
  onClose: () => void;
  onSave: (patch: Partial<FocusSession>) => void;
}) {
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const settings = useStore(s => s.settings);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;

  const [subjectId, setSubjectId] = useState<string | undefined>(session.subjectId);
  const [gradeId, setGradeId] = useState<string | undefined>(session.gradeId);
  const originalMin = Math.max(1, Math.round(session.focusedMs / 60000));
  const [minutes, setMinutes] = useState(originalMin);

  // Ohne Freischaltung lässt sich die Zeit nur verkürzen.
  const maxMin = extendUnlocked ? 24 * 60 : originalMin;

  const subjectTests = useMemo(() => {
    if (!subjectId) return [];
    return grades
      .filter(gr => gr.subjectId === subjectId)
      .sort((a, b) => {
        const ap = a.isPending ? 0 : 1;
        const bp = b.isPending ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (b.date ?? 0) - (a.date ?? 0);
      });
  }, [grades, subjectId]);

  const clamp = (v: number) => Math.max(1, Math.min(maxMin, v));
  const save = () => {
    const m = clamp(minutes);
    onSave({ subjectId, gradeId, focusedMs: m * 60000, endedAt: session.startedAt + m * 60000 });
  };

  return (
    <li className="rounded-2xl p-3 bg-[rgb(var(--ink-100))] border border-[rgb(var(--ink-200))] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Session bearbeiten</span>
        <button onClick={onClose} className="text-ink-400 hover:text-ink-700 transition" title="Abbrechen"><X className="size-4" /></button>
      </div>

      {/* Fach */}
      <div>
        <label className="label text-xs">Fach</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <button
            onClick={() => { setSubjectId(undefined); setGradeId(undefined); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-2 transition ${!subjectId ? 'text-white' : ''}`}
            style={!subjectId
              ? { background: 'rgb(var(--ink-500))', borderColor: 'rgb(var(--ink-500))' }
              : { borderColor: 'rgb(var(--ink-300))', color: 'rgb(var(--ink-600))' }}
          >
            Allgemein
          </button>
          {subjects.map(sub => {
            const sel = subjectId === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => { setSubjectId(sub.id); setGradeId(undefined); }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border-2 transition inline-flex items-center gap-1.5"
                style={sel
                  ? { background: sub.color, borderColor: sub.color, color: 'white' }
                  : { borderColor: sub.color, color: sub.color }}
              >
                {sel ? <Check className="size-3" /> : <SubjectIcon subject={sub} className="size-3" />}{sub.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Test */}
      {subjectId && subjectTests.length > 0 && (
        <div>
          <label className="label text-xs">Test / Prüfung</label>
          <select
            value={gradeId ?? ''}
            onChange={e => setGradeId(e.target.value || undefined)}
            className="input mt-1 text-sm"
          >
            <option value="">Kein bestimmter Test</option>
            {subjectTests.map(gr => (
              <option key={gr.id} value={gr.id}>
                {(gr.title || getKindLabel(gr.kind, config))}
                {gr.isPending ? ' · geplant' : ''}
                {gr.date ? ` · ${new Date(gr.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Dauer */}
      <div>
        <label className="label text-xs flex items-center gap-1.5">
          Dauer (Minuten)
          {extendUnlocked
            ? <span className="inline-flex items-center gap-1 text-amber-500"><Unlock className="size-3" />verlängern frei</span>
            : <span className="inline-flex items-center gap-1 text-ink-400"><Lock className="size-3" />nur kürzer</span>}
        </label>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setMinutes(m => clamp(m - 5))}
            className="size-9 grid place-items-center rounded-lg bg-[rgb(var(--ink-200))] text-ink-600 hover:bg-[rgb(var(--ink-300))] transition"
            title="−5 min"
          ><Minus className="size-4" /></button>
          <input
            type="number"
            value={minutes}
            min={1}
            max={maxMin}
            onChange={e => setMinutes(clamp(Number(e.target.value) || 1))}
            className="input text-sm text-center tabular-nums w-20"
          />
          <button
            onClick={() => setMinutes(m => clamp(m + 5))}
            disabled={minutes >= maxMin}
            className="size-9 grid place-items-center rounded-lg bg-[rgb(var(--ink-200))] text-ink-600 hover:bg-[rgb(var(--ink-300))] transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="+5 min"
          ><Plus className="size-4" /></button>
          <span className="text-xs text-ink-500">von {originalMin} min</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[rgb(var(--ink-200))] text-ink-700 text-xs font-bold hover:bg-[rgb(var(--ink-300))] transition">Abbrechen</button>
        <button onClick={save} className="px-3 py-1.5 rounded-lg theme-gradient text-white text-xs font-bold shadow-glow hover:brightness-105 transition inline-flex items-center gap-1.5"><Check className="size-3.5" />Speichern</button>
      </div>
    </li>
  );
}
