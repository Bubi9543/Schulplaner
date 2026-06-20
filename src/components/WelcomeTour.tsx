import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, X, Sparkles,
  LayoutDashboard, GraduationCap, CalendarCheck, CalendarDays, Timer, Settings,
} from 'lucide-react';
import { dismissTour } from '@/lib/tour';

/**
 * Interaktive Tour, die nach dem Onboarding einmal pro Gerät gezeigt wird.
 * Statt einer Folien-Show führt sie durch die *echten* Seiten der App: Sie
 * navigiert nacheinander zu jeder Seite, dimmt den Hintergrund, hebt den
 * passenden Menüpunkt hervor (Spotlight) und erklärt in einer kurzen
 * Sprechblase, was man dort grob machen kann. Jederzeit überspringbar.
 */

interface TourStep {
  to: string;
  title: string;
  text: string;
  icon: typeof LayoutDashboard;
}

const STEPS: TourStep[] = [
  { to: '/',            icon: LayoutDashboard, title: 'Dein Dashboard',  text: 'Dein Überblick für jeden Tag: Notenschnitt, heutige Stunden, fällige Aufgaben und die letzten Noten – alles auf einen Blick.' },
  { to: '/noten',       icon: GraduationCap,   title: 'Noten',           text: 'Alle Noten pro Fach, mit Schnitt, Trend und Gewichtung. Tippe ein Fach an, um die Details zu sehen.' },
  { to: '/aufgaben',    icon: CalendarCheck,   title: 'Aufgaben',        text: 'Hausaufgaben, Tests und Projekte verwalten – mit Fälligkeit und Priorität. Überfälliges wird automatisch markiert.' },
  { to: '/stundenplan', icon: CalendarDays,    title: 'Stundenplan',     text: 'Dein Wochenplan. Du kannst ihn mit der Klasse teilen oder den eines Freundes per Code übernehmen.' },
  { to: '/fokus',       icon: Timer,           title: 'Fokus',           text: 'Lern-Timer mit Statistik: bleib dran, sammle Lernzeit und sieh deine Streak wachsen.' },
  { to: '/einstellungen', icon: Settings,      title: 'Einstellungen',   text: 'Profil, Design, Notensystem, Cloud-Sync und Freunde – hier stellst du alles ein. Viel Erfolg! 🎉' },
];

export function WelcomeTour({ onFinish }: { onFinish: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const total = STEPS.length;
  const s = STEPS[step];

  // Bei jedem Schritt die echte Seite öffnen.
  useEffect(() => { navigate(STEPS[step].to); }, [step, navigate]);

  // Aktiven Menüpunkt vermessen (NavLink setzt aria-current="page").
  const measure = useCallback(() => {
    const candidates = Array.from(document.querySelectorAll('a[aria-current="page"]')) as HTMLElement[];
    const visible = candidates.find(el => el.offsetParent !== null) ?? null;
    setRect(visible ? visible.getBoundingClientRect() : null);
  }, []);

  // Nach dem Routenwechsel kurz warten (Seitentransition), dann vermessen.
  useEffect(() => {
    const t1 = setTimeout(measure, 90);
    const t2 = setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, measure]);

  const finish = useCallback(() => { dismissTour(); navigate('/'); onFinish(); }, [navigate, onFinish]);
  const next = useCallback(() => { if (step === total - 1) finish(); else setStep(p => p + 1); }, [step, total, finish]);
  const prev = useCallback(() => setStep(p => Math.max(0, p - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, next, prev]);

  const Icon = s.icon;

  return (
    <div className="fixed inset-0 z-[120]">
      {/* Klick-Fänger: blockiert versehentliche Klicks auf die Seite während der Tour. */}
      <div className="absolute inset-0" />

      {/* Dimmen + Spotlight auf den aktiven Menüpunkt (oder voll abdunkeln). */}
      {rect ? (
        <motion.div
          initial={false}
          animate={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed rounded-2xl pointer-events-none ring-2 ring-white/90"
          style={{ boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/60 pointer-events-none" />
      )}

      {/* Sprechblase / Coach-Karte */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-[min(92vw,26rem)]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="rounded-3xl bg-white shadow-2xl p-5 border border-black/5"
          >
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-2xl theme-gradient grid place-items-center flex-shrink-0 text-white shadow-glow">
                <Icon className="size-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-ink-400">Schritt {step + 1} von {total}</div>
                <h3 className="font-display font-extrabold text-lg text-ink-900 leading-tight">{s.title}</h3>
              </div>
              <button onClick={finish} aria-label="Tour schließen" className="text-ink-400 hover:text-ink-700 -mr-1 -mt-1 p-1 transition">
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-2 text-sm text-ink-600 leading-relaxed">{s.text}</p>

            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: i === step ? 20 : 6, background: i === step ? 'var(--theme-primary)' : 'rgba(0,0,0,0.12)' }}
                  />
                ))}
              </div>
              {step > 0 && (
                <button onClick={prev} aria-label="Zurück" className="size-9 rounded-xl border border-ink-200 text-ink-500 grid place-items-center hover:bg-ink-50 transition">
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <button onClick={next} className="h-9 px-4 rounded-xl theme-gradient text-white font-semibold text-sm flex items-center gap-1 shadow-glow">
                {step === total - 1 ? <>Fertig <Sparkles className="size-4" /></> : <>Weiter <ChevronRight className="size-4" /></>}
              </button>
            </div>

            {step === 0 && (
              <button onClick={finish} className="mt-2.5 w-full text-center text-xs text-ink-400 hover:text-ink-600 transition">
                Tour überspringen
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
