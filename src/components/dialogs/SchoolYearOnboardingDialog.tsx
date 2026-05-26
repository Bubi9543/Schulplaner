import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ArrowLeft, BookOpen, Trophy, Flag, Settings as SettingsIcon,
  Plus, Trash2, Check, Sparkles, User, X,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { SUBJECT_COLORS } from '@/types';
import type { GradingSystem, Subject } from '@/types';
import { CATEGORY_LABEL } from '@/lib/grading';

type Draft = Omit<Subject, 'id' | 'createdAt'>;

const STARTER_SUBJECTS: Array<Pick<Draft, 'name' | 'short' | 'category'>> = [
  { name: 'Mathematik', short: 'M',   category: 'hauptfach' },
  { name: 'Deutsch',    short: 'D',   category: 'hauptfach' },
  { name: 'Englisch',   short: 'E',   category: 'hauptfach' },
  { name: 'Latein',     short: 'L',   category: 'hauptfach' },
  { name: 'Französisch',short: 'F',   category: 'hauptfach' },
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
  { name: 'Informatik', short: 'Inf', category: 'nebenfach' },
];

/** Pro-Step-Theme analog zum Haupt-Onboarding. */
const STEP_CFG = [
  { g1: '#6366f1', g2: '#7c3aed', b1: '#818cf8', b2: '#a78bfa' }, // Profil
  { g1: '#10b981', g2: '#0d9488', b1: '#6ee7b7', b2: '#5eead4' }, // System
  { g1: '#f59e0b', g2: '#ea580c', b1: '#fcd34d', b2: '#fdba74' }, // Fächer
] as const;

const STEP_ICONS = [User, Trophy, BookOpen];

interface Props {
  open: boolean;
  /** Name des frisch angelegten Schuljahrs (für Header-Anzeige). */
  yearName: string;
  /** Wird aufgerufen wenn der User fertig ist oder abbricht. */
  onClose: () => void;
}

/**
 * Wizard, der direkt nach dem Anlegen eines neuen Schuljahres OHNE Kopie
 * erscheint. Spielt das Haupt-Onboarding nach: Profil-Refresh (Schule/Klasse),
 * Notensystem für neue Fächer und Fächer-Auswahl.
 */
