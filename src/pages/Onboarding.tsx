import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, Plus, Trash2, Wand2, BookOpen, Trophy, ArrowLeft, Flag, Settings as SettingsIcon, Cloud } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { installDemo } from '@/lib/demo';
import { SUBJECT_COLORS } from '@/types';
import type { GradingSystem, Subject } from '@/types';

type Draft = Omit<Subject, 'id' | 'createdAt'>;

const STARTER_SUBJECTS: Array<Pick<Draft, 'name' | 'short' | 'category'>> = [
  { name: 'Mathematik', short: 'M', category: 'haupt' },
  { name: 'Deutsch', short: 'D', category: 'haupt' },
  { name: 'Englisch', short: 'E', category: 'haupt' },
  { name: 'Latein', short: 'L', category: 'haupt' },
  { name: 'Französisch', short: 'F', category: 'haupt' },
  { name: 'Physik', short: 'Ph', category: 'neben' },
  { name: 'Chemie', short: 'Ch', category: 'neben' },
  { name: 'Biologie', short: 'Bi', category: 'neben' },
  { name: 'Geschichte', short: 'G', category: 'neben' },
  { name: 'Geographie', short: 'Geo', category: 'neben' },
  { name: 'Kunst', short: 'Ku', category: 'neben' },
  { name: 'Musik', short: 'Mu', category: 'neben' },
  { name: 'Sport', short: 'Sp', category: 'neben' },
  { name: 'Religion', short: 'Rel', category: 'neben' },
  { name: 'Ethik', short: 'Eth', category: 'neben' },
  { name: 'Informatik', short: 'Inf', category: 'neben' },
];

export function Onboarding() {
  const setSettings = useStore(s => s.setSettings);
  const addSubject = useStore(s => s.addSubject);
  const load = useStore(s => s.load);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [system, setSystem] = useState<GradingSystem>('bayern');
  const [subjects, setSubjects] = useState<Draft[]>([]);

  function toggleStarter(s: typeof STARTER_SUBJECTS[number]) {
    setSubjects(prev => {
      const exists = prev.find(p => p.name === s.name);
      if (exists) return prev.filter(p => p.name !== s.name);
      const color = SUBJECT_COLORS[prev.length % SUBJECT_COLORS.length];
      return [...prev, { ...s, color, system }];
    });
  }
  function removeSubject(name: string) {
    setSubjects(prev => prev.filter(p => p.name !== name));
  }
  function addCustom() {
    const customName = prompt('Wie heißt das Fach?');
    if (!customName?.trim()) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    setSubjects(prev => [...prev, { name: customName.trim(), short: customName.trim().slice(0, 2), color, category: 'neben', system }]);
  }

  async function finish() {
    for (const s of subjects) {
      await addSubject({ ...s, system });
    }
    await setSettings({ name: name.trim() || undefined, system, onboarded: true, demo: false });
    await load();
  }

  async function tryDemo() {
    await installDemo();
    await load();
  }

  const next = () => setStep(s => Math.min(4, s + 1));
  const prev = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="relative min-h-screen overflow-hidden bg-aurora-blue">
      <Blobs />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-5">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="w" {...fade}>
                <Welcome onStart={next} onDemo={async () => { await tryDemo(); }} />
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="n" {...fade}>
                <NameStep name={name} setName={setName} next={next} back={prev} />
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s" {...fade}>
                <SystemStep system={system} setSystem={setSystem} next={next} back={prev} />
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="f" {...fade}>
                <SubjectsStep
                  subjects={subjects}
                  system={system}
                  toggle={toggleStarter}
                  removeSubject={removeSubject}
                  addCustom={addCustom}
                  finish={next}
                  back={prev}
                />
              </motion.div>
            )}
            {step === 4 && (
              <motion.div key="a" {...fade}>
                <AccountStep finish={finish} back={prev} />
              </motion.div>
            )}
          </AnimatePresence>
          <Steps current={step} />
        </div>
      </div>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16, scale: 0.98 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
};

