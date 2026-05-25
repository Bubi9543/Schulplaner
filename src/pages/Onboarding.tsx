import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Sparkles, Plus, Trash2, Wand2, BookOpen, Trophy,
  ArrowLeft, Flag, Settings as SettingsIcon, Cloud, User, Check,
  Download, Upload, Loader2, AlertCircle,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { installDemo } from '@/lib/demo';
import { importData } from '@/lib/portability';
import { SUBJECT_COLORS } from '@/types';
import type { GradingSystem, Subject } from '@/types';
import { CATEGORY_LABEL } from '@/lib/grading';

type Draft = Omit<Subject, 'id' | 'createdAt'>;

const ONBOARDING_PENDING_KEY = 'onboarding_pending';
/** Der Shortcut-Step (Cloud-Login / JSON-Import) wird nicht in den Stufen-Dots gezeigt. */
const SHORTCUT_STEP = 99;
const MAX_STEP = 4;

const STARTER_SUBJECTS: Array<Pick<Draft, 'name' | 'short' | 'category'>> = [
  { name: 'Mathematik', short: 'M',   category: 'hauptfach' },
  { name: 'Deutsch',    short: 'D',   category: 'hauptfach' },
  { name: 'Englisch',   short: 'E',   category: 'hauptfach' },
  { name: 'Latein',     short: 'L',   category: 'hauptfach' },
  { name: 'Französisch',short: 'F',   category: 'hauptfach' },
  // Physik & Chemie: in Bayern Schulaufgabe 1:1 mit Rest
  { name: 'Physik',     short: 'Ph',  category: 'hauptfach-1zu1' },
  { name: 'Chemie',     short: 'Ch',  category: 'hauptfach-1zu1' },
  { name: 'Biologie',   short: 'Bi',  category: 'nebenfach' },
  { name: 'Geschichte', short: 'G',   category: 'nebenfach' },
  { name: 'Geographie', short: 'Geo', category: 'nebenfach' },
  { name: 'Kunst',      short: 'Ku',  category: 'nebenfach' },
  { name: 'Musik',      short: 'Mu',  category: 'nebenfach' },
  { name: 'Sport',      short: 'Sp',  category: 'nebenfach' },
  { name: 'Religion',   short: 'Rel', category: 'nebenfach' },
  { name: 'Ethik',      short: 'Eth', category: 'nebenfach' },
  { name: 'Informatik',  short: 'Inf', category: 'nebenfach' },
  { name: 'Wirtschaft',  short: 'Wi',  category: 'nebenfach' },
  { name: 'WiB',         short: 'WiB', category: 'nebenfach' },
  { name: 'PUG',         short: 'PUG', category: 'nebenfach' },
  { name: 'Sozialkunde', short: 'Sk',  category: 'nebenfach' },
];

// Per-step visual theme: gradient colors + blob colors
const STEP_CFG = [
  { g1: '#6366f1', g2: '#7c3aed', b1: '#818cf8', b2: '#a78bfa', b3: '#f0abfc' }, // indigo/violet
  { g1: '#0ea5e9', g2: '#2563eb', b1: '#7dd3fc', b2: '#93c5fd', b3: '#a5b4fc' }, // sky/blue
  { g1: '#10b981', g2: '#0d9488', b1: '#6ee7b7', b2: '#5eead4', b3: '#86efac' }, // emerald/teal
  { g1: '#f59e0b', g2: '#ea580c', b1: '#fcd34d', b2: '#fdba74', b3: '#fca5a5' }, // amber/orange
  { g1: '#f43f5e', g2: '#db2777', b1: '#fda4af', b2: '#f9a8d4', b3: '#f0abfc' }, // rose/pink
  { g1: '#8b5cf6', g2: '#6d28d9', b1: '#c4b5fd', b2: '#d8b4fe', b3: '#f0abfc' }, // violet/purple
] as const;

const STEP_ICONS = [Sparkles, User, Trophy, BookOpen, Cloud];

function iconGrad(step: number) {
  const c = STEP_CFG[step];
  return `linear-gradient(135deg, ${c.g1}, ${c.g2})`;
}