export function SchoolYearOnboardingDialog({ open, yearName, onClose }: Props) {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const addSubject = useStore(s => s.addSubject);

  const [step, setStep] = useState(0);
  const [prevStep, setPrevStep] = useState(0);
  const [school, setSchool] = useState(settings?.school ?? '');
  const [classLevel, setClassLevel] = useState('');
  const [system, setSystem] = useState<GradingSystem>(settings?.system ?? 'bayern');
  const [subjects, setSubjects] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

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

  function goNext() { setPrevStep(step); setStep(s => Math.min(2, s + 1)); }
  function goPrev() { setPrevStep(step); setStep(s => Math.max(0, s - 1)); }

  async function finish() {
    setSaving(true);
    try {
      // Profil + Default-System aktualisieren. (Schule/Klasse sind User-weit.)
      const patch: Parameters<typeof setSettings>[0] = { system };
      if (school.trim()) patch.school = school.trim();
      if (classLevel.trim()) patch.classLevel = classLevel.trim();
      await setSettings(patch);

      // Fächer ins aktive (= neu angelegte) Schuljahr eintragen.
      for (const s of subjects) await addSubject({ ...s, system });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  const cfg = STEP_CFG[step];
  const gradient = `linear-gradient(135deg, ${cfg.g1}, ${cfg.g2})`;
  const forward = step >= prevStep;
  const StepIcon = STEP_ICONS[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          {/* Hintergrund */}
          <div className="absolute inset-0 bg-[#f0f4ff]" />

          {/* Aurora */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              key={`b1-${step}`}
              className="absolute -top-32 -left-28 size-[400px] rounded-full blur-[90px]"
              style={{ backgroundColor: cfg.b1, opacity: 0.5, transition: 'background-color 1s ease' }}
            />
            <div
              key={`b2-${step}`}
              className="absolute -bottom-20 -right-20 size-[360px] rounded-full blur-[90px]"
              style={{ backgroundColor: cfg.b2, opacity: 0.42, transition: 'background-color 1s ease' }}
            />
          </div>

          {/* Skip oben rechts */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/40 hover:bg-white/60 backdrop-blur text-ink-700 text-xs font-semibold transition"
          >
            Überspringen <X className="size-3.5" />
          </button>

          {/* Content */}
          <div className="relative z-[1] h-full overflow-y-auto flex flex-col items-center justify-center p-5 py-14 gap-6">

            {/* Header-Badge */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur text-xs font-semibold text-ink-700 border border-white/70"
            >
              <Sparkles className="size-3.5 text-theme" />
              Schuljahr {yearName} einrichten
            </motion.div>

            {/* Hero-Icon */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`icon-${step}`}
                initial={{ scale: 0.2, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.5, rotate: 18, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 18 }}
                className="size-20 rounded-[1.75rem] grid place-items-center flex-shrink-0"
                style={{
                  background: gradient,
                  boxShadow: `0 24px 64px ${cfg.g1}55, 0 6px 20px ${cfg.g1}33`,
                }}
              >
                <StepIcon className="size-10 text-white" strokeWidth={1.5} />
              </motion.div>
            </AnimatePresence>

            {/* Step card */}
            <div className="w-full max-w-lg">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="p"
                    initial={{ opacity: 0, x: forward ? 48 : -48, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: forward ? -48 : 48, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  >
                    <ProfilStep
                      school={school} setSchool={setSchool}
                      classLevel={classLevel} setClassLevel={setClassLevel}
                      next={goNext} gradient={gradient}
                    />
                  </motion.div>
                )}
                {step === 1 && (
                  <motion.div
                    key="s"
                    initial={{ opacity: 0, x: forward ? 48 : -48, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: forward ? -48 : 48, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  >
                    <SystemStep system={system} setSystem={setSystem} next={goNext} back={goPrev} gradient={gradient} />
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div
                    key="f"
                    initial={{ opacity: 0, x: forward ? 48 : -48, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: forward ? -48 : 48, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  >
                    <SubjectsStep
                      subjects={subjects} system={system}
                      toggle={toggleStarter} removeSubject={removeSubject} addCustom={addCustom}
                      finish={finish} back={goPrev} saving={saving} gradient={gradient}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Step dots */}
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ width: i === step ? 28 : 8, opacity: i === step ? 1 : 0.35 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="h-2 rounded-full"
                  style={{ background: i === step ? gradient : '#6366f1' }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Shared primitives (lokale Kopien aus Onboarding) ───────────────── */

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

function GlassInput({ value, onChange, placeholder, autoFocus, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <input
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
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="absolute top-3 right-3 size-5 rounded-full bg-white shadow flex items-center justify-center"
        >
          <Check className="size-3 text-emerald-500" strokeWidth={3} />
        </motion.div>
      )}
    </motion.button>
  );
}

/* ─── Steps ──────────────────────────────────────────────────────────── */

function ProfilStep({ school, setSchool, classLevel, setClassLevel, next, gradient }: {
  school: string; setSchool: (v: string) => void;
  classLevel: string; setClassLevel: (v: string) => void;
  next: () => void; gradient: string;
}) {
  return (
    <GlassCard className="p-8">
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Neues Schuljahr 🎓</h2>
      <p className="text-ink-500 text-sm mt-1 leading-relaxed">
        Wenn sich Klasse oder Schule geändert haben, hier kurz aktualisieren – alles optional.
      </p>
      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Schule</label>
            <GlassInput
              value={school} onChange={setSchool}
              placeholder="z. B. Albertus-Magnus-Gymnasium" autoFocus
              onKeyDown={e => e.key === 'Enter' && next()}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5 pl-1">Klasse</label>
            <GlassInput value={classLevel} onChange={setClassLevel} placeholder="11" />
          </div>
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
      <p className="text-ink-500 text-sm mt-1">Wird als Vorgabe für die neuen Fächer dieses Jahres genutzt.</p>
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

function SubjectsStep({ subjects, system, toggle, removeSubject, addCustom, finish, back, saving, gradient }: {
  subjects: Draft[]; system: GradingSystem;
  toggle: (s: typeof STARTER_SUBJECTS[number]) => void;
  removeSubject: (name: string) => void;
  addCustom: () => void;
  finish: () => void; back: () => void; saving: boolean; gradient: string;
}) {
  const systemLabel = { bayern: '1–6', oberstufe: '0–15', austria: '1–5', custom: 'frei' }[system];
  return (
    <GlassCard className="p-8">
      <BackBtn onClick={back} />
      <h2 className="font-display text-2xl font-extrabold text-ink-900">Deine Fächer dieses Jahr?</h2>
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
        <PrimaryBtn onClick={finish} disabled={saving} gradient={gradient}>
          {saving ? 'Speichere …' : (
            <>
              {subjects.length ? `Mit ${subjects.length} Fächer${subjects.length !== 1 ? 'n' : ''} starten` : 'Ohne Fächer starten'}
              <ChevronRight className="size-4" />
            </>
          )}
        </PrimaryBtn>
      </div>
    </GlassCard>
  );
}
