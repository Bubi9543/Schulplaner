import { useNavigate } from 'react-router-dom';
import { ChevronRight, GraduationCap, MapPin } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { getCurrentLesson, useTimeNow } from '@/lib/currentLesson';

function fmtRemaining(min: number): string {
  const m = Math.max(0, Math.ceil(min));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}h ${rest}min` : `${h}h`;
  }
  return `${m}min`;
}

/**
 * Live-Aktivität in der Seitenleiste, die – analog zum Fokus-Widget – das
 * gerade laufende Unterrichtsfach laut Stundenplan anzeigt: Fach, Raum,
 * verbleibende Zeit und ein Fortschrittsbalken, der zeigt, wie viel der
 * Stunde schon vorbei ist. Klick führt auf die Fach-Seite. Läuft gerade
 * keine Stunde, zeigt es nichts an.
 */
export function LessonMiniWidget() {
  const lessons = useStore(s => s.lessons);
  const subjects = useStore(s => s.subjects);
  const navigate = useNavigate();
  const now = useTimeNow(15000);

  const current = getCurrentLesson(lessons, subjects, now);
  const color = current?.subject.color ?? 'var(--theme-primary)';

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <button
            type="button"
            onClick={() => navigate(`/noten/${current.subject.id}`)}
            className="block w-full text-left rounded-2xl glass-strong shadow-soft overflow-hidden hover:brightness-[1.02] transition group"
          >
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-2 rounded-full flex-shrink-0 animate-pulse"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink-900 truncate leading-tight">
                    {current.subject.name}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-ink-500">
                    <GraduationCap className="size-3" />
                    Unterricht
                    {current.lesson.room && (
                      <>
                        <span className="opacity-50">·</span>
                        <MapPin className="size-3" />
                        <span className="normal-case tracking-normal truncate">{current.lesson.room}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 text-ink-400 flex-shrink-0 group-hover:translate-x-0.5 group-hover:text-ink-600 transition" />
              </div>

              <div className="font-display font-extrabold tabular-nums text-2xl leading-none text-ink-900 mt-2">
                {fmtRemaining(current.remainingMin)}
                <span className="text-sm font-semibold text-ink-400 ml-1.5">übrig</span>
              </div>
            </div>

            {/* Fortschrittsbalken unten: wie viel der Stunde schon rum ist */}
            <div className="h-1.5 bg-[rgb(var(--ink-200))]">
              <motion.div
                className="h-full rounded-r-full"
                style={{ background: color }}
                animate={{ width: `${Math.max(0, Math.min(100, current.progressPct))}%` }}
                transition={{ ease: 'linear', duration: 0.3 }}
              />
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
