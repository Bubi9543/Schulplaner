import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap, ListChecks, CalendarDays, Cloud, Share2, ChevronRight, X, Sparkles, TrendingUp, Check, MapPin,
  NotebookPen, ClipboardCheck, Target,
} from 'lucide-react';

/**
 * Schön animierte Tour, die nach dem Onboarding einmal pro Gerät gezeigt wird.
 * Zeigt die wichtigsten Features mit großen visuellen Demos – kein langweiliger
 * Wall-of-Text.
 *
 * Persistenz: localStorage-Key `notenapp.tourDismissed = '1'`.
 */

const STORAGE_KEY = 'notenapp.tourDismissed';

export function shouldShowTour(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

export function dismissTour(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, '1');
}

/** Manuell wieder aktivieren (z. B. für „Tour erneut anzeigen"-Button irgendwann). */
export function resetTour(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

interface SlideDef {
  icon: typeof GraduationCap;
  title: string;
  subtitle: string;
  gradient: string;
  Visual: React.ComponentType;
}

const SLIDES: SlideDef[] = [
  {
    icon: GraduationCap,
    title: 'Alle Noten im Blick',
    subtitle: 'Notenschnitt, Trends und Verlauf – pro Fach und insgesamt. Mit per-Note-Gewichtung.',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    Visual: GradesVisual,
  },
  {
    icon: ListChecks,
    title: 'Aufgaben & Kalender',
    subtitle: 'Hausaufgaben, Tests und Projekte – als Liste oder im Monatsraster. Überfällig automatisch markiert.',
    gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)',
    Visual: TasksVisual,
  },
  {
    icon: CalendarDays,
    title: 'Stundenplan teilen',
    subtitle: 'Mit deinen Freunden in der Klasse über einen 4-stelligen Code. Ein Stundenplan für alle.',
    gradient: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    Visual: ScheduleShareVisual,
  },
  {
    icon: Cloud,
    title: 'Überall synchron',
    subtitle: 'Cloud-Sync zwischen Geräten in Echtzeit. Plus Kalender-Abo für Google Calendar & Apple Kalender.',
    gradient: 'linear-gradient(135deg, #10b981, #0d9488)',
    Visual: CloudVisual,
  },
];