function slide(forward: boolean) {
  const x = forward ? 48 : -48;
  return {
    initial:    { opacity: 0, x, scale: 0.96 },
    animate:    { opacity: 1, x: 0, scale: 1 },
    exit:       { opacity: 0, x: -x, scale: 0.96 },
    transition: { type: 'spring' as const, stiffness: 320, damping: 28 },
  };
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function Onboarding() {
  const setSettings = useStore(s => s.setSettings);
  const addSubject  = useStore(s => s.addSubject);
  const load        = useStore(s => s.load);
  const authUser    = useStore(s => s.authUser);

  const [step, setStep]               = useState(0);
  const [prevStep, setPrevStep]       = useState(0);
  const [name, setName]               = useState('');
  const [system, setSystem]           = useState<GradingSystem>('bayern');
  const [subjects, setSubjects]       = useState<Draft[]>([]);

  const pendingRef = useRef<{ name: string; system: GradingSystem; subjects: Draft[] } | null>(null);

  // Restore state saved before Google OAuth redirect
  useEffect(() => {
    const raw = localStorage.getItem(ONBOARDING_PENDING_KEY);
    if (raw) {
      try { pendingRef.current = JSON.parse(raw); } catch { /* ignore */ }
    }
  }, []);

  // Complete onboarding when authUser appears after OAuth redirect
  useEffect(() => {
    if (!authUser || !pendingRef.current) return;
    const saved = pendingRef.current;
    pendingRef.current = null;
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    finishWithData(saved.name, saved.system, saved.subjects);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  function saveStateForRedirect() {
    localStorage.setItem(ONBOARDING_PENDING_KEY, JSON.stringify({ name, system, subjects }));
  }

  function toggleStarter(s: typeof STARTER_SUBJECTS[number]) {
    setSubjects(prev => {
      const exists = prev.find(p => p.name === s.name);
      if (exists) return prev.filter(p => p.name !== s.name);
      const color = SUBJECT_COLORS[prev.length % SUBJECT_COLORS.length];
      return [...prev, { ...s, color, system }];
    });
  }
  function removeSubject(n: string) { setSubjects(prev => prev.filter(p => p.name !== n)); }
  function addCustom() {
    const n = prompt('Wie heißt das Fach?');
    if (!n?.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    setSubjects(prev => [...prev, { name: n.trim(), short: n.trim().slice(0, 2), color, category: 'nebenfach', system }]);
  }

  async function finishWithData(n: string, sys: GradingSystem, subjs: Draft[]) {
    for (const s of subjs) await addSubject({ ...s, system: sys });
    await setSettings({ name: n.trim() || undefined, system: sys, onboarded: true, demo: false });
    await load();
  }
  async function finish() { await finishWithData(name, system, subjects); }
  async function tryDemo() { await installDemo(); await load(); }

  /**
   * Shortcut-Abschluss nach Cloud-Login oder JSON-Import: System+Fächer-Steps
   * werden übersprungen, weil die Daten ja schon da sind. Wir setzen nur
   * onboarded:true (und optional den Namen).
   */
  async function finishShortcut(opts?: { name?: string }) {
    await setSettings({
      name: (opts?.name ?? name).trim() || undefined,
      onboarded: true,
      demo: false,
    });
    await load();
  }

  function goNext() { setPrevStep(step); setStep(s => Math.min(MAX_STEP, s + 1)); }
  function goPrev() { setPrevStep(step); setStep(s => Math.max(0, s - 1)); }
  function goShortcut() { setPrevStep(step); setStep(SHORTCUT_STEP); }
  function leaveShortcut() { setPrevStep(SHORTCUT_STEP); setStep(0); }

  const isShortcut = step === SHORTCUT_STEP;
  // Für visuelles Theme bleiben wir auf einem definierten Index, falls Shortcut.
  const visualStep = isShortcut ? 4 : step;
  const cfg     = STEP_CFG[visualStep];
  const gradient = iconGrad(visualStep);
  const forward  = step >= prevStep;
  const StepIcon = isShortcut ? Cloud : STEP_ICONS[visualStep];
  // blob intensity grows from 0.20 → 0.62 across steps
  const blobOp  = 0.20 + (visualStep / MAX_STEP) * 0.42;
  // blob size grows from 320 → 530
  const blobSz  = 320 + visualStep * 42;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f0f4ff]">

      {/* Animated background blobs – color + opacity + size animate via CSS transition */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* blob 1 – top-left */}
        <div
          className="absolute -top-32 -left-28 rounded-full blur-[90px] animate-blob"
          style={{
            backgroundColor: cfg.b1,
            opacity: blobOp,
            width: blobSz,
            height: blobSz,
            transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease',
          }}
        />
        {/* blob 2 – bottom-right */}
        <div
          className="absolute -bottom-20 -right-20 rounded-full blur-[90px] animate-blob"
          style={{
            backgroundColor: cfg.b2,
            opacity: blobOp * 0.85,
            width: blobSz * 0.9,
            height: blobSz * 0.9,
            animationDelay: '4s',
            transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease',
          }}
        />
        {/* blob 3 – center – appears from step 2 */}
        <div
          className="absolute top-1/3 left-1/4 rounded-full blur-[90px] animate-blob"
          style={{
            backgroundColor: cfg.b3,
            opacity: blobOp * 0.7 * (step >= 2 ? 1 : 0),
            width: blobSz * 0.75,
            height: blobSz * 0.75,
            animationDelay: '8s',
            transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease',
          }}
        />
        {/* blob 4 – lower-left – appears from step 4 */}
        <div
          className="absolute bottom-1/4 -left-10 rounded-full blur-[80px] animate-blob"
          style={{
            backgroundColor: cfg.b1,
            opacity: blobOp * 0.55 * (step >= 4 ? 1 : 0),
            width: blobSz * 0.65,
            height: blobSz * 0.65,
            animationDelay: '13s',
            transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-5 py-14 gap-6">

        {/* Hero icon – springs in on every step change */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`icon-${step}`}
            initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
            animate={{ scale: 1,   rotate: 0,   opacity: 1 }}
            exit={{   scale: 0.5,  rotate: 18,  opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 18 }}
            className="size-24 rounded-[1.75rem] grid place-items-center flex-shrink-0"
            style={{
              background: gradient,
              boxShadow: `0 24px 64px ${cfg.g1}55, 0 6px 20px ${cfg.g1}33`,
            }}
          >
            <StepIcon className="size-12 text-white" strokeWidth={1.5} />
          </motion.div>
        </AnimatePresence>

        {/* Step card */}
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="w" {...slide(forward)}>
                <WelcomeStep onStart={goNext} onDemo={tryDemo} onShortcut={goShortcut} gradient={gradient} />
              </motion.div>
            )}
            {step === SHORTCUT_STEP && (
              <motion.div key="sc" {...slide(forward)}>
                <ShortcutStep
                  back={leaveShortcut}
                  onFinish={finishShortcut}
                  gradient={gradient}
                />
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="n" {...slide(forward)}>
                <NameStep name={name} setName={setName} next={goNext} back={goPrev} gradient={gradient} />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s" {...slide(forward)}>
                <SystemStep system={system} setSystem={setSystem} next={goNext} back={goPrev} gradient={gradient} />
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="f" {...slide(forward)}>
                <SubjectsStep
                  subjects={subjects} system={system}
                  toggle={toggleStarter} removeSubject={removeSubject} addCustom={addCustom}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            )}
            {step === 4 && (
              <motion.div key="a" {...slide(forward)}>
                <AccountStep finish={finish} back={goPrev} onSaveState={saveStateForRedirect} gradient={gradient} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step dots – nur im Standard-Flow zeigen */}
        {!isShortcut && (
          <div className="flex items-center gap-2">
            {Array.from({ length: MAX_STEP + 1 }).map((_, i) => (
              <motion.div
                key={i}
                animate={{ width: i === step ? 28 : 8, opacity: i === step ? 1 : 0.35 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="h-2 rounded-full"
                style={{ background: i === step ? gradient : '#6366f1' }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Shared primitives ──────────────────────────────────────────────── */

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2rem] border border-white/55 bg-white/35 backdrop-blur-2xl shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

function PrimaryBtn({ onClick, children, disabled, gradient }: {
  onClick?: () => void; children: React.ReactNode; disabled?: boolean; gradient: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.025, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.965 }}
      className="w-full py-3.5 rounded-2xl text-white font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: gradient,
        boxShadow: disabled ? 'none' : '0 10px 30px rgba(0,0,0,0.18)',
      }}
    >
      {children}
    </motion.button>
  );
}

function GlassInput({
  value, onChange, placeholder, autoFocus, type = 'text', onKeyDown,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  autoFocus?: boolean; type?: string; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <input
      type={type}
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      className="w-full px-4 py-3.5 rounded-2xl bg-white/30 border border-white/50 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-white/70 focus:bg-white/50 transition text-base"
    />
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 transition mb-5">
      <ArrowLeft className="size-4" /> Zurück
    </button>
  );
}

function SelectCard({ active, onClick, title, sub, icon, gradient }: {
  active: boolean; onClick: () => void; title: string; sub: string;
  icon?: React.ReactNode; gradient: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.975 }}
      className={`relative w-full text-left rounded-2xl p-4 border transition ${
        active ? 'border-white/70 bg-white/55 shadow-md' : 'border-white/35 bg-white/18 hover:bg-white/35'
      }`}
    >
      {icon && (
        <div className="size-9 rounded-xl grid place-items-center text-white mb-2.5" style={{ background: gradient }}>
          {icon}
        </div>
      )}
      <div className="font-bold text-ink-900 text-sm">{title}</div>
      <div className="text-xs text-ink-500 mt-0.5 leading-snug">{sub}</div>
      {active && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="absolute top-3 right-3 size-5 rounded-full bg-white shadow flex items-center justify-center"
        >
          <Check className="size-3 text-emerald-500" strokeWidth={3} />
        </motion.div>
      )}
    </motion.button>
  );
}

/* ─── Step 0: Welcome ────────────────────────────────────────────────── */

function WelcomeStep({ onStart, onDemo, onShortcut, gradient }: { onStart: () => void; onDemo: () => void; onShortcut: () => void; gradient: string }) {
  return (
    <GlassCard className="p-8 md:p-10 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="font-display text-3xl md:text-4xl font-extrabold text-ink-900"
      >
        Willkommen!
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="text-ink-600 mt-2 leading-relaxed"
      >
        Alle Noten, Aufgaben und der Stundenplan an einem Ort.
        <br />
        <span className="text-sm text-ink-400">In 2 Minuten eingerichtet.</span>
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26 }}
        className="mt-8 space-y-3"
      >
        <PrimaryBtn onClick={onStart} gradient={gradient}>
          Los geht's <ChevronRight className="size-4" />
        </PrimaryBtn>
        <button
          onClick={onShortcut}
          className="w-full py-3 rounded-2xl bg-white/55 border border-white/65 text-ink-800 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white/75 transition shadow-sm"
        >
          <Download className="size-4" /> Ich hab schon Daten
        </button>
        <button
          onClick={onDemo}
          className="w-full py-2.5 rounded-2xl text-ink-500 hover:text-ink-700 text-sm flex items-center justify-center gap-2 transition"
        >
          <Wand2 className="size-4" /> Demo-Daten laden
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-6 flex items-center justify-center gap-2 flex-wrap"
      >
        {['Bayern & Oberstufe', 'Live-Stundenplan', 'Notenverlauf', 'Cloud Sync'].map(t => (
          <span key={t} className="text-xs px-2.5 py-1 rounded-full border border-ink-200 bg-white/60 text-ink-500">{t}</span>
        ))}
      </motion.div>
    </GlassCard>
  );
}

/* ─── Shortcut: Cloud-Login oder JSON-Import ─────────────────────────── */

function ShortcutStep({ back, onFinish, gradient }: {
  back: () => void;
  onFinish: (opts?: { name?: string }) => Promise<void>;
  gradient: string;
}) {
  const { signIn, signInWithGoogle, signUp } = useStore();
  const authUser = useStore(s => s.authUser);
  const [mode, setMode] = useState<'choice' | 'login' | 'signup' | 'importing'>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Wenn man sich erfolgreich einloggt, übernimmt Realtime + downloadAll
  // den Datenstand. Sobald der Auth-Listener `authUser` setzt, finishen wir.
  useEffect(() => {
    if (mode !== 'login' && mode !== 'signup') return;
    if (!authUser) return;
    // kleine Verzögerung, damit startAutoSync seine Initial-Pull machen kann
    const t = setTimeout(() => { void onFinish(); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, mode]);

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err);
    // bei Erfolg übernimmt der useEffect-Hook oben das finish
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMode('importing');
    setError('');
    try {
      const text = await file.text();
      const result = await importData(text);
      setImportStatus(`${result.subjects} Fächer, ${result.grades} Noten, ${result.tasks} Aufgaben übernommen.`);
      setTimeout(() => { void onFinish(); }, 1500);
    } catch (err) {
      setError('Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
      setMode('choice');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Daten übernehmen</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Du hast den Schulplaner schon auf einem anderen Gerät oder eine JSON-Datei.<br />
        Wähle einen Weg, dann setzen wir alles für dich auf.
      </p>

      {mode === 'choice' && (
        <div className="mt-6 grid gap-3">
          {supabase ? (
            <>
              <button
                onClick={() => setMode('login')}
                className="text-left rounded-2xl border border-white/55 bg-white/35 hover:bg-white/55 backdrop-blur p-4 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl text-white grid place-items-center flex-shrink-0" style={{ background: gradient }}>
                    <Cloud className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink-900">Mit Account anmelden</div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      Alle Geräte synchronisieren sich automatisch. Empfohlen.
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-ink-400" />
                </div>
              </button>
              <button
                onClick={async () => { setLoading(true); await signInWithGoogle(); }}
                className="text-left rounded-2xl border border-white/55 bg-white/35 hover:bg-white/55 backdrop-blur p-4 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-white grid place-items-center shadow-sm flex-shrink-0">
                    <GoogleIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink-900">Mit Google anmelden</div>
                    <div className="text-xs text-ink-500 mt-0.5">Schneller Login ohne Passwort.</div>
                  </div>
                  <ChevronRight className="size-5 text-ink-400" />
                </div>
              </button>
            </>
          ) : (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
              Cloud-Sync ist auf diesem Server nicht eingerichtet – Account-Login geht nicht.
            </div>
          )}
          <label className="text-left rounded-2xl border border-white/55 bg-white/35 hover:bg-white/55 backdrop-blur p-4 transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-ink-700 text-white grid place-items-center flex-shrink-0">
                <Upload className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-ink-900">JSON-Datei importieren</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  Vorher per „Exportieren" in den Einstellungen gesichert.
                </div>
              </div>
              <ChevronRight className="size-5 text-ink-400" />
            </div>
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          </label>
        </div>
      )}

      {(mode === 'login' || mode === 'signup') && !authUser && (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-semibold text-ink-700">
            {mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </div>
          <GlassInput value={email} onChange={setEmail} placeholder="E-Mail" type="email" autoFocus />
          <GlassInput value={password} onChange={setPassword} placeholder="Passwort" type="password"
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600 px-1">{error}</div>}
          <PrimaryBtn onClick={submit} disabled={loading || !email || !password} gradient={gradient}>
            {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden & Daten laden' : 'Registrieren'}
          </PrimaryBtn>
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full py-2 text-xs text-ink-500 hover:text-ink-800 transition"
          >
            {mode === 'login' ? 'Noch kein Account? Registrieren →' : '← Schon einen Account? Anmelden'}
          </button>
          <button onClick={() => setMode('choice')} className="w-full py-2 text-xs text-ink-400 hover:text-ink-600 transition">
            Zurück zur Auswahl
          </button>
        </div>
      )}

      {(mode === 'importing' || (authUser && (mode === 'login' || mode === 'signup'))) && (
        <div className="mt-6 flex flex-col items-center text-center py-6">
          <Loader2 className="size-8 text-theme animate-spin mb-3" />
          <div className="font-display font-bold text-ink-900">
            {mode === 'importing' ? 'Importiere deine Daten …' : 'Synchronisiere mit der Cloud …'}
          </div>
          {importStatus && (
            <div className="text-xs text-emerald-700 mt-2">{importStatus}</div>
          )}
        </div>
      )}
    </GlassCard>
  );
}

/* ─── Step 1: Name ───────────────────────────────────────────────────── */

function NameStep({ name, setName, next, back, gradient }: {
  name: string; setName: (n: string) => void; next: () => void; back: () => void; gradient: string;
}) {
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Wie heißt du? 👋</h2>
      <p className="text-ink-500 text-sm mt-1">Optional – nur für die persönliche Begrüßung.</p>
      <div className="mt-6">
        <GlassInput
          value={name} onChange={setName}
          placeholder="Dein Name" autoFocus
          onKeyDown={e => e.key === 'Enter' && next()}
        />
      </div>
      <div className="mt-4">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step 2: Grading system ─────────────────────────────────────────── */

function SystemStep({ system, setSystem, next, back, gradient }: {
  system: GradingSystem; setSystem: (s: GradingSystem) => void;
  next: () => void; back: () => void; gradient: string;
}) {
  const opts: { v: GradingSystem; title: string; sub: string; icon: React.ReactNode }[] = [
    { v: 'bayern',    title: 'Bayern',              sub: 'Noten 1–6, Haupt- & Nebenfächer',        icon: <BookOpen className="size-4.5" /> },
    { v: 'oberstufe', title: 'Oberstufe / Abitur',  sub: 'Punkte 0–15, Per-Note-Gewichtung',        icon: <Trophy className="size-4.5" /> },
    { v: 'austria',   title: 'Österreich',          sub: 'Noten 1–5, Sehr gut bis Nicht genügend',  icon: <Flag className="size-4.5" /> },
    { v: 'custom',    title: 'Frei konfigurierbar', sub: 'Min, Max, Schrittweite frei wählbar',      icon: <SettingsIcon className="size-4.5" /> },
  ];
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Welches Notensystem?</h2>
      <p className="text-ink-500 text-sm mt-1">Später pro Fach individuell anpassbar.</p>
      <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
        {opts.map(o => (
          <SelectCard
            key={o.v} active={system === o.v} onClick={() => setSystem(o.v)}
            title={o.title} sub={o.sub} icon={o.icon} gradient={gradient}
          />
        ))}
      </div>
      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step 3: Subjects ───────────────────────────────────────────────── */

function SubjectsStep({ subjects, system, toggle, removeSubject, addCustom, next, back, gradient }: {
  subjects: Draft[]; system: GradingSystem;
  toggle: (s: typeof STARTER_SUBJECTS[number]) => void;
  removeSubject: (name: string) => void;
  addCustom: () => void;
  next: () => void; back: () => void; gradient: string;
}) {
  const systemLabel = { bayern: '1–6', oberstufe: '0–15', austria: '1–5', custom: 'frei' }[system];
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Welche Fächer hast du?</h2>
      <p className="text-ink-500 text-sm mt-1">Tippe zum Hinzufügen – später jederzeit anpassbar.</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {STARTER_SUBJECTS.map(s => {
          const active = !!subjects.find(p => p.name === s.name);
          return (
            <motion.button
              key={s.name} onClick={() => toggle(s)}
              whileTap={{ scale: 0.9 }}
              className="px-3 py-1.5 rounded-full text-sm font-medium border transition"
              style={active
                ? { background: gradient, color: '#fff', borderColor: 'transparent' }
                : { background: 'rgba(255,255,255,0.45)', color: '#475569', borderColor: 'rgba(255,255,255,0.5)' }
              }
            >
              {active && '✓ '}{s.name}
            </motion.button>
          );
        })}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={addCustom}
          className="px-3 py-1.5 rounded-full text-sm border border-dashed border-ink-300 text-ink-500 hover:text-ink-700 hover:border-ink-400 bg-white/30 transition flex items-center gap-1"
        >
          <Plus className="size-3" /> Eigenes
        </motion.button>
      </div>

      <AnimatePresence>
        {subjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 rounded-2xl bg-white/40 border border-white/55 overflow-hidden"
          >
            <div className="px-4 py-2 text-xs font-semibold text-ink-500 border-b border-white/40">
              {subjects.length} Fach{subjects.length !== 1 ? 'fächer' : ''} ausgewählt
            </div>
            <div className="divide-y divide-white/40 max-h-44 overflow-y-auto">
              {subjects.map(s => (
                <div key={s.name} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="size-8 rounded-xl grid place-items-center text-white text-xs font-bold flex-shrink-0" style={{ background: s.color }}>{s.short}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-800 truncate">{s.name}</div>
                    <div className="text-xs text-ink-400">{CATEGORY_LABEL[s.category]} · {systemLabel}</div>
                  </div>
                  <button onClick={() => removeSubject(s.name)} className="size-7 rounded-full hover:bg-rose-100 text-ink-400 hover:text-rose-500 grid place-items-center transition flex-shrink-0">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4">
        <PrimaryBtn onClick={next} gradient={gradient}>
          {subjects.length ? `Mit ${subjects.length} Fächer${subjects.length !== 1 ? 'n' : ''} weiter` : 'Weiter'}
          <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}


/* ─── Step 5: Account ────────────────────────────────────────────────── */

function AccountStep({ finish, back, onSaveState, gradient }: {
  finish: () => void; back: () => void; onSaveState: () => void; gradient: string;
}) {
  const { signIn, signUp, signInWithGoogle } = useStore();
  const [mode, setMode]         = useState<'choice' | 'login' | 'signup'>('choice');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err); else finish();
  }

  async function handleGoogle() {
    onSaveState();
    await signInWithGoogle();
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Konto erstellen</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Optional – ermöglicht Sync zwischen deinen Geräten.<br />
        Du kannst das auch später in den Einstellungen einrichten.
      </p>

      {!supabase ? (
        <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          Cloud Sync ist nicht eingerichtet. Die App ist trotzdem voll nutzbar!
        </div>
      ) : mode === 'choice' ? (
        <div className="mt-6 space-y-2.5">
          <PrimaryBtn onClick={() => setMode('signup')} gradient={gradient}>
            <Plus className="size-4" /> Neu registrieren
          </PrimaryBtn>
          <motion.button
            onClick={handleGoogle}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-2xl bg-white/55 border border-white/65 text-ink-800 font-semibold text-base flex items-center justify-center gap-2 hover:bg-white/75 transition shadow-sm"
          >
            <GoogleIcon /> Mit Google anmelden
          </motion.button>
          <button onClick={() => setMode('login')} className="w-full py-2 text-sm text-ink-400 hover:text-ink-600 transition">
            Ich habe schon ein Konto →
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-semibold text-ink-700">{mode === 'login' ? 'Anmelden' : 'Registrieren'}</div>
          <GlassInput value={email} onChange={setEmail} placeholder="E-Mail" type="email" autoFocus />
          <GlassInput value={password} onChange={setPassword} placeholder="Passwort (mind. 6 Zeichen)" type="password"
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600 px-1">{error}</div>}
          <PrimaryBtn onClick={submit} disabled={loading || !email || !password} gradient={gradient}>
            {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </PrimaryBtn>
          <button onClick={() => setMode('choice')} className="w-full py-2 text-sm text-ink-400 hover:text-ink-600 transition">
            ← Zurück
          </button>
        </div>
      )}

      <button onClick={finish} className="mt-4 w-full py-2 text-sm text-ink-400 hover:text-ink-600 transition">
        Überspringen – später in Einstellungen einrichten
      </button>

      <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-ink-400">
        <a href="/datenschutz" className="hover:text-ink-700 transition">Datenschutz</a>
        <span>·</span>
        <a href="/impressum" className="hover:text-ink-700 transition">Impressum</a>
      </div>
    </GlassCard>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
