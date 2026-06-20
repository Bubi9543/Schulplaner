import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Sparkles, Plus, Trash2, Wand2, BookOpen, Trophy,
  ArrowLeft, Flag, Settings as SettingsIcon, Cloud, User, Check,
  Download, Upload, Loader2, AlertCircle, KeyRound, Hand, GraduationCap,
  Layers, CalendarClock, Users, MapPin, Star,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { SubjectIcon } from '@/components/SubjectIcon';
import { AvatarUpload } from '@/components/AvatarUpload';
import { supabase } from '@/lib/supabase';
import { installDemo } from '@/lib/demo';
import { importData } from '@/lib/portability';
import { SUBJECT_COLORS } from '@/types';
import type { GradingSystem, Subject, Weekday, RegionCode } from '@/types';
import { CATEGORY_LABEL } from '@/lib/grading';
import { COUNTRIES, subdivisionsForCountry } from '@/lib/holidays';

type Draft = Omit<Subject, 'id' | 'createdAt'>;

/** Eine im Onboarding entworfene Stunde (referenziert das Fach noch über den Namen). */
interface DraftLesson { subjectName: string; weekday: Weekday; start: string; end: string; }

const ONBOARDING_PENDING_KEY = 'onboarding_pending';

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

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
];

const MAX_ABI_FAECHER = 5;

// Per-step visual theme: gradient colors + blob colors (zyklisch nach Index)
const STEP_CFG = [
  { g1: '#6366f1', g2: '#7c3aed', b1: '#818cf8', b2: '#a78bfa', b3: '#f0abfc' }, // indigo/violet
  { g1: '#0ea5e9', g2: '#2563eb', b1: '#7dd3fc', b2: '#93c5fd', b3: '#a5b4fc' }, // sky/blue
  { g1: '#10b981', g2: '#0d9488', b1: '#6ee7b7', b2: '#5eead4', b3: '#86efac' }, // emerald/teal
  { g1: '#f59e0b', g2: '#ea580c', b1: '#fcd34d', b2: '#fdba74', b3: '#fca5a5' }, // amber/orange
  { g1: '#f43f5e', g2: '#db2777', b1: '#fda4af', b2: '#f9a8d4', b3: '#f0abfc' }, // rose/pink
  { g1: '#8b5cf6', g2: '#6d28d9', b1: '#c4b5fd', b2: '#d8b4fe', b3: '#f0abfc' }, // violet/purple
] as const;

type StepKey = 'welcome' | 'profile' | 'stufe' | 'subjects' | 'abi' | 'plan' | 'account' | 'friends' | 'code';

const STEP_ICON: Record<StepKey, typeof Sparkles> = {
  welcome: Sparkles,
  profile: User,
  stufe: Layers,
  subjects: BookOpen,
  abi: Trophy,
  plan: CalendarClock,
  account: Cloud,
  friends: Users,
  code: KeyRound,
};

