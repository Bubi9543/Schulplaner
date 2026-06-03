import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, MapPin, Coffee } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { buildTodayTimeline, getCurrentLesson, nowToMinutes, timeToMinutes, useTimeNow } from '@/lib/currentLesson';
import { useIsHoliday } from '@/lib/useHolidays';
import { useAnimationLevel, microMotionEnabled } from '@/lib/animation';
import { Empty } from '@/components/Empty';
import { SubjectIcon } from '@/components/SubjectIcon';
import { CalendarOff, Palmtree } from 'lucide-react';

function fmtMinutes(m: number): string {
  const sign = m < 0;
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = Math.round(abs % 60);
  if (h && min) return `${sign ? '−' : ''}${h}h ${min}min`;
  if (h) return `${sign ? '−' : ''}${h}h`;
  return `${sign ? '−' : ''}${min}min`;
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const MIN_PER_PX = 1.4;

export function TodayTimeline({ height }: { height?: number }) {
  const lessons = useStore(s => s.lessons);
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const nav = useNavigate();
  const now = useTimeNow(15000);
  const level = useAnimationLevel();
  const containerRef = useRef<HTMLDivElement>(null);
  const isHolidayToday = useIsHoliday(now);

  const slots = buildTodayTimeline(lessons, subjects, now);
  const current = getCurrentLesson(lessons, subjects, now);
  const todayLessons = slots.filter(s => s.kind === 'lesson');

  // ── WICHTIG: Alle Hooks + Layout-Werte VOR den Früh-Returns berechnen,
  //    damit die Hook-Reihenfolge über alle Renders konstant bleibt
  //    (Rules of Hooks). Sonst crasht die Komponente, sobald isHolidayToday
  //    oder die Stundenanzahl async umschalten ("Rendered fewer hooks than
  //    expected") – das hat den schwarzen Bildschirm verursacht.
  const hasLessons = todayLessons.length > 0;
  const dayStartMin = hasLessons
    ? Math.min(timeToMinutes(settings?.schoolStart ?? '08:00'), todayLessons[0].start) - 15
    : 0;
  const dayEndMin = hasLessons
    ? Math.max(timeToMinutes(settings?.schoolEnd ?? '17:00'), todayLessons[todayLessons.length - 1].end) + 15
    : 0;
  const totalMin = Math.max(1, dayEndMin - dayStartMin);
  const computedHeight = Math.max(360, totalMin / MIN_PER_PX);
  const finalHeight = height ?? computedHeight;
  const minToPx = (m: number) => ((m - dayStartMin) / totalMin) * finalHeight;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(dayStartMin / 60) * 60; m <= dayEndMin; m += 60) hourMarks.push(m);

  const nowMin = nowToMinutes(now);
  const showNowLine = nowMin >= dayStartMin && nowMin <= dayEndMin;

  useEffect(() => {
    if (!containerRef.current || !showNowLine || !hasLessons || isHolidayToday) return;
    const target = minToPx(nowMin) - 80;
    containerRef.current.scrollTo({ top: Math.max(0, target), behavior: level === 'minimal' ? 'auto' : 'smooth' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Früh-Returns erst NACH allen Hooks.
  // In den Ferien läuft der Stundenplan nicht.
  if (isHolidayToday) {
    return (
      <div className="py-4">
        <Empty icon={Palmtree} title="Ferien" description="Schulfrei – heute steht kein Unterricht an. Erhol dich gut!" />
      </div>
    );
  }

  if (!hasLessons) {
    return (
      <div className="py-4">
        <Empty icon={CalendarOff} title="Heute keine Stunden" description="Genieße den freien Tag oder plane was Schönes." />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative overflow-y-auto no-scrollbar" style={{ maxHeight: 540 }}>
      <div className="relative" style={{ height: finalHeight, paddingLeft: 56 }}>
        {hourMarks.map(m => (
          <div key={m} className="absolute left-0 right-0" style={{ top: minToPx(m) }}>
            <div className="absolute -translate-y-1/2 left-0 text-[11px] font-semibold text-ink-400 w-12 text-right pr-2">{fmtTime(m)}</div>
            <div className="absolute left-14 right-0 border-t border-dashed border-ink-200/70" />
          </div>
        ))}

        {slots.map((slot, i) => {
          const top = minToPx(slot.start);
          const heightPx = ((slot.end - slot.start) / totalMin) * finalHeight;
          if (slot.kind === 'break') {
            if (slot.durationMin < 5) return null;
            return (
              <div key={`break-${i}`} className="absolute left-14 right-0 flex items-center gap-1 text-[10px] text-ink-400" style={{ top: top + 2, height: heightPx - 4 }}>
                <Coffee className="size-3" />
                <span>Pause · {fmtMinutes(slot.durationMin)}</span>
              </div>
            );
          }
          const subj = slot.subject;
          if (!subj || !slot.lesson) return null;
          const isCurrent = current?.lesson.id === slot.lesson.id;
          const isPast = slot.end <= nowMin;
          const elapsed = isCurrent ? Math.max(0, Math.min(1, (nowMin - slot.start) / Math.max(1, slot.durationMin))) : 0;

          return (
            <motion.button
              key={slot.lesson.id}
              onClick={() => nav(`/noten/${subj.id}`)}
              initial={microMotionEnabled(level) ? { opacity: 0, x: 8 } : { opacity: 0 }}
              animate={{ opacity: isPast ? 0.55 : 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              whileHover={microMotionEnabled(level) ? { scale: 1.015 } : undefined}
              className={`absolute left-14 right-1 rounded-2xl text-white text-left overflow-hidden ${isCurrent ? 'ring-2 ring-white shadow-glow' : 'shadow-soft'}`}
              style={{
                top, height: Math.max(28, heightPx - 4),
                background: `linear-gradient(135deg, ${subj.color}, ${subj.color}cc)`,
              }}
            >
              <div className="relative h-full p-2 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] opacity-90 flex items-center justify-between">
                    <span>{slot.lesson.start} – {slot.lesson.end}</span>
                    {isPast && !isCurrent && <Check className="size-3" />}
                    {isCurrent && <span className="px-1.5 py-0.5 rounded-full bg-white/30 text-[9px] font-bold">LIVE</span>}
                  </div>
                  <div className="font-display font-bold text-sm leading-tight mt-0.5 truncate flex items-center gap-1.5"><SubjectIcon subject={subj} className="size-3.5 flex-shrink-0" />{subj.name}</div>
                  {(slot.lesson.room ?? subj.room) && (
                    <div className="text-[10px] opacity-90 flex items-center gap-1 mt-0.5">
                      <MapPin className="size-2.5" />{slot.lesson.room ?? subj.room}
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <div className="relative">
                    <div className="text-[10px] opacity-90 text-right">Noch {fmtMinutes(current!.remainingMin)}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                      <motion.div
                        className="h-full bg-white rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${elapsed * 100}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}

        {showNowLine && (
          <motion.div
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{ top: minToPx(nowMin) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="absolute left-0 right-0 h-[2px] bg-rose-500 -translate-y-1/2" />
            <motion.div
              className="absolute left-14 -translate-y-1/2 size-3 rounded-full bg-rose-500"
              animate={microMotionEnabled(level) ? { boxShadow: ['0 0 0 0px rgba(244,63,94,.6)', '0 0 0 8px rgba(244,63,94,0)'] } : undefined}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <div className="absolute left-0 -translate-y-1/2 w-12 text-right pr-2 text-[10px] font-bold text-rose-600">{fmtTime(nowMin)}</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
