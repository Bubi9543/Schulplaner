import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Coffee, Brain, Pause } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import {
  type TimerState, TIMER_EVENT, loadTimer,
  formatClock, phaseElapsed, phaseTarget,
} from '@/lib/focusTimer';

/**
 * Kleines Fenster unten in der Seitenleiste, das eine laufende Fokus-Session
 * anzeigt – Fach, mitlaufende Zeit und ein Fortschrittsbalken. Liest denselben
 * `localStorage`-Zustand wie die Fokus-Seite, läuft also überall in der App
 * weiter. Ist keine Session aktiv, zeigt es nichts an.
 */
export function FocusMiniWidget() {
  const subjects = useStore(s => s.subjects);
  const [tm, setTm] = useState<TimerState>(loadTimer);
  const [now, setNow] = useState(() => Date.now());

  // Auf Start/Pause/Fach-Wechsel von der Fokus-Seite reagieren (gleicher Tab),
  // sowie auf Änderungen aus anderen Tabs (`storage`).
  useEffect(() => {
    const resync = () => setTm(loadTimer());
    window.addEventListener(TIMER_EVENT, resync);
    window.addEventListener('storage', resync);
    return () => {
      window.removeEventListener(TIMER_EVENT, resync);
      window.removeEventListener('storage', resync);
    };
  }, []);

  // Mitlaufen, solange der Timer läuft.
  useEffect(() => {
    if (!tm.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [tm.running]);

  const active = tm.running || tm.sessionStart != null;
  const subject = tm.subjectId ? subjects.find(s => s.id === tm.subjectId) : undefined;
  const isBreak = tm.mode === 'pomodoro' && tm.phase === 'break';

  const target = phaseTarget(tm);
  const pe = phaseElapsed(tm, now);
  const displayMs = tm.mode === 'stopwatch' ? pe : Math.max(0, (target ?? 0) - pe);
  const progress = tm.mode === 'stopwatch'
    ? (pe % 60000) / 60000
    : (target ? Math.min(1, pe / target) : 0);
  const color = isBreak ? '#10b981' : (subject?.color ?? 'var(--theme-primary)');

  const phaseLabel = !tm.running ? 'Pausiert' : isBreak ? 'Pause' : 'Fokus';
  const PhaseIcon = !tm.running ? Pause : isBreak ? Coffee : Brain;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <NavLink
            to="/fokus"
            className="block rounded-2xl glass-strong shadow-soft overflow-hidden hover:brightness-[1.02] transition group"
          >
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full flex-shrink-0 ${tm.running ? 'animate-pulse' : ''}`}
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink-900 truncate leading-tight">
                    {subject?.name ?? 'Allgemein'}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: isBreak ? '#10b981' : 'rgb(var(--ink-500))' }}>
                    <PhaseIcon className="size-3" />{phaseLabel}
                  </div>
                </div>
                <ChevronRight className="size-4 text-ink-400 flex-shrink-0 group-hover:translate-x-0.5 group-hover:text-ink-600 transition" />
              </div>

              <div className="font-display font-extrabold tabular-nums text-2xl leading-none text-ink-900 mt-2">
                {formatClock(displayMs)}
              </div>
            </div>

            {/* Fortschrittsbalken unten */}
            <div className="h-1.5 bg-[rgb(var(--ink-200))]">
              <motion.div
                className="h-full rounded-r-full"
                style={{ background: color }}
                animate={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
                transition={{ ease: 'linear', duration: 0.3 }}
              />
            </div>
          </NavLink>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