function gradientFor(idx: number) {
  const c = STEP_CFG[idx % STEP_CFG.length];
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

/** Was wir vor dem Google-OAuth-Redirect zwischenspeichern. */
interface PendingState {
  name: string; avatar: string; school: string; classLevel: string;
  system: GradingSystem; oberG8: boolean; region: RegionCode;
  subjects: Draft[]; examNames: string[]; fullNames: string[]; lessons: DraftLesson[];
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function Onboarding() {
  const setSettings = useStore(s => s.setSettings);
  const addSubject  = useStore(s => s.addSubject);
  const addSchoolYear = useStore(s => s.addSchoolYear);
  const updateSchoolYear = useStore(s => s.updateSchoolYear);
  const addLesson = useStore(s => s.addLesson);
  const load        = useStore(s => s.load);
  const authUser    = useStore(s => s.authUser);

  // Navigation
  const [stepKey, setStepKey] = useState<StepKey>('welcome');
  const [forward, setForward] = useState(true);
  const [shortcut, setShortcut] = useState(false);

  // Profil
  const [name, setName]               = useState('');
  const [avatar, setAvatar]           = useState('');
  const [school, setSchool]           = useState('');
  const [classLevel, setClassLevel]   = useState('');
  const [region, setRegion]           = useState<RegionCode>({ country: 'DE' });

  // Stufe / System
  const [system, setSystem]           = useState<GradingSystem>('bayern');
  const [regularSystem, setRegularSystem] = useState<GradingSystem>('bayern');
  const [oberG8, setOberG8]           = useState(false);

  // Inhalte
  const [subjects, setSubjects]       = useState<Draft[]>([]);
  const [examNames, setExamNames]     = useState<string[]>([]);
  const [fullNames, setFullNames]     = useState<string[]>([]);
  const [lessons, setLessons]         = useState<DraftLesson[]>([]);

  // Dynamische Schritt-Liste.
  //  • Anmelden kommt früh – danach entscheidet sich, ob die Freunde-Schritte
  //    (Freunde hinzufügen, Stundenplan-Import) überhaupt erscheinen.
  //  • Ohne Konto: nur Fächer (+ Abi in der Oberstufe), kein Stundenplan-Import.
  //  • Abi nur in der Oberstufe; Freunde & Stundenplan-Import nur eingeloggt.
  const steps = useMemo<StepKey[]>(() => {
    const list: StepKey[] = ['welcome', 'profile', 'stufe', 'account'];
    if (authUser) list.push('friends');
    list.push('subjects');
    if (system === 'oberstufe') list.push('abi');
    if (authUser) list.push('code');
    return list;
  }, [system, authUser]);

  const pendingRef = useRef<PendingState | null>(null);

  // Restore state saved before Google OAuth redirect
  useEffect(() => {
    const raw = localStorage.getItem(ONBOARDING_PENDING_KEY);
    if (raw) {
      try { pendingRef.current = JSON.parse(raw); } catch { /* ignore */ }
    }
  }, []);

  // Nach OAuth-Redirect: in-memory State wiederherstellen und in den Freunde-Step springen.
  useEffect(() => {
    if (!authUser || !pendingRef.current) return;
    const s = pendingRef.current;
    pendingRef.current = null;
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    setName(s.name); setAvatar(s.avatar); setSchool(s.school); setClassLevel(s.classLevel);
    setSystem(s.system); setOberG8(s.oberG8); setRegion(s.region);
    setSubjects(s.subjects); setExamNames(s.examNames); setFullNames(s.fullNames); setLessons(s.lessons);
    setForward(true);
    setStepKey('friends');
  }, [authUser]);

  function saveStateForRedirect() {
    const s: PendingState = { name, avatar, school, classLevel, system, oberG8, region, subjects, examNames, fullNames, lessons };
    localStorage.setItem(ONBOARDING_PENDING_KEY, JSON.stringify(s));
  }

  /* ── Fächer-Helfer ── */
  function toggleStarter(s: typeof STARTER_SUBJECTS[number]) {
    setSubjects(prev => {
      const exists = prev.find(p => p.name === s.name);
      if (exists) {
        setExamNames(e => e.filter(n => n !== s.name));
        setFullNames(f => f.filter(n => n !== s.name));
        setLessons(l => l.filter(x => x.subjectName !== s.name));
        return prev.filter(p => p.name !== s.name);
      }
      const color = SUBJECT_COLORS[prev.length % SUBJECT_COLORS.length];
      return [...prev, { ...s, color, system }];
    });
  }
  function removeSubject(n: string) {
    setSubjects(prev => prev.filter(p => p.name !== n));
    setExamNames(e => e.filter(x => x !== n));
    setFullNames(f => f.filter(x => x !== n));
    setLessons(l => l.filter(x => x.subjectName !== n));
  }
  function addCustom() {
    const n = prompt('Wie heißt das Fach?');
    if (!n?.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    setSubjects(prev => [...prev, { name: n.trim(), short: n.trim().slice(0, 2), color, category: 'nebenfach', system }]);
  }

  /* ── Abschluss ── */
  async function finish() {
    let yearId: string | undefined;
    if (system === 'oberstufe') {
      const d = new Date();
      const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
      const year = await addSchoolYear({
        name: 'Oberstufe',
        startDate: new Date(y, 8, 1).getTime(),
        oberstufe: true,
        oberstufeJahrgaenge: oberG8 ? [11, 12] : [12, 13],
      });
      yearId = year.id;
    }

    // Fächer schreiben + Name→ID-Map für Abi-Config & Stundenplan.
    const nameToId = new Map<string, string>();
    for (const s of subjects) {
      const created = await addSubject({ ...s, system });
      nameToId.set(s.name, created.id);
    }

    // Oberstufe: Abiturprüfungs- & Pflichtfächer in die Jahres-Config schreiben.
    if (system === 'oberstufe' && yearId) {
      const examSubjectIds = examNames.map(n => nameToId.get(n)).filter((x): x is string => !!x);
      const fullSubjectIds = fullNames.map(n => nameToId.get(n)).filter((x): x is string => !!x);
      if (examSubjectIds.length || fullSubjectIds.length) {
        await updateSchoolYear(yearId, { abitur: { examSubjectIds, examPoints: {}, fullSubjectIds, struckKeys: [] } });
      }
    }

    // Stundenplan-Entwürfe eintragen (Fach über die Name→ID-Map auflösen).
    for (const l of lessons) {
      const sid = nameToId.get(l.subjectName);
      if (!sid) continue;
      await addLesson({ subjectId: sid, weekday: l.weekday, start: l.start, end: l.end });
    }

    await setSettings({
      name: name.trim() || undefined,
      avatarUrl: avatar || undefined,
      school: school.trim() || undefined,
      classLevel: classLevel.trim() || undefined,
      system,
      region: region.country ? { country: region.country, subdivision: region.subdivision || undefined } : undefined,
      onboarded: true,
      demo: false,
    });
    await load();
  }

  async function tryDemo() { await installDemo(); await load(); }

  /** Shortcut-Abschluss nach Cloud-Login oder JSON-Import (Daten sind schon da). */
  async function finishShortcut(opts?: { name?: string }) {
    await setSettings({
      name: (opts?.name ?? name).trim() || undefined,
      onboarded: true,
      demo: false,
    });
    await load();
  }

  /* ── Navigation ── */
  function goNext() {
    const idx = steps.indexOf(stepKey);
    if (idx >= steps.length - 1) { void finish(); return; }
    setForward(true);
    setStepKey(steps[idx + 1]);
  }
  function goPrev() {
    const idx = steps.indexOf(stepKey);
    if (idx <= 0) return;
    setForward(false);
    setStepKey(steps[idx - 1]);
  }
  function goShortcut() { setForward(true); setShortcut(true); }
  function leaveShortcut() { setForward(false); setShortcut(false); setStepKey('welcome'); }

  /* ── Stufe wählen ── */
  function pickRegular() { setSystem(regularSystem === 'oberstufe' ? 'bayern' : regularSystem); }
  function pickRegularSystem(v: GradingSystem) { setRegularSystem(v); setSystem(v); }
  function pickOberstufe() { setSystem('oberstufe'); }

  const idx = steps.indexOf(stepKey);
  const visualIdx = shortcut ? 4 : Math.max(0, idx);
  const cfg = STEP_CFG[visualIdx % STEP_CFG.length];
  const gradient = gradientFor(visualIdx);
  const StepIcon = shortcut ? Cloud : STEP_ICON[stepKey];
  const dotCount = steps.length;
  const blobOp = 0.20 + (visualIdx / Math.max(1, dotCount - 1)) * 0.42;
  const blobSz = 320 + visualIdx * 28;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f0f4ff]">

      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -left-28 rounded-full blur-[90px] animate-blob"
          style={{ backgroundColor: cfg.b1, opacity: blobOp, width: blobSz, height: blobSz, transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease' }}
        />
        <div
          className="absolute -bottom-20 -right-20 rounded-full blur-[90px] animate-blob"
          style={{ backgroundColor: cfg.b2, opacity: blobOp * 0.85, width: blobSz * 0.9, height: blobSz * 0.9, animationDelay: '4s', transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease' }}
        />
        <div
          className="absolute top-1/3 left-1/4 rounded-full blur-[90px] animate-blob"
          style={{ backgroundColor: cfg.b3, opacity: blobOp * 0.7 * (visualIdx >= 2 ? 1 : 0), width: blobSz * 0.75, height: blobSz * 0.75, animationDelay: '8s', transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease' }}
        />
        <div
          className="absolute bottom-1/4 -left-10 rounded-full blur-[80px] animate-blob"
          style={{ backgroundColor: cfg.b1, opacity: blobOp * 0.55 * (visualIdx >= 4 ? 1 : 0), width: blobSz * 0.65, height: blobSz * 0.65, animationDelay: '13s', transition: 'background-color 1.1s ease, opacity 1.1s ease, width 1.1s ease, height 1.1s ease' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-5 py-14 gap-6">

        {/* Hero icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`icon-${shortcut ? 'sc' : stepKey}`}
            initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.5, rotate: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 18 }}
            className="size-24 rounded-[1.75rem] grid place-items-center flex-shrink-0"
            style={{ background: gradient, boxShadow: `0 24px 64px ${cfg.g1}55, 0 6px 20px ${cfg.g1}33` }}
          >
            <StepIcon className="size-12 text-white" strokeWidth={1.5} />
          </motion.div>
        </AnimatePresence>

        {/* Step card */}
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {shortcut ? (
              <motion.div key="sc" {...slide(forward)}>
                <ShortcutStep back={leaveShortcut} onFinish={finishShortcut} gradient={gradient} />
              </motion.div>
            ) : stepKey === 'welcome' ? (
              <motion.div key="welcome" {...slide(forward)}>
                <WelcomeStep onStart={goNext} onDemo={tryDemo} onShortcut={goShortcut} gradient={gradient} />
              </motion.div>
            ) : stepKey === 'profile' ? (
              <motion.div key="profile" {...slide(forward)}>
                <ProfileStep
                  name={name} setName={setName}
                  avatar={avatar} setAvatar={setAvatar}
                  school={school} setSchool={setSchool}
                  classLevel={classLevel} setClassLevel={setClassLevel}
                  region={region} setRegion={setRegion}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            ) : stepKey === 'stufe' ? (
              <motion.div key="stufe" {...slide(forward)}>
                <StufeStep
                  name={name}
                  system={system} regularSystem={regularSystem}
                  oberG8={oberG8} setOberG8={setOberG8}
                  pickRegular={pickRegular} pickRegularSystem={pickRegularSystem} pickOberstufe={pickOberstufe}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            ) : stepKey === 'subjects' ? (
              <motion.div key="subjects" {...slide(forward)}>
                <SubjectsStep
                  name={name}
                  subjects={subjects} system={system}
                  toggle={toggleStarter} removeSubject={removeSubject} addCustom={addCustom}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            ) : stepKey === 'abi' ? (
              <motion.div key="abi" {...slide(forward)}>
                <AbiStep
                  subjects={subjects}
                  examNames={examNames} setExamNames={setExamNames}
                  fullNames={fullNames} setFullNames={setFullNames}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            ) : stepKey === 'plan' ? (
              <motion.div key="plan" {...slide(forward)}>
                <PlanStep
                  subjects={subjects} lessons={lessons} setLessons={setLessons}
                  next={goNext} back={goPrev} gradient={gradient}
                />
              </motion.div>
            ) : stepKey === 'account' ? (
              <motion.div key="account" {...slide(forward)}>
                <AccountStep name={name} onAuthed={goNext} onSkip={goNext} back={goPrev} onSaveState={saveStateForRedirect} gradient={gradient} />
              </motion.div>
            ) : stepKey === 'friends' ? (
              <motion.div key="friends" {...slide(forward)}>
                <FriendsStep name={name} next={goNext} back={goPrev} gradient={gradient} />
              </motion.div>
            ) : (
              <motion.div key="code" {...slide(forward)}>
                <FriendCodeStep finish={finish} back={goPrev} gradient={gradient} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step dots */}
        {!shortcut && (
          <div className="flex items-center gap-2">
            {steps.map((k, i) => (
              <motion.div
                key={k}
                animate={{ width: i === idx ? 28 : 8, opacity: i === idx ? 1 : 0.35 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="h-2 rounded-full"
                style={{ background: i === idx ? gradient : '#6366f1' }}
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
      style={{ background: gradient, boxShadow: disabled ? 'none' : '0 10px 30px rgba(0,0,0,0.18)' }}
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

function GlassSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-4 py-3.5 rounded-2xl bg-white/30 border border-white/50 text-ink-900 focus:outline-none focus:ring-2 focus:ring-white/70 focus:bg-white/50 transition text-base cursor-pointer"
    >
      {children}
    </select>
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

/* ─── Step: Welcome ──────────────────────────────────────────────────── */

function WelcomeStep({ onStart, onDemo, onShortcut, gradient }: { onStart: () => void; onDemo: () => void; onShortcut: () => void; gradient: string }) {
  return (
    <GlassCard className="p-8 md:p-10 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="font-display text-3xl md:text-4xl font-extrabold text-ink-900"
      >
        Willkommen!
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="text-ink-600 mt-2 leading-relaxed"
      >
        Alle Noten, Aufgaben und der Stundenplan an einem Ort.
        <br />
        <span className="text-sm text-ink-400">In 2 Minuten eingerichtet.</span>
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
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
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className="mt-6 flex items-center justify-center gap-2 flex-wrap"
      >
        {['Bayern & Oberstufe', 'Live-Stundenplan', 'Abi-Rechner', 'Cloud Sync'].map(t => (
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

  useEffect(() => {
    if (mode !== 'login' && mode !== 'signup') return;
    if (!authUser) return;
    const t = setTimeout(() => { void onFinish(); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, mode]);

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err);
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
                    <div className="text-xs text-ink-500 mt-0.5">Alle Geräte synchronisieren sich automatisch. Empfohlen.</div>
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
                <div className="text-xs text-ink-500 mt-0.5">Vorher per „Exportieren" in den Einstellungen gesichert.</div>
              </div>
              <ChevronRight className="size-5 text-ink-400" />
            </div>
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          </label>
        </div>
      )}

      {(mode === 'login' || mode === 'signup') && !authUser && (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-semibold text-ink-700">{mode === 'login' ? 'Anmelden' : 'Registrieren'}</div>
          <GlassInput value={email} onChange={setEmail} placeholder="E-Mail" type="email" autoFocus />
          <GlassInput value={password} onChange={setPassword} placeholder="Passwort" type="password" onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600 px-1">{error}</div>}
          <PrimaryBtn onClick={submit} disabled={loading || !email || !password} gradient={gradient}>
            {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden & Daten laden' : 'Registrieren'}
          </PrimaryBtn>
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full py-2 text-xs text-ink-500 hover:text-ink-800 transition">
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
          {importStatus && <div className="text-xs text-emerald-700 mt-2">{importStatus}</div>}
        </div>
      )}
    </GlassCard>
  );
}

/* ─── Step: Profil ───────────────────────────────────────────────────── */

function ProfileStep({ name, setName, avatar, setAvatar, school, setSchool, classLevel, setClassLevel, region, setRegion, next, back, gradient }: {
  name: string; setName: (n: string) => void;
  avatar: string; setAvatar: (a: string) => void;
  school: string; setSchool: (s: string) => void;
  classLevel: string; setClassLevel: (c: string) => void;
  region: RegionCode; setRegion: (r: RegionCode) => void;
  next: () => void; back: () => void; gradient: string;
}) {
  const subOptions = subdivisionsForCountry(region.country);
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900 flex items-center gap-2"><Hand className="size-6 text-theme-deep" />Erzähl uns etwas über dich</h2>
      <AnimatePresence mode="wait">
        {name.trim() ? (
          <motion.p
            key="hi"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-sm mt-1 font-semibold"
            style={{ color: 'var(--theme-primary-deep)' }}
          >
            Hallo {name.trim()}! Schön, dass du da bist. 👋
          </motion.p>
        ) : (
          <motion.p key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-ink-500 text-sm mt-1">
            Alles optional – kannst du auch später in den Einstellungen ändern.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-6 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Name</label>
          <GlassInput value={name} onChange={setName} placeholder="Dein Name" autoFocus onKeyDown={e => e.key === 'Enter' && next()} />
        </div>

        {/* Profilbild */}
        <div>
          <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Profilbild</label>
          <AvatarUpload value={avatar || undefined} onChange={url => setAvatar(url ?? '')} name={name} />
        </div>

        {/* Schule + Klasse */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Schule</label>
            <GlassInput value={school} onChange={setSchool} placeholder="z. B. Albertus-Magnus-Gymnasium" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Klasse</label>
            <GlassInput value={classLevel} onChange={setClassLevel} placeholder="11" />
          </div>
        </div>

        {/* Land + Bundesland (für Ferien & Abi-Berechnung) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1 flex items-center gap-1"><MapPin className="size-3" />Land</label>
            <GlassSelect value={region.country} onChange={c => setRegion({ country: c, subdivision: undefined })}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </GlassSelect>
          </div>
          {subOptions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Bundesland</label>
              <GlassSelect value={region.subdivision ?? ''} onChange={s => setRegion({ ...region, subdivision: s || undefined })}>
                <option value="">– wählen –</option>
                {subOptions.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </GlassSelect>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step: Stufe & Notensystem ──────────────────────────────────────── */

function StufeStep({ name, system, regularSystem, oberG8, setOberG8, pickRegular, pickRegularSystem, pickOberstufe, next, back, gradient }: {
  name: string;
  system: GradingSystem; regularSystem: GradingSystem;
  oberG8: boolean; setOberG8: (v: boolean) => void;
  pickRegular: () => void; pickRegularSystem: (v: GradingSystem) => void; pickOberstufe: () => void;
  next: () => void; back: () => void; gradient: string;
}) {
  const isOber = system === 'oberstufe';
  const regularOpts: { v: GradingSystem; title: string; sub: string; icon: React.ReactNode }[] = [
    { v: 'bayern',  title: 'Bayern',              sub: 'Noten 1–6, Haupt- & Nebenfächer',      icon: <BookOpen className="size-4.5" /> },
    { v: 'austria', title: 'Österreich',          sub: 'Noten 1–5, Sehr gut – Nicht genügend', icon: <Flag className="size-4.5" /> },
    { v: 'custom',  title: 'Frei konfigurierbar', sub: 'Min, Max, Schrittweite frei wählbar',  icon: <SettingsIcon className="size-4.5" /> },
  ];
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">{name.trim() ? `${name.trim()}, in welcher Stufe bist du?` : 'In welcher Stufe bist du?'}</h2>
      <p className="text-ink-500 text-sm mt-1">Bestimmt, wie deine Noten berechnet werden.</p>

      <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
        <SelectCard
          active={!isOber} onClick={pickRegular}
          title="Unter- & Mittelstufe" sub="Reguläres Schuljahr mit Schulnoten"
          icon={<BookOpen className="size-4.5" />} gradient={gradient}
        />
        <SelectCard
          active={isOber} onClick={pickOberstufe}
          title="Oberstufe / Q-Phase" sub="Punkte 0–15, Halbjahre & Abi-Rechner"
          icon={<GraduationCap className="size-4.5" />} gradient={gradient}
        />
      </div>

      <AnimatePresence mode="wait">
        {isOber ? (
          <motion.div key="ober" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4">
              <div className="text-xs font-semibold text-ink-600 mb-1.5 pl-1">Jahrgangsstufen</div>
              <div className="grid grid-cols-2 gap-2.5">
                <SelectCard active={!oberG8} onClick={() => setOberG8(false)} title="G9 · 12/13" sub="Abitur nach 9 Jahren Gymnasium" gradient={gradient} />
                <SelectCard active={oberG8} onClick={() => setOberG8(true)} title="G8 · 11/12" sub="Abitur nach 8 Jahren Gymnasium" gradient={gradient} />
              </div>
              <div className="text-[11px] text-ink-400 mt-2 pl-1">Der Abi-Rechner ist auf Bayern (G9, Abitur ab 2026) ausgelegt.</div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="reg" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4">
              <div className="text-xs font-semibold text-ink-600 mb-1.5 pl-1">Notensystem</div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {regularOpts.map(o => (
                  <SelectCard key={o.v} active={regularSystem === o.v} onClick={() => pickRegularSystem(o.v)} title={o.title} sub={o.sub} icon={o.icon} gradient={gradient} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step: Fächer ───────────────────────────────────────────────────── */

function SubjectsStep({ name, subjects, system, toggle, removeSubject, addCustom, next, back, gradient }: {
  name: string;
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
      <h2 className="font-display text-2xl font-extrabold text-ink-900">{name.trim() ? `Welche Fächer hast du, ${name.trim()}?` : 'Welche Fächer hast du?'}</h2>
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
                : { background: 'rgba(255,255,255,0.45)', color: '#475569', borderColor: 'rgba(255,255,255,0.5)' }}
            >
              <span className="inline-flex items-center gap-1">{active && <Check className="size-3.5" />}{s.name}</span>
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
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mt-4 rounded-2xl bg-white/40 border border-white/55 overflow-hidden"
          >
            <div className="px-4 py-2 text-xs font-semibold text-ink-500 border-b border-white/40">
              {subjects.length} Fach{subjects.length !== 1 ? 'fächer' : ''} ausgewählt
            </div>
            <div className="divide-y divide-white/40 max-h-44 overflow-y-auto">
              {subjects.map(s => (
                <div key={s.name} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="size-8 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: s.color }}><SubjectIcon subject={s} className="size-4" /></div>
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

/* ─── Step: Abiturfächer (nur Oberstufe) ─────────────────────────────── */

function AbiStep({ subjects, examNames, setExamNames, fullNames, setFullNames, next, back, gradient }: {
  subjects: Draft[];
  examNames: string[]; setExamNames: (f: (prev: string[]) => string[]) => void;
  fullNames: string[]; setFullNames: (f: (prev: string[]) => string[]) => void;
  next: () => void; back: () => void; gradient: string;
}) {
  function toggleExam(n: string) {
    setExamNames(prev => prev.includes(n)
      ? prev.filter(x => x !== n)
      : prev.length < MAX_ABI_FAECHER ? [...prev, n] : prev);
  }
  function toggleFull(n: string) {
    setFullNames(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Abitur & Leistungsfächer</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Markiere bis zu {MAX_ABI_FAECHER} Abiturprüfungsfächer (★) und – optional – Fächer, deren
        Halbjahre komplett eingebracht werden (◆). Punkte trägst du später im Abi-Rechner ein. Alles änderbar.
      </p>

      {subjects.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-white/40 border border-white/55 p-4 text-sm text-ink-500 text-center">
          Du hast noch keine Fächer gewählt – einfach überspringen, das geht später im Abi-Rechner.
        </div>
      ) : (
        <>
          <div className="mt-4 text-xs font-semibold text-ink-500">{examNames.length}/{MAX_ABI_FAECHER} Prüfungsfächer</div>
          <div className="mt-2 rounded-2xl bg-white/40 border border-white/55 divide-y divide-white/40 max-h-64 overflow-y-auto">
            {subjects.map(s => {
              const isExam = examNames.includes(s.name);
              const isFull = isExam || fullNames.includes(s.name);
              const examDisabled = !isExam && examNames.length >= MAX_ABI_FAECHER;
              return (
                <div key={s.name} className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="size-8 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: s.color }}><SubjectIcon subject={s} className="size-4" /></div>
                  <div className="flex-1 min-w-0 text-sm font-medium text-ink-800 truncate">{s.name}</div>
                  <button
                    onClick={() => toggleExam(s.name)}
                    disabled={examDisabled}
                    title="Abiturprüfungsfach"
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border transition ${isExam ? 'text-white border-transparent' : 'text-ink-500 border-white/60 bg-white/40 hover:bg-white/70'} ${examDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    style={isExam ? { background: gradient } : undefined}
                  >
                    <Star className="size-3.5" />Abi
                  </button>
                  <button
                    onClick={() => { if (!isExam) toggleFull(s.name); }}
                    disabled={isExam}
                    title={isExam ? 'Abiturfach wird immer komplett eingebracht' : 'Alle Halbjahre verpflichtend einbringen'}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border transition ${isFull ? 'bg-indigo-500 text-white border-indigo-500' : 'text-ink-500 border-white/60 bg-white/40 hover:bg-white/70'} ${isExam ? 'opacity-70 cursor-default' : ''}`}
                  >
                    ◆ Komplett
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step: Stundenplan (optional) ───────────────────────────────────── */

function PlanStep({ subjects, lessons, setLessons, next, back, gradient }: {
  subjects: Draft[]; lessons: DraftLesson[]; setLessons: (f: (prev: DraftLesson[]) => DraftLesson[]) => void;
  next: () => void; back: () => void; gradient: string;
}) {
  function addRow() {
    if (subjects.length === 0) return;
    setLessons(prev => [...prev, { subjectName: subjects[0].name, weekday: 1, start: '08:00', end: '08:45' }]);
  }
  function update(i: number, patch: Partial<DraftLesson>) {
    setLessons(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function remove(i: number) {
    setLessons(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Stundenplan</h2>
      <p className="text-ink-500 text-sm mt-1">Optional – ein paar Stunden eintragen, oder einfach überspringen.</p>

      {subjects.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-white/40 border border-white/55 p-4 text-sm text-ink-500 text-center">
          Erst Fächer wählen, dann kannst du hier Stunden eintragen.
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {lessons.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-2xl bg-white/40 border border-white/55 p-2">
              <select
                value={l.subjectName}
                onChange={e => update(i, { subjectName: e.target.value })}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-xl bg-white/60 border border-white/50 text-sm text-ink-800 focus:outline-none cursor-pointer"
              >
                {subjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <select
                value={l.weekday}
                onChange={e => update(i, { weekday: Number(e.target.value) as Weekday })}
                className="px-2 py-1.5 rounded-xl bg-white/60 border border-white/50 text-sm text-ink-800 focus:outline-none cursor-pointer"
              >
                {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input type="time" value={l.start} onChange={e => update(i, { start: e.target.value })}
                className="px-1.5 py-1.5 rounded-xl bg-white/60 border border-white/50 text-sm text-ink-800 focus:outline-none w-[5.5rem]" />
              <input type="time" value={l.end} onChange={e => update(i, { end: e.target.value })}
                className="px-1.5 py-1.5 rounded-xl bg-white/60 border border-white/50 text-sm text-ink-800 focus:outline-none w-[5.5rem]" />
              <button onClick={() => remove(i)} className="size-7 rounded-full hover:bg-rose-100 text-ink-400 hover:text-rose-500 grid place-items-center transition flex-shrink-0">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="w-full py-2.5 rounded-2xl border border-dashed border-ink-300 text-ink-500 hover:text-ink-700 hover:border-ink-400 bg-white/30 transition flex items-center justify-center gap-1.5 text-sm font-medium"
          >
            <Plus className="size-4" /> Stunde hinzufügen
          </button>
        </div>
      )}

      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          {lessons.length ? `Mit ${lessons.length} Stunde${lessons.length !== 1 ? 'n' : ''} weiter` : 'Weiter'}
          <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step: Account ──────────────────────────────────────────────────── */

function AccountStep({ name, onAuthed, onSkip, back, onSaveState, gradient }: {
  name: string;
  onAuthed: () => void; onSkip: () => void; back: () => void; onSaveState: () => void; gradient: string;
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
    if (err) setError(err); else onAuthed();
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
        Optional{name.trim() ? `, ${name.trim()}` : ''} – mit Konto syncst du zwischen deinen Geräten und kannst dich
        mit Freunden vernetzen (Stundenplan & Hausaufgaben teilen).<br />
        Ohne Konto geht's auch – das lässt sich später in den Einstellungen nachholen.
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
          <GlassInput value={password} onChange={setPassword} placeholder="Passwort (mind. 6 Zeichen)" type="password" onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600 px-1">{error}</div>}
          <PrimaryBtn onClick={submit} disabled={loading || !email || !password} gradient={gradient}>
            {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </PrimaryBtn>
          <button onClick={() => setMode('choice')} className="w-full py-2 text-sm text-ink-400 hover:text-ink-600 transition">
            ← Zurück
          </button>
        </div>
      )}

      <button onClick={onSkip} className="mt-4 w-full py-2 text-sm text-ink-400 hover:text-ink-600 transition">
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

/* ─── Step: Freunde (nur eingeloggt) ─────────────────────────────────── */

function FriendsStep({ name, next, back, gradient }: { name: string; next: () => void; back: () => void; gradient: string }) {
  const sendFriendRequest = useStore(s => s.sendFriendRequest);
  const myProfile = useStore(s => s.myProfile);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  async function send() {
    const c = code.trim();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      await sendFriendRequest(c);
      setSent(prev => [...prev, c.toUpperCase()]);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900 flex items-center gap-2"><Users className="size-6 text-theme-deep" />Freunde hinzufügen</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Hast du den Freundecode eines Mitschülers{name.trim() ? `, ${name.trim()}` : ''}? Gib ihn ein, um eine Anfrage zu
        senden. Ihr könnt dann Hausaufgaben & Stundenpläne teilen. <span className="text-ink-400">Kannst du auch später machen.</span>
      </p>

      {myProfile?.friendCode && (
        <div className="mt-4 rounded-2xl bg-white/55 border border-white/65 p-3 text-center">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Dein Freundecode</div>
          <div className="font-display font-extrabold text-2xl tracking-[0.2em] text-ink-900 mt-0.5">{myProfile.friendCode}</div>
          <div className="text-xs text-ink-500 mt-0.5">Teile ihn mit Freunden, damit sie dich finden.</div>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Code des Freundes"
          onKeyDown={e => e.key === 'Enter' && send()}
          className="flex-1 px-4 py-3.5 rounded-2xl bg-white/30 border border-white/50 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-white/70 focus:bg-white/50 transition text-base tracking-widest uppercase"
        />
        <button
          onClick={send}
          disabled={busy || !code.trim()}
          className="px-5 rounded-2xl text-white font-semibold flex items-center gap-1.5 disabled:opacity-40"
          style={{ background: gradient }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Senden
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded-2xl bg-rose-50 border border-rose-200 p-2.5 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}
      {sent.length > 0 && (
        <div className="mt-3 space-y-1">
          {sent.map(c => (
            <div key={c} className="flex items-center gap-2 text-sm text-emerald-700">
              <Check className="size-4" />Anfrage an <span className="font-semibold tracking-wider">{c}</span> gesendet
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <PrimaryBtn onClick={next} gradient={gradient}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}

/* ─── Step: Stundenplan-Code vom Freund (Abschluss) ──────────────────── */

function FriendCodeStep({ finish, back, gradient }: {
  finish: () => void; back: () => void; gradient: string;
}) {
  const authUser = useStore(s => s.authUser);
  const importSharedSchedule = useStore(s => s.importSharedSchedule);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ ownerName?: string; subjects: number; lessons: number; payload: import('@/lib/scheduleShare').SharePayload } | null>(null);

  async function lookup() {
    setError(null);
    setBusy(true);
    try {
      const mod = await import('@/lib/scheduleShare');
      const info = await mod.fetchScheduleShare(code);
      setPreview({
        ownerName: info.payload.ownerName,
        subjects: info.payload.subjects.length,
        lessons: info.payload.lessons.length,
        payload: info.payload,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function adoptAndFinish() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await finish();
      await new Promise(r => setTimeout(r, 200));
      await importSharedSchedule(preview.payload, 'replace');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!authUser) {
    return (
      <GlassCard className="p-8 text-center">
        <BackBtn onClick={back} />
        <h2 className="font-display text-2xl font-extrabold text-ink-900">Fast fertig!</h2>
        <p className="text-ink-500 text-sm mt-2">Klick weiter, dann landen wir im Dashboard.</p>
        <div className="mt-6">
          <PrimaryBtn onClick={finish} gradient={gradient}>
            Los geht's <ChevronRight className="size-4" />
          </PrimaryBtn>
        </div>
      </GlassCard>
    );
  }

  if (preview) {
    return (
      <GlassCard className="p-8">
        <BackBtn onClick={() => { setPreview(null); setCode(''); setError(null); }} />
        <h2 className="font-display text-2xl font-extrabold text-ink-900">Stundenplan gefunden!</h2>
        <div className="mt-4 rounded-2xl bg-white/55 border border-white/65 p-4">
          <div className="text-xs uppercase tracking-wider font-semibold text-ink-500 mb-1">Vorschau</div>
          <div className="font-display font-bold text-lg text-ink-900">
            {preview.ownerName ? `${preview.ownerName}s Stundenplan` : 'Stundenplan'}
          </div>
          <div className="text-sm text-ink-600 mt-0.5">{preview.subjects} Fächer · {preview.lessons} Stunden</div>
        </div>
        <div className="text-xs text-ink-500 mt-3 leading-relaxed">
          Wenn du übernimmst, werden die Fächer aus dem Code zu deinen hinzugefügt
          (gleichnamige werden zusammengeführt) und alle Stunden in dein aktuelles Schuljahr eingetragen.
        </div>
        <div className="mt-5 space-y-2">
          <PrimaryBtn onClick={adoptAndFinish} disabled={busy} gradient={gradient}>
            {busy ? <><Loader2 className="size-4 animate-spin" />Übernehme …</> : <>Übernehmen & los geht's</>}
          </PrimaryBtn>
          <button onClick={finish} disabled={busy} className="w-full py-2.5 rounded-2xl text-ink-500 hover:text-ink-700 text-sm flex items-center justify-center gap-2 transition">
            Ohne übernehmen weiter
          </button>
        </div>
        {error && <div className="text-xs text-rose-600 mt-2 px-1">{error}</div>}
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Stundenplan vom Freund?</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Wenn jemand aus deiner Klasse dir einen 4-stelligen Code geschickt hat,
        kannst du den jetzt eingeben. Sonst einfach überspringen.
      </p>

      <div className="mt-6 space-y-3">
        <FriendCodeBoxes value={code} onChange={setCode} />
        <PrimaryBtn onClick={lookup} disabled={busy || code.length !== 4} gradient={gradient}>
          {busy ? <><Loader2 className="size-4 animate-spin" />Suche …</> : <>Code prüfen <ChevronRight className="size-4" /></>}
        </PrimaryBtn>
        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />{error}
          </div>
        )}
        <button onClick={finish} className="w-full py-2.5 rounded-2xl text-ink-500 hover:text-ink-700 text-sm flex items-center justify-center gap-2 transition">
          Habe keinen Code – überspringen
        </button>
      </div>
    </GlassCard>
  );
}

function FriendCodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function normalize(raw: string): string {
    return raw.toUpperCase().split('').filter(c => ALPHABET.includes(c)).join('').slice(0, 4);
  }
  const chars = value.padEnd(4, ' ').slice(0, 4).split('');

  return (
    <div className="space-y-3">
      <div className="flex gap-2 justify-center">
        {chars.map((c, i) => (
          <div key={i}
            className={`size-14 md:size-16 rounded-2xl border-2 grid place-items-center font-display font-extrabold text-3xl md:text-4xl transition ${
              c.trim() ? 'border-white/80 bg-white/70 text-ink-900' : 'border-white/40 bg-white/25 text-white/40'
            }`}>
            {c.trim() || '·'}
          </div>
        ))}
      </div>
      <input
        autoFocus
        value={value}
        onChange={e => onChange(normalize(e.target.value))}
        placeholder="ABCD"
        maxLength={4}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="w-full px-4 py-3.5 rounded-2xl bg-white/40 border border-white/50 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-white/70 focus:bg-white/60 transition text-center text-2xl font-display font-bold tracking-[0.3em] uppercase"
      />
    </div>
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