function Steps({ current }: { current: number }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === current ? 'w-8 bg-indigo-500' : 'w-1.5 bg-ink-300'}`} />
      ))}
    </div>
  );
}

function Blobs() {
  return (
    <>
      <div className="absolute -top-32 -left-24 size-[420px] rounded-full bg-indigo-300/40 blur-3xl animate-blob" />
      <div className="absolute top-1/3 -right-24 size-[360px] rounded-full bg-fuchsia-300/40 blur-3xl animate-blob" style={{ animationDelay: '4s' }} />
      <div className="absolute bottom-0 left-1/3 size-[360px] rounded-full bg-sky-300/40 blur-3xl animate-blob" style={{ animationDelay: '8s' }} />
    </>
  );
}

function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="glass-strong rounded-[2.5rem] p-8 md:p-10 shadow-soft text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
        className="mx-auto size-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 grid place-items-center shadow-glow"
      >
        <Sparkles className="size-10 text-white" />
      </motion.div>
      <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink-900 mt-6">Willkommen in deiner Notenapp</h1>
      <p className="text-ink-600 mt-3 text-balance">
        Alle Noten, Aufgaben und der Stundenplan an einem Ort. Schön, schnell und ganz für dich gemacht.
      </p>
      <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onStart} className="btn-primary text-base px-6 py-3">
          Los geht's
          <ChevronRight className="size-4" />
        </button>
        <button onClick={onDemo} className="btn-ghost text-base px-6 py-3">
          <Wand2 className="size-4" />
          Demo ansehen
        </button>
      </div>
      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-ink-500">
        <Feature icon="📚" text="Bayern & Oberstufe" />
        <Feature icon="🗓️" text="Stundenplan" />
        <Feature icon="📈" text="Notenverlauf" />
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return <span className="chip"><span>{icon}</span> {text}</span>;
}

function NameStep({ name, setName, next, back }: { name: string; setName: (n: string) => void; next: () => void; back: () => void }) {
  return (
    <div className="glass-strong rounded-[2.5rem] p-8 md:p-10 shadow-soft">
      <BackButton onClick={back} />
      <h2 className="font-display text-2xl md:text-3xl font-extrabold text-ink-900">Wie heißt du? 👋</h2>
      <p className="text-ink-600 mt-1">Optional – nur für die persönliche Begrüßung.</p>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Dein Name"
        className="input text-lg mt-6 py-4"
        onKeyDown={e => e.key === 'Enter' && next()}
      />
      <button onClick={next} className="btn-primary mt-6 w-full py-3 text-base">
        Weiter <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function SystemStep({ system, setSystem, next, back }: { system: GradingSystem; setSystem: (s: GradingSystem) => void; next: () => void; back: () => void }) {
  return (
    <div className="glass-strong rounded-[2.5rem] p-8 md:p-10 shadow-soft">
      <BackButton onClick={back} />
      <h2 className="font-display text-2xl md:text-3xl font-extrabold text-ink-900">Welches Notensystem nutzt du?</h2>
      <p className="text-ink-600 mt-1">Du kannst es später pro Fach anpassen.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <SystemCard
          active={system === 'bayern'}
          onClick={() => setSystem('bayern')}
          title="Bayern"
          subtitle="Ganze Noten 1–6, Haupt- & Nebenfächer"
          icon={<BookOpen className="size-6" />}
          accent="from-indigo-500 to-violet-500"
        />
        <SystemCard
          active={system === 'oberstufe'}
          onClick={() => setSystem('oberstufe')}
          title="Oberstufe / Abitur"
          subtitle="Punkte 0–15, mit Gewichtung pro Note"
          icon={<Trophy className="size-6" />}
          accent="from-emerald-500 to-teal-500"
        />
        <SystemCard
          active={system === 'austria'}
          onClick={() => setSystem('austria')}
          title="Österreich"
          subtitle="Noten 1–5, Sehr gut bis Nicht genügend"
          icon={<Flag className="size-6" />}
          accent="from-rose-500 to-pink-500"
        />
        <SystemCard
          active={system === 'custom'}
          onClick={() => setSystem('custom')}
          title="Frei konfigurierbar"
          subtitle="Min, Max, Schrittweite frei wählbar"
          icon={<SettingsIcon className="size-6" />}
          accent="from-amber-500 to-orange-500"
        />
      </div>
      <button onClick={next} className="btn-primary mt-6 w-full py-3 text-base">
        Weiter <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function SystemCard({ active, onClick, title, subtitle, icon, accent }: { active: boolean; onClick: () => void; title: string; subtitle: string; icon: React.ReactNode; accent: string }) {
  return (
    <button onClick={onClick} className={`relative text-left rounded-3xl p-5 transition border ${active ? 'border-indigo-300 bg-white shadow-glow' : 'border-white/70 bg-white/60 hover:bg-white'}`}>
      <div className={`size-11 rounded-2xl grid place-items-center text-white bg-gradient-to-br ${accent} shadow-soft`}>{icon}</div>
      <div className="mt-3 font-display font-bold text-ink-900">{title}</div>
      <div className="text-sm text-ink-500 mt-1">{subtitle}</div>
      {active && <div className="absolute top-3 right-3 chip bg-indigo-500 text-white border-indigo-500">Ausgewählt</div>}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-medium text-ink-500 hover:text-ink-800 inline-flex items-center gap-1 mb-3">
      <ArrowLeft className="size-4" /> Zurück
    </button>
  );
}

function SubjectsStep({ subjects, system, toggle, removeSubject, addCustom, finish, back }: {
  subjects: Draft[];
  system: GradingSystem;
  toggle: (s: typeof STARTER_SUBJECTS[number]) => void;
  removeSubject: (name: string) => void;
  addCustom: () => void;
  finish: () => void;  // goes to next step (AccountStep)
  back: () => void;
}) {
  return (
    <div className="glass-strong rounded-[2.5rem] p-8 md:p-10 shadow-soft">
      <BackButton onClick={back} />
      <h2 className="font-display text-2xl md:text-3xl font-extrabold text-ink-900">Welche Fächer hast du?</h2>
      <p className="text-ink-600 mt-1">Tippe zum Hinzufügen. Du kannst später jedes Fach anpassen.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {STARTER_SUBJECTS.map(s => {
          const active = !!subjects.find(p => p.name === s.name);
          return (
            <button key={s.name} onClick={() => toggle(s)}
              className={`chip px-3 py-2 text-sm transition ${active ? 'bg-indigo-500 text-white border-indigo-500' : 'hover:bg-white'}`}>
              {active ? '✓ ' : '+ '}{s.name}
            </button>
          );
        })}
        <button onClick={addCustom} className="chip px-3 py-2 text-sm border-dashed">
          <Plus className="size-3.5" /> Eigenes Fach
        </button>
      </div>

      {subjects.length > 0 && (
        <div className="mt-5 rounded-3xl bg-white/60 p-3 border border-white/70">
          <div className="text-xs font-semibold text-ink-500 px-2 py-1">Deine Fächer ({subjects.length})</div>
          <div className="flex flex-col divide-y divide-white/60">
            {subjects.map(s => (
              <div key={s.name} className="flex items-center gap-3 px-2 py-2.5">
                <div className="size-9 rounded-xl grid place-items-center text-white font-display font-bold text-sm" style={{ background: s.color }}>{s.short}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink-800 truncate">{s.name}</div>
                  <div className="text-xs text-ink-500">{s.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'} · {system === 'bayern' ? '1–6' : system === 'oberstufe' ? '0–15' : system === 'austria' ? '1–5' : 'Frei'}</div>
                </div>
                <button onClick={() => removeSubject(s.name)} className="size-9 grid place-items-center rounded-full hover:bg-rose-100 text-ink-400 hover:text-rose-500"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={finish} className="btn-primary mt-6 w-full py-3 text-base">
        {subjects.length ? `Mit ${subjects.length} Fächern weiter` : 'Weiter'}
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function AccountStep({ finish, back }: { finish: () => void; back: () => void }) {
  const { signIn, signUp, signInWithGoogle } = useStore();
  const [mode, setMode] = useState<'choice' | 'login' | 'signup'>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err); else finish();
  }

  async function handleGoogle() {
    await signInWithGoogle();
    // OAuth redirect — finish() wird nach Rückkehr automatisch ausgelöst
  }

  return (
    <div className="glass-strong rounded-[2.5rem] p-8 md:p-10 shadow-soft">
      <BackButton onClick={back} />
      <div className="mx-auto size-14 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center shadow-glow mb-4">
        <Cloud className="size-7 text-white" />
      </div>
      <h2 className="font-display text-2xl md:text-3xl font-extrabold text-ink-900">Konto erstellen (optional)</h2>
      <p className="text-ink-600 mt-1 text-sm">Damit kannst du deine Daten zwischen Geräten synchronisieren. Du kannst das auch später in den Einstellungen tun.</p>

      {!supabase ? (
        <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          Cloud Sync ist noch nicht eingerichtet. Du kannst die App trotzdem voll nutzen!
        </div>
      ) : mode === 'choice' ? (
        <div className="mt-6 space-y-2">
          <button onClick={() => setMode('signup')} className="btn-primary w-full py-3 text-base">
            <Plus className="size-4" /> Neu registrieren
          </button>
          <button onClick={handleGoogle} className="btn-ghost w-full py-3 text-base">
            <svg className="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Mit Google anmelden
          </button>
          <button onClick={() => setMode('login')} className="btn-ghost w-full text-sm text-ink-500">
            Ich habe schon ein Konto
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-semibold text-ink-700">{mode === 'login' ? 'Anmelden' : 'Registrieren'}</div>
          <input className="input" type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          <input className="input" type="password" placeholder="Passwort (mind. 6 Zeichen)" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <button onClick={submit} disabled={loading || !email || !password} className="btn-primary w-full py-3">
            {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>
          <button onClick={() => setMode('choice')} className="btn-ghost w-full text-sm">Zurück</button>
        </div>
      )}

      <button onClick={finish} className="mt-4 w-full text-sm text-ink-400 hover:text-ink-600 transition py-2">
        Überspringen – später in Einstellungen einrichten
      </button>
    </div>
  );
}