export function WelcomeTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const total = SLIDES.length;
  const slide = SLIDES[step];

  function next() {
    if (step === total - 1) {
      dismissTour();
      onFinish();
    } else {
      setStep(s => s + 1);
    }
  }
  function skip() {
    dismissTour();
    onFinish();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const Icon = slide.icon;
  const Visual = slide.Visual;

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden">
      {/* Hintergrund: pro Slide eigene Farbe */}
      <motion.div
        key={`bg-${step}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0"
        style={{ background: slide.gradient }}
      />
      {/* Aurora-Blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          key={`b1-${step}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.45 }}
          transition={{ duration: 1.2 }}
          className="absolute -top-32 -left-20 size-[400px] rounded-full bg-white/30 blur-3xl"
        />
        <motion.div
          key={`b2-${step}`}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.3 }}
          transition={{ duration: 1.4, delay: 0.2 }}
          className="absolute -bottom-32 -right-24 size-[420px] rounded-full bg-white/20 blur-3xl"
        />
      </div>

      {/* Skip oben rechts */}
      <button
        onClick={skip}
        className="absolute top-5 right-5 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition"
      >
        Überspringen <X className="size-3.5" />
      </button>

      {/* Content */}
      <div className="relative z-[1] h-full flex flex-col items-center justify-center p-6 text-white">
        <AnimatePresence mode="wait">
          <motion.div
            key={`slide-${step}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="w-full max-w-md text-center flex flex-col items-center"
          >
            {/* Visual */}
            <div className="mb-7 w-full h-[260px] flex items-center justify-center">
              <Visual />
            </div>

            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
              className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center mb-4"
            >
              <Icon className="size-7" strokeWidth={2.2} />
            </motion.div>

            <h2 className="font-display font-extrabold text-3xl md:text-4xl leading-tight">
              {slide.title}
            </h2>
            <p className="mt-3 text-white/85 text-base leading-relaxed">
              {slide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Dots */}
        <div className="absolute bottom-24 flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setStep(i)}
              animate={{ width: i === step ? 28 : 8, opacity: i === step ? 1 : 0.5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="h-2 rounded-full bg-white"
            />
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={next}
          className="absolute bottom-8 inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-ink-900 font-bold text-base shadow-2xl hover:scale-[1.02] transition"
        >
          {step === total - 1 ? <>Los geht's <Sparkles className="size-4" /></> : <>Weiter <ChevronRight className="size-4" /></>}
        </button>
      </div>
    </div>
  );
}

/* ─── Animierte Demos pro Slide ──────────────────────────────────────── */

function GradesVisual() {
  // Drei Noten erscheinen, dann erscheint der Schnitt-Trend.
  const grades = [
    { value: 2, color: '#22c55e' },
    { value: 1, color: '#10b981' },
    { value: 3, color: '#f59e0b' },
  ];
  return (
    <div className="relative w-full h-full grid place-items-center">
      <div className="flex items-center gap-4">
        {grades.map((g, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.15, type: 'spring', stiffness: 320, damping: 22 }}
            className="size-16 rounded-2xl grid place-items-center font-display font-extrabold text-2xl text-white shadow-2xl"
            style={{ background: g.color }}
          >
            {g.value}
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9, type: 'spring' }}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur text-white text-xs font-semibold"
      >
        <TrendingUp className="size-3.5" /> Schnitt: 2,0 · Trend besser
      </motion.div>
    </div>
  );
}

function TasksVisual() {
  // Stack von Task-Karten die nacheinander reinfaden
  const tasks = [
    { Icon: NotebookPen, title: 'Mathe HA · S. 42', done: true },
    { Icon: ClipboardCheck, title: 'Englisch-Vokabeltest', done: false },
    { Icon: Target, title: 'Geo-Referat', done: false },
  ];
  return (
    <div className="w-full h-full grid place-items-center">
      <div className="w-full max-w-[280px] space-y-2">
        {tasks.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.18, type: 'spring', stiffness: 280, damping: 25 }}
            className="rounded-2xl bg-white/20 backdrop-blur border border-white/30 p-3 flex items-center gap-3 text-left"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.18, type: 'spring', stiffness: 380, damping: 18 }}
              className={`size-7 rounded-full grid place-items-center flex-shrink-0 ${t.done ? 'bg-emerald-400 text-white' : 'bg-white/30 text-white/70'}`}
            >
              {t.done ? <Check className="size-4" strokeWidth={3} /> : <t.Icon className="size-4" />}
            </motion.div>
            <div className={`flex-1 min-w-0 text-white text-sm font-medium ${t.done ? 'line-through opacity-70' : ''}`}>
              {t.title}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ScheduleShareVisual() {
  // Stundenplan-Tiles + Code-Karte zentral
  return (
    <div className="w-full h-full grid place-items-center relative">
      {/* "Wochentag-Spalten" als gestapelte Tiles */}
      <div className="absolute inset-0 grid grid-cols-3 gap-1.5 p-4 opacity-50">
        {['Mo', 'Di', 'Mi'].map((day, col) => (
          <div key={day} className="flex flex-col gap-1">
            {[0, 1, 2].map(row => (
              <motion.div
                key={row}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * (col * 3 + row), type: 'spring', stiffness: 320, damping: 22 }}
                className="rounded-lg bg-white/30 h-7 flex items-center px-2 text-[10px] text-white font-bold"
                style={{ background: row === 0 ? 'rgba(255,255,255,0.4)' : row === 1 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)' }}
              >
                {day}{row + 1}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
      {/* Code-Karte zentral */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: -3 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 280, damping: 22 }}
        className="relative z-10 rounded-2xl bg-white text-ink-900 p-4 shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500 text-center">Dein Code</div>
        <div className="font-display font-extrabold text-4xl tracking-[0.15em] mt-1">7B2K</div>
        <div className="inline-flex items-center gap-1 mt-2 text-xs text-ink-600">
          <Share2 className="size-3" /> Mit Klasse teilen
        </div>
      </motion.div>
      <MapPin className="absolute size-0 opacity-0" />
    </div>
  );
}

function CloudVisual() {
  // Wolke in der Mitte, zwei Geräte links + rechts mit Sync-Pfeilen
  return (
    <div className="w-full h-full grid place-items-center">
      <div className="relative w-full max-w-[300px] h-[200px]">
        {/* Wolke zentral oben */}
        <motion.div
          initial={{ scale: 0, y: -20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          className="absolute top-0 left-1/2 -translate-x-1/2 size-20 rounded-3xl bg-white/25 backdrop-blur grid place-items-center"
        >
          <Cloud className="size-10 text-white" strokeWidth={2} />
        </motion.div>

        {/* Sync-Linien */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 200" fill="none">
          <motion.path
            d="M 80 150 Q 110 100 140 60"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="2"
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          />
          <motion.path
            d="M 220 150 Q 190 100 160 60"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="2"
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          />
        </svg>

        {/* Gerät links (Phone) */}
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="absolute bottom-0 left-2 w-16 h-24 rounded-2xl bg-white/20 backdrop-blur border-2 border-white/40 grid place-items-center"
        >
          <div className="w-10 h-16 rounded-lg bg-white/30 flex flex-col gap-1 p-1.5">
            <div className="h-1.5 rounded bg-white/70" />
            <div className="h-1.5 rounded bg-white/50 w-3/4" />
            <div className="h-1.5 rounded bg-white/50 w-1/2" />
          </div>
        </motion.div>

        {/* Gerät rechts (Laptop) */}
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring' }}
          className="absolute bottom-0 right-2 w-24 h-20 rounded-xl bg-white/20 backdrop-blur border-2 border-white/40 grid place-items-center"
        >
          <div className="w-16 h-12 rounded-lg bg-white/30 flex flex-col gap-1 p-1.5">
            <div className="h-1.5 rounded bg-white/70" />
            <div className="h-1.5 rounded bg-white/50 w-2/3" />
            <div className="h-1.5 rounded bg-white/50 w-3/4" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
