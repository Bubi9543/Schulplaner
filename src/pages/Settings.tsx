import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Palette, Sparkles, LayoutDashboard, GraduationCap, BookOpen, Database, Info, Pencil, Plus, RefreshCw, Trash2, Wand2, Upload, RotateCcw, Settings as SettingsIcon, Cloud, CloudOff, LogIn, LogOut, Smartphone, Calendar, Check, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { installDemo, resetAll } from '@/lib/demo';
import { buildExport, downloadExport, importData, getExampleFile } from '@/lib/portability';
import { KIND_LABEL, CATEGORY_LABEL } from '@/lib/grading';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import { CATEGORY_DESCRIPTION } from '@/lib/grading';
import type { Subject, GradingSystem, GradeKind, ThemeMode, DensityMode, FontScale, AnimationLevel, GreetingStyle, DashboardLayout, TaskKind, AppSettings, SchoolYear } from '@/types';
import { THEME_LIST } from '@/lib/themes';

type SectionId = 'profile' | 'appearance' | 'animations' | 'dashboard' | 'grading' | 'subjects' | 'schoolyears' | 'data' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'appearance', label: 'Erscheinung', icon: Palette },
  { id: 'animations', label: 'Animationen', icon: Sparkles },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'grading', label: 'Noten & Aufgaben', icon: GraduationCap },
  { id: 'subjects',    label: 'Fächer',       icon: BookOpen },
  { id: 'schoolyears', label: 'Schuljahre',   icon: Calendar },
  { id: 'data',        label: 'Daten',        icon: Database },
  { id: 'about', label: 'Über', icon: Info },
];

export function SettingsPage() {
  const settings = useStore(s => s.settings);
  const [section, setSection] = useState<SectionId>('profile');

  if (!settings) return null;

  return (
    <PageShell title="Einstellungen" subtitle="Profil, Aussehen, Notensysteme und mehr – alles personalisierbar.">
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card className="col-span-12 md:col-span-3 lg:col-span-3 !p-2 md:sticky md:top-4 md:self-start">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible no-scrollbar">
            {SECTIONS.map(s => {
              const active = section === s.id;
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className={`relative shrink-0 md:shrink flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold transition text-left ${active ? 'text-white' : 'text-ink-700 hover:bg-white/70'}`}>
                  {active && <motion.span layoutId="settings-active" className="absolute inset-0 rounded-2xl theme-gradient" />}
                  <span className="relative flex items-center gap-2 w-full">
                    <Icon className="size-4" />
                    {s.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </Card>

        <div className="col-span-12 md:col-span-9 lg:col-span-9 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {section === 'profile' && <ProfileSection />}
              {section === 'appearance' && <AppearanceSection />}
              {section === 'animations' && <AnimationsSection />}
              {section === 'dashboard' && <DashboardSection />}
              {section === 'grading' && <GradingSection />}
              {section === 'subjects' && <SubjectsSection />}
              {section === 'schoolyears' && <SchoolYearsSection />}
              {section === 'data' && <DataSection />}
              {section === 'about' && <AboutSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-white/40 last:border-0">
      <div>
        <div className="font-semibold text-ink-800 text-sm">{label}</div>
        {hint && <div className="text-xs text-ink-500 max-w-md">{hint}</div>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex glass rounded-2xl p-1 gap-0.5">
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onChange(opt.value)}
          className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition ${value === opt.value ? 'text-white' : 'text-ink-700'}`}>
          {value === opt.value && <motion.span layoutId={`seg-${opt.label}-${String(opt.value)}`} className="absolute inset-0 rounded-xl theme-gradient" />}
          <span className="relative">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-ink-300'}`}>
      <motion.span className="absolute top-0.5 left-0.5 size-5 bg-white rounded-full shadow"
        animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
    </button>
  );
}

function ProfileSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const [name, setName] = useState(settings.name ?? '');
  const [school, setSchool] = useState(settings.school ?? '');
  const [classLevel, setClassLevel] = useState(settings.classLevel ?? '');

  function save() {
    setSettings({ name: name.trim() || undefined, school: school.trim() || undefined, classLevel: classLevel.trim() || undefined });
  }

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><User className="size-5 text-theme" />Profil</h3>
      <Row label="Name" hint="Wird für die Begrüßung im Dashboard verwendet.">
        <input className="input max-w-[260px]" value={name} onChange={e => setName(e.target.value)} onBlur={save} placeholder="Dein Name" />
      </Row>
      <Row label="Schule (optional)">
        <input className="input max-w-[260px]" value={school} onChange={e => setSchool(e.target.value)} onBlur={save} placeholder="z.B. Albertus-Magnus-Gymnasium" />
      </Row>
      <Row label="Klassenstufe (optional)">
        <input className="input max-w-[160px]" value={classLevel} onChange={e => setClassLevel(e.target.value)} onBlur={save} placeholder="z.B. 11" />
      </Row>
    </Card>
  );
}

function AppearanceSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="h3 mb-1 flex items-center gap-2"><Palette className="size-5 text-theme" />Farbtheme</h3>
        <p className="subtle mb-4">Wähle das Theme – Hintergründe, Buttons und Akzente passen sich automatisch an.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {THEME_LIST.map(t => {
            const active = settings.colorTheme === t.id;
            return (
              <button key={t.id} onClick={() => setSettings({ colorTheme: t.id })}
                className={`group relative rounded-2xl overflow-hidden border transition-all text-left ${active ? 'ring-2 ring-offset-2 ring-offset-white scale-[1.02] border-transparent' : 'border-white/70 hover:scale-[1.01]'}`}
                style={active ? { '--tw-ring-color': t.primary } as React.CSSProperties : undefined}
              >
                <div className="h-20 relative" style={{
                  background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientVia} 55%, ${t.gradientTo})`,
                }}>
                  <div className="absolute inset-0" style={{
                    background: `radial-gradient(circle at 30% 25%, rgb(${t.aurora1Rgb} / 0.45) 0, transparent 55%), radial-gradient(circle at 75% 80%, rgb(${t.aurora2Rgb} / 0.4) 0, transparent 55%)`,
                  }} />
                  {active && (
                    <div className="absolute top-2 right-2 size-6 rounded-full bg-white/95 grid place-items-center shadow-md">
                      <Check className="size-3.5" style={{ color: t.primary }} />
                    </div>
                  )}
                </div>
                <div className="bg-white/90 px-3 py-2">
                  <div className="font-display font-bold text-sm text-ink-900">{t.name}</div>
                  <div className="text-[11px] text-ink-500">{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Sparkles className="size-5 text-theme" />Darstellung</h3>
        <Row label="Theme-Modus" hint="Hell oder dunkel? Auto folgt dem System.">
          <Segmented<ThemeMode> value={settings.theme} options={[
            { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }, { value: 'auto', label: 'Auto' },
          ]} onChange={v => setSettings({ theme: v })} />
        </Row>
        <Row label="Schriftgröße">
          <Segmented<FontScale> value={settings.fontScale} options={[
            { value: 0.9, label: 'Klein' }, { value: 1, label: 'Normal' }, { value: 1.1, label: 'Groß' },
          ]} onChange={v => setSettings({ fontScale: v })} />
        </Row>
        <Row label="Dichte" hint="Mehr Inhalt auf weniger Platz?">
          <Segmented<DensityMode> value={settings.density} options={[
            { value: 'comfortable', label: 'Komfortabel' }, { value: 'compact', label: 'Kompakt' },
          ]} onChange={v => setSettings({ density: v })} />
        </Row>
        <Row label="Glaseffekte" hint="Milchglas-Look auf Karten.">
          <Toggle checked={settings.glassEffects} onChange={v => setSettings({ glassEffects: v })} />
        </Row>
      </Card>
    </div>
  );
}

function AnimationsSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Sparkles className="size-5 text-amber-500" />Animationen</h3>
      <Row label="Animations-Stufe" hint="Wie viel Bewegung soll's sein?">
        <Segmented<AnimationLevel> value={settings.animationLevel} options={[
          { value: 'rich', label: 'Reichhaltig' }, { value: 'reduced', label: 'Reduziert' }, { value: 'minimal', label: 'Minimal' },
        ]} onChange={v => setSettings({ animationLevel: v })} />
      </Row>
      <Row label="Konfetti bei guten Noten" hint="Bei Note 1/2 (Bayern), ab 12 P (Oberstufe).">
        <Toggle checked={settings.confettiOnGood} onChange={v => setSettings({ confettiOnGood: v })} />
      </Row>
      <div className="text-xs text-ink-500 mt-2">💡 Wenn dein Gerät „Bewegung reduzieren" aktiviert hat, schalten wir automatisch auf Reduziert.</div>
    </Card>
  );
}

function DashboardSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><LayoutDashboard className="size-5 text-sky-500" />Dashboard</h3>
      <Row label="Begrüßungsstil">
        <Segmented<GreetingStyle> value={settings.dashboardGreetingStyle} options={[
          { value: 'casual', label: 'Locker' }, { value: 'formal', label: 'Formell' }, { value: 'fun', label: 'Lustig' },
        ]} onChange={v => setSettings({ dashboardGreetingStyle: v })} />
      </Row>
      <Row label="Layout">
        <Segmented<DashboardLayout> value={settings.dashboardLayout} options={[
          { value: 'rich', label: 'Reich' }, { value: 'list', label: 'Liste' },
        ]} onChange={v => setSettings({ dashboardLayout: v })} />
      </Row>
      <Row label="Wochenstart">
        <Segmented<0 | 1> value={settings.weekStart} options={[
          { value: 1, label: 'Montag' }, { value: 0, label: 'Sonntag' },
        ]} onChange={v => setSettings({ weekStart: v })} />
      </Row>
      <Row label="Schul-Tagesfenster" hint="Vom Tagesbeginn bis zum Tagesende.">
        <input type="time" className="input max-w-[120px]" value={settings.schoolStart}
          onChange={e => setSettings({ schoolStart: e.target.value })} />
        <span className="text-ink-500">bis</span>
        <input type="time" className="input max-w-[120px]" value={settings.schoolEnd}
          onChange={e => setSettings({ schoolEnd: e.target.value })} />
      </Row>
      <Row label="Wochenenden zeigen">
        <Toggle checked={settings.showWeekends} onChange={v => setSettings({ showWeekends: v })} />
      </Row>
      <Row label="Quick-Buttons" hint="Welche Knöpfe oben im Dashboard erscheinen.">
        <div className="flex flex-wrap gap-1.5">
          {(['todo', 'hausaufgabe', 'test', 'schulaufgabe', 'projekt'] as TaskKind[]).map(k => {
            const active = settings.quickButtons.includes(k);
            return (
              <button key={k} onClick={() => {
                const next = active ? settings.quickButtons.filter(x => x !== k) : [...settings.quickButtons, k];
                setSettings({ quickButtons: next });
              }} className={`chip ${active ? 'chip-active' : ''}`}>
                {k === 'todo' ? 'Todo' : k === 'hausaufgabe' ? 'Hausaufgabe' : k === 'test' ? 'Test' : k === 'schulaufgabe' ? 'Schulaufgabe' : 'Projekt'}
              </button>
            );
          })}
        </div>
      </Row>
    </Card>
  );
}

function GradingSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const setGradingConfig = useStore(s => s.setGradingConfig);
  const cfg = settings.gradingConfig;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><GraduationCap className="size-5 text-theme" />Standard für neue Fächer</h3>
        <Row label="Notensystem">
          <Segmented<GradingSystem> value={settings.system} options={[
            { value: 'bayern', label: 'Bayern' }, { value: 'oberstufe', label: 'Oberstufe' }, { value: 'austria', label: 'Österreich' }, { value: 'custom', label: 'Frei' },
          ]} onChange={v => setSettings({ system: v })} />
        </Row>
        <Row label="Durchschnitt-Nachkommastellen">
          <Segmented<1 | 2 | 3> value={settings.averageDigits} options={[
            { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' },
          ]} onChange={v => setSettings({ averageDigits: v })} />
        </Row>
        <Row label="Trend-Schwelle" hint="Wie groß muss der Unterschied sein, um als 'besser/schlechter' zu zählen?">
          <input type="range" min="0.1" max="0.5" step="0.05" value={settings.trendThreshold}
            onChange={e => setSettings({ trendThreshold: parseFloat(e.target.value) })} className="w-32 accent-theme" />
          <span className="text-xs font-bold text-ink-700 w-10 text-right">{settings.trendThreshold.toFixed(2).replace('.', ',')}</span>
        </Row>
        <Row label="Auto-Vorauswahl aktuelles Fach" hint="Im Hausaufgaben-/Notendialog automatisch das gerade laufende Fach wählen.">
          <Toggle checked={settings.autoSelectActiveSubject} onChange={v => setSettings({ autoSelectActiveSubject: v })} />
        </Row>
        <Row label="Vorlauf in Minuten" hint="So viele Minuten vor Stundenbeginn gilt das nächste Fach schon als aktiv.">
          <input type="range" min="0" max="30" step="5" value={settings.activeSubjectThresholdMin}
            onChange={e => setSettings({ activeSubjectThresholdMin: parseInt(e.target.value) })} className="w-32 accent-theme" />
          <span className="text-xs font-bold text-ink-700 w-10 text-right">{settings.activeSubjectThresholdMin}min</span>
        </Row>
        <Row label="Standard-Priorität neuer Aufgaben">
          <Segmented<1 | 2 | 3> value={settings.defaultTaskPriority} options={[
            { value: 1, label: 'Niedrig' }, { value: 2, label: 'Normal' }, { value: 3, label: 'Hoch' },
          ]} onChange={v => setSettings({ defaultTaskPriority: v })} />
        </Row>
      </Card>

      <Card>
        <h3 className="h3 mb-2 flex items-center gap-2"><GraduationCap className="size-5 text-theme" />So wird gerechnet</h3>
        <p className="subtle mb-4">Die Berechnung folgt der Fach-Kategorie. Du kannst pro Note ein individuelles Gewicht (×½ / ×1 / ×1,5 / ×2 oder custom) im Notendialog setzen.</p>
        <div className="space-y-2 text-sm">
          <div className="rounded-2xl border border-theme-soft bg-theme-soft/30 p-3">
            <div className="font-semibold text-ink-800">{CATEGORY_LABEL['hauptfach']}</div>
            <div className="text-xs text-ink-600 mt-0.5">{CATEGORY_DESCRIPTION['hauptfach']}</div>
            <code className="block text-[11px] mt-1.5 text-ink-500">(Schnitt Schulaufgaben × 2 + Schnitt Rest) / 3</code>
          </div>
          <div className="rounded-2xl border border-theme-soft bg-theme-soft/30 p-3">
            <div className="font-semibold text-ink-800">{CATEGORY_LABEL['hauptfach-1zu1']}</div>
            <div className="text-xs text-ink-600 mt-0.5">{CATEGORY_DESCRIPTION['hauptfach-1zu1']}</div>
            <code className="block text-[11px] mt-1.5 text-ink-500">(Schnitt Schulaufgaben + Schnitt Rest) / 2</code>
            <div className="text-[11px] text-ink-500 mt-1">Typisch für Physik/Chemie in Bayern.</div>
          </div>
          <div className="rounded-2xl border border-theme-soft bg-theme-soft/30 p-3">
            <div className="font-semibold text-ink-800">{CATEGORY_LABEL['nebenfach']}</div>
            <div className="text-xs text-ink-600 mt-0.5">{CATEGORY_DESCRIPTION['nebenfach']}</div>
            <code className="block text-[11px] mt-1.5 text-ink-500">Σ(Note × Gewicht) / Σ(Gewicht)</code>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-amber-500" />Frei konfigurierbar</h3>
        <p className="subtle mb-3">Eigenes Notensystem (z.B. Punkteskala). Nutzt einfachen gewichteten Schnitt mit den per-Note Gewichten.</p>
        <Row label="Bezeichnung">
          <input className="input max-w-[200px]" value={cfg.custom.label}
            onChange={e => setGradingConfig({ custom: { ...cfg.custom, label: e.target.value } })} />
        </Row>
        <Row label="Min / Max">
          <input type="number" className="input max-w-[80px]" value={cfg.custom.min} step="0.5"
            onChange={e => setGradingConfig({ custom: { ...cfg.custom, min: parseFloat(e.target.value) || 0 } })} />
          <span className="text-ink-500">bis</span>
          <input type="number" className="input max-w-[80px]" value={cfg.custom.max} step="0.5"
            onChange={e => setGradingConfig({ custom: { ...cfg.custom, max: parseFloat(e.target.value) || 1 } })} />
        </Row>
        <Row label="Schrittweite">
          <input type="number" className="input max-w-[100px]" value={cfg.custom.step} step="0.1" min="0.1"
            onChange={e => setGradingConfig({ custom: { ...cfg.custom, step: parseFloat(e.target.value) || 1 } })} />
        </Row>
        <Row label="Standardwert">
          <input type="number" className="input max-w-[80px]" value={cfg.custom.defaultValue} step={cfg.custom.step}
            onChange={e => setGradingConfig({ custom: { ...cfg.custom, defaultValue: parseFloat(e.target.value) || 0 } })} />
        </Row>
        <Row label="Niedrige Note = gut" hint="Wie bei deutschem System (1 = sehr gut). Aus für Punktesysteme.">
          <Toggle checked={cfg.custom.goodIsLow}
            onChange={v => setGradingConfig({ custom: { ...cfg.custom, goodIsLow: v } })} />
        </Row>
      </Card>
    </div>
  );
}

// _NumberStepper: ehemals für die Kind-Weight-Matrix benutzt - entfernt
function _UnusedNumberStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [0.5, 1, 1.5, 2, 2.5, 3];
  return (
    <div className="flex justify-center">
      <select className="input max-w-[80px] py-1.5 text-center" value={value} onChange={e => onChange(parseFloat(e.target.value))}>
        {options.map(o => <option key={o} value={o}>×{o.toString().replace('.', ',')}</option>)}
      </select>
    </div>
  );
}

function SubjectsSection() {
  const settings = useStore(s => s.settings)!;
  const subjects = useStore(s => s.subjects);
  const [subjDialog, setSubjDialog] = useState<{ open: boolean; subject?: Subject }>({ open: false });

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="h3 flex items-center gap-2"><BookOpen className="size-5 text-theme" />Fächer ({subjects.length})</h3>
        <button onClick={() => setSubjDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Fach</button>
      </div>
      {!subjects.length ? (
        <Empty icon={Plus} title="Noch keine Fächer" description="Lege jetzt dein erstes Fach an." />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjects.map(s => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-3 bg-white/70 flex items-center gap-3">
              <div className="size-11 rounded-xl grid place-items-center text-white font-display font-extrabold" style={{ background: s.color }}>{s.short}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-800 truncate">{s.name}</div>
                <div className="text-xs text-ink-500">{CATEGORY_LABEL[s.category]} · {s.system === 'bayern' ? 'Bayern' : s.system === 'oberstufe' ? 'Oberstufe' : s.system === 'austria' ? 'Österreich' : 'Frei'}</div>
              </div>
              <button onClick={() => setSubjDialog({ open: true, subject: s })} className="size-9 grid place-items-center rounded-full hover:bg-white"><Pencil className="size-4" /></button>
            </motion.li>
          ))}
        </ul>
      )}
      <SubjectDialog open={subjDialog.open} initial={subjDialog.subject} onClose={() => setSubjDialog({ open: false })} defaultSystem={settings.system} />
    </Card>
  );
}

function SyncCard() {
  const authUser = useStore(s => s.authUser);
  const syncStatus = useStore(s => s.syncStatus);
  const lastSyncedAt = useStore(s => s.lastSyncedAt);
  const liveSync = useStore(s => s.liveSync);
  const { signIn, signUp, signInWithGoogle, signOut, syncNow, pullFromCloud, wipeCloud } = useStore();

  const [mode, setMode] = useState<'idle' | 'login' | 'signup'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pullMsg, setPullMsg] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState<null | 'asking' | 'wiping' | 'done'>(null);
  const [wipeTyped, setWipeTyped] = useState('');
  const [wipeResult, setWipeResult] = useState<{ rows: number; files: number } | null>(null);

  async function handleWipe() {
    setWipeConfirm('wiping');
    const result = await wipeCloud();
    setWipeResult(result);
    setWipeConfirm('done');
  }

  function closeWipe() {
    setWipeConfirm(null);
    setWipeTyped('');
    setWipeResult(null);
  }

  if (!supabase) {
    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><CloudOff className="size-5 text-ink-400" />Cloud Sync</h3>
        <p className="text-sm text-ink-500">Sync ist noch nicht eingerichtet. Folge der Anleitung im Über-Bereich.</p>
      </Card>
    );
  }

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err); else setMode('idle');
  }

  async function handlePull() {
    const pulled = await pullFromCloud();
    setPullMsg(pulled ? 'Daten vom Server geladen!' : 'Keine Cloud-Daten gefunden.');
    setTimeout(() => setPullMsg(''), 3000);
  }

  if (authUser) {
    const liveBadge = (() => {
      switch (liveSync) {
        case 'live':
          return { Icon: Zap, label: 'Live-Sync aktiv', tone: 'text-emerald-700 bg-emerald-100 border-emerald-200' };
        case 'connecting':
          return { Icon: Loader2, label: 'Verbindet …', tone: 'text-amber-700 bg-amber-100 border-amber-200 animate-pulse' };
        case 'error':
          return { Icon: CloudOff, label: 'Sync-Fehler', tone: 'text-rose-700 bg-rose-100 border-rose-200' };
        default:
          return { Icon: CloudOff, label: 'Sync inaktiv', tone: 'text-ink-600 bg-white/70 border-white/60' };
      }
    })();

    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Cloud className="size-5 text-emerald-500" />Cloud Sync</h3>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-emerald-800">Eingeloggt als {authUser.email}</div>
              {lastSyncedAt && <div className="text-xs text-emerald-700/80">Letzter Abgleich: {new Date(lastSyncedAt).toLocaleTimeString('de-DE')}</div>}
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${liveBadge.tone}`}>
              <liveBadge.Icon className={`size-3.5 ${liveSync === 'connecting' ? 'animate-spin' : ''}`} />
              {liveBadge.label}
            </span>
          </div>
          <p className="text-xs text-emerald-700/80 mt-2 leading-relaxed">
            Änderungen werden automatisch zwischen all deinen Geräten synchronisiert – kein manueller Upload nötig.
          </p>
        </div>

        <Row label="Abmelden">
          <button onClick={signOut} className="btn-soft text-rose-600"><LogOut className="size-4" />Abmelden</button>
        </Row>

        <div className="mt-3 pt-3 border-t border-white/50">
          <button onClick={() => setAdvanced(v => !v)} className="text-xs text-ink-500 hover:text-ink-700 transition font-semibold">
            {advanced ? '− Manuelle Aktionen ausblenden' : '+ Manuelle Aktionen anzeigen'}
          </button>
          {advanced && (
            <div className="mt-3 space-y-2">
              <Row label="Alles hochladen" hint="Lokalen Stand in die Cloud schreiben (Notfall-Push).">
                <button onClick={syncNow} disabled={syncStatus === 'syncing'} className="btn-ghost">
                  <Cloud className="size-4" />{syncStatus === 'syncing' ? 'Synchronisiert…' : 'Push'}
                </button>
              </Row>
              <Row label="Alles herunterladen" hint="Cloud-Stand auf dieses Gerät laden (überschreibt lokal).">
                <button onClick={handlePull} disabled={syncStatus === 'syncing'} className="btn-ghost">
                  <RefreshCw className="size-4" />Pull
                </button>
                {pullMsg && <span className="text-xs text-emerald-600">{pullMsg}</span>}
              </Row>
              <Row label="Cloud-Daten löschen" hint="Alle deine Daten vom Server entfernen. Lokale Daten bleiben auf diesem Gerät erhalten.">
                <button onClick={() => setWipeConfirm('asking')} className="btn-soft text-rose-600">
                  <Trash2 className="size-4" />Cloud leeren
                </button>
              </Row>
            </div>
          )}
        </div>

        {/* Bestätigungs-Modal: alle Cloud-Daten löschen */}
        <AnimatePresence>
          {wipeConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm grid place-items-center p-4"
              onClick={wipeConfirm === 'wiping' ? undefined : closeWipe}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-md rounded-3xl glass-strong shadow-soft p-5"
              >
                {wipeConfirm === 'asking' && (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="size-10 rounded-2xl bg-rose-100 text-rose-600 grid place-items-center flex-shrink-0">
                        <AlertTriangle className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-lg text-ink-900">Alle Cloud-Daten löschen?</h3>
                        <p className="text-sm text-ink-600 mt-1">
                          Dadurch werden auf dem Server <strong>alle</strong> deine Fächer, Noten, Aufgaben, Stunden, Schuljahre, Fotos und Einstellungen gelöscht.
                          Andere Geräte, die eingeloggt sind, verlieren ebenfalls Zugriff auf den Cloud-Stand.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 mb-3">
                      Deine Daten auf <strong>diesem Gerät</strong> bleiben erhalten. Anschließend wirst du automatisch abgemeldet, damit nicht direkt wieder hochgeladen wird.
                    </div>
                    <label className="text-xs font-semibold text-ink-700 block mb-1">Tippe <code className="px-1 py-0.5 rounded bg-white/70 text-rose-600">LÖSCHEN</code> zur Bestätigung:</label>
                    <input
                      autoFocus
                      className="input"
                      value={wipeTyped}
                      onChange={e => setWipeTyped(e.target.value)}
                      placeholder="LÖSCHEN"
                    />
                    <div className="flex gap-2 mt-4">
                      <button onClick={closeWipe} className="btn-ghost flex-1">Abbrechen</button>
                      <button
                        onClick={handleWipe}
                        disabled={wipeTyped.trim() !== 'LÖSCHEN'}
                        className="btn-primary flex-1 !bg-rose-500 hover:!bg-rose-600 disabled:!bg-rose-300"
                      >
                        <Trash2 className="size-4" />Endgültig löschen
                      </button>
                    </div>
                  </>
                )}
                {wipeConfirm === 'wiping' && (
                  <div className="flex flex-col items-center text-center py-4">
                    <Loader2 className="size-8 text-rose-500 animate-spin mb-3" />
                    <h3 className="font-display font-bold text-lg text-ink-900">Lösche alle Cloud-Daten …</h3>
                    <p className="text-sm text-ink-600 mt-1">Datenbank-Zeilen und Foto-Dateien werden entfernt.</p>
                  </div>
                )}
                {wipeConfirm === 'done' && (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="size-10 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center flex-shrink-0">
                        <Check className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-lg text-ink-900">Cloud ist leer.</h3>
                        {wipeResult ? (
                          <p className="text-sm text-ink-600 mt-1">
                            {wipeResult.rows} Datenbank-Zeilen und {wipeResult.files} Foto-Dateien gelöscht. Du wurdest abgemeldet.
                          </p>
                        ) : (
                          <p className="text-sm text-ink-600 mt-1">Du wurdest abgemeldet.</p>
                        )}
                      </div>
                    </div>
                    <button onClick={closeWipe} className="btn-primary w-full">Schließen</button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Cloud className="size-5 text-theme" />Cloud Sync</h3>
      <p className="text-sm text-ink-600 mb-3">Melde dich an, um deine Daten zwischen Geräten zu synchronisieren. Fotos bleiben immer nur lokal.</p>

      {mode === 'idle' ? (
        <div className="space-y-2">
          <button onClick={() => setMode('login')} className="btn-primary w-full"><LogIn className="size-4" />Anmelden</button>
          <button onClick={() => setMode('signup')} className="btn-ghost w-full"><Plus className="size-4" />Neu registrieren</button>
          <button onClick={signInWithGoogle} className="btn-ghost w-full">
            <svg className="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Mit Google anmelden
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-ink-700">{mode === 'login' ? 'Anmelden' : 'Registrieren'}</div>
          <input className="input" type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          <input className="input" type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setMode('idle')} className="btn-ghost flex-1">Zurück</button>
            <button onClick={submit} disabled={loading || !email || !password} className="btn-primary flex-1">
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Schuljahre ────────────────────────────────────────────────────── */

function SchoolYearsSection() {
  const schoolYears = useStore(s => s.schoolYears);
  const activeId = useStore(s => s.activeSchoolYearId);
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const lessons = useStore(s => s.lessons);
  const addSchoolYear = useStore(s => s.addSchoolYear);
  const deleteSchoolYear = useStore(s => s.deleteSchoolYear);
  const setActiveSchoolYear = useStore(s => s.setActiveSchoolYear);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState(() => {
    const d = new Date();
    const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-09-01`;
  });
  const [copySubjects, setCopySubjects] = useState(true);
  const [copyLessons, setCopyLessons] = useState(true);

  function suggestName() {
    const [y] = newStart.split('-').map(Number);
    return `${y}/${String(y + 1).slice(2)}`;
  }

  async function create() {
    const name = newName.trim() || suggestName();
    await addSchoolYear({
      name,
      startDate: new Date(newStart).getTime(),
      copySubjectsFromYearId: copySubjects && activeId ? activeId : undefined,
      copyLessonsFromYearId: copyLessons && copySubjects && activeId ? activeId : undefined,
    });
    setShowForm(false);
    setNewName('');
  }

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('de', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-lg text-ink-900">Schuljahre</h3>
            <p className="text-sm text-ink-500 mt-0.5">Jedes Schuljahr ist ein eigener Schulplaner – mit eigenen Fächern, Noten, Stundenplan und Aufgaben.</p>
          </div>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary">
            <Plus className="size-4" /> Neues Schuljahr
          </button>
        </div>

        {showForm && (
          <div className="mb-4 p-4 rounded-2xl bg-theme-soft/40 border border-theme-soft space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Beginn</label>
                <input type="date" className="input" value={newStart} onChange={e => setNewStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Name (optional)</label>
                <input className="input" placeholder={suggestName()} value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
            </div>
            {activeId && (
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                  <input type="checkbox" checked={copySubjects} onChange={e => setCopySubjects(e.target.checked)} className="size-4 accent-theme" />
                  <span className="text-ink-700">Fächer aus aktuellem Schuljahr übernehmen (ohne Noten)</span>
                </label>
                <label className={`flex items-center gap-2.5 cursor-pointer text-sm ${!copySubjects ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={copyLessons && copySubjects} disabled={!copySubjects} onChange={e => setCopyLessons(e.target.checked)} className="size-4 accent-theme" />
                  <span className="text-ink-700">Stundenplan auch übernehmen</span>
                </label>
                <div className="text-xs text-ink-500 pl-6.5">
                  Sonst startest du mit einem leeren Planer (eigenes Onboarding).
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="btn-ghost">Abbrechen</button>
              <button onClick={create} className="btn-primary">Erstellen & wechseln</button>
            </div>
          </div>
        )}

        {schoolYears.length === 0 ? (
          <div className="text-center py-8 text-sm text-ink-500">
            <Calendar className="size-8 mx-auto mb-2 text-ink-300" />
            Noch keine Schuljahre angelegt.
          </div>
        ) : (
          <div className="space-y-2">
            {schoolYears.map(y => {
              const isActive = y.id === activeId;
              const stats = isActive
                ? `${subjects.length} Fächer · ${grades.filter(g => !g.isPending).length} Noten · ${lessons.length} Stunden`
                : '';
              return (
                <div key={y.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition ${isActive ? 'border-theme bg-theme-soft/30' : 'border-white/40 bg-white/60'}`}>
                  <div className={`size-10 rounded-xl grid place-items-center flex-shrink-0 ${isActive ? 'theme-gradient' : 'bg-ink-200'}`}>
                    {isActive ? <Check className="size-4 text-white" strokeWidth={3} /> : <Calendar className="size-4 text-ink-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-900 flex items-center gap-2 flex-wrap">
                      {y.name}
                      {isActive && <span className="text-[10px] uppercase tracking-wider font-bold text-theme-deep px-1.5 py-0.5 rounded-md bg-theme-soft">Aktiv</span>}
                    </div>
                    <div className="text-xs text-ink-500">
                      ab {fmtDate(y.startDate)}{y.endDate ? ` · bis ${fmtDate(y.endDate)}` : ''}
                      {isActive && stats && ` · ${stats}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => setActiveSchoolYear(y.id)}
                        className="text-xs px-3 py-1.5 rounded-lg theme-gradient text-white font-semibold hover:opacity-90 transition"
                      >
                        Wechseln
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (schoolYears.length === 1) {
                          alert('Mindestens ein Schuljahr muss vorhanden bleiben.');
                          return;
                        }
                        if (confirm(`Schuljahr "${y.name}" inkl. aller zugehörigen Fächer, Noten, Aufgaben und Stunden wirklich löschen?`))
                          deleteSchoolYear(y.id, 'wipe');
                      }}
                      className="size-8 rounded-xl grid place-items-center text-ink-400 hover:text-rose-500 hover:bg-rose-50 transition"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function DataSection() {
  const load = useStore(s => s.load);
  const [storageInfo, setStorageInfo] = useState<string>('');
  const [importStatus, setImportStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function exportJson() {
    const data = await buildExport();
    downloadExport(data);
  }

  async function copyExampleSchema() {
    const ex = getExampleFile();
    await navigator.clipboard.writeText(JSON.stringify(ex, null, 2));
    setImportStatus({ kind: 'ok', msg: 'Beispiel-Schema in Zwischenablage kopiert.' });
    setTimeout(() => setImportStatus(null), 3000);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Daten aus Datei importieren? ALLE bestehenden Daten werden ersetzt.')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = await importData(text);
      await load();
      const lines = [
        `${result.schoolYears} Schuljahre`,
        `${result.subjects} Fächer`,
        `${result.grades} Noten`,
        `${result.tasks} Aufgaben`,
        `${result.lessons} Stunden`,
      ];
      let msg = `Import erfolgreich: ${lines.join(' · ')}`;
      if (result.warnings.length) msg += `\n\nHinweise:\n• ${result.warnings.join('\n• ')}`;
      setImportStatus({ kind: 'ok', msg });
    } catch (err) {
      setImportStatus({ kind: 'err', msg: 'Fehler: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      e.target.value = '';
    }
  }

  async function loadDemo() {
    if (!confirm('Demodaten laden? Bestehende Daten werden ersetzt.')) return;
    await installDemo();
    await load();
  }

  async function reset() {
    if (!confirm('Wirklich ALLE Daten zurücksetzen? Das kann nicht rückgängig gemacht werden.')) return;
    await resetAll();
    location.reload();
  }

  async function checkStorage() {
    if (!navigator.storage?.estimate) { setStorageInfo('Nicht verfügbar'); return; }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usedKB = (usage / 1024).toFixed(1);
    const quotaMB = (quota / 1024 / 1024).toFixed(0);
    setStorageInfo(`${usedKB} KB von ~${quotaMB} MB`);
  }

  return (
    <div className="space-y-4">
      <SyncCard />
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Database className="size-5 text-theme" />Sicherung & Import</h3>

        <Row label="Komplett-Export" hint="Alle Schuljahre, Fächer, Noten, Aufgaben & Stundenplan als JSON.">
          <button onClick={exportJson} className="btn-ghost"><RefreshCw className="size-4" />Exportieren</button>
        </Row>

        <Row label="Import aus Datei" hint="JSON wiederherstellen. ALLE bestehenden Daten werden ersetzt.">
          <label className="btn-ghost cursor-pointer">
            <Upload className="size-4" />Datei wählen
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          </label>
        </Row>

        <Row label="Beispiel-Schema" hint="JSON-Vorlage in die Zwischenablage kopieren - hilfreich um mit ChatGPT/Claude eigene Daten zu generieren.">
          <button onClick={copyExampleSchema} className="btn-ghost"><Database className="size-4" />Schema kopieren</button>
        </Row>

        {importStatus && (
          <div className={`mt-3 rounded-2xl p-3 text-sm whitespace-pre-line ${importStatus.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
            {importStatus.msg}
          </div>
        )}

        <div className="mt-3 text-xs text-ink-500">
          Du willst Daten aus einer anderen App importieren? Frag Claude Code mit dem <code className="font-mono bg-ink-100 px-1.5 py-0.5 rounded">IMPORT_GUIDE.md</code> aus dem Repo - dort steht das exakte Format.
        </div>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Database className="size-5 text-theme" />Verwaltung</h3>
        <Row label="Demodaten" hint="Lädt fertige Beispieldaten (überschreibt alles).">
          <button onClick={loadDemo} className="btn-ghost"><Wand2 className="size-4" />Laden</button>
        </Row>
        <Row label="Speicherplatz">
          <button onClick={checkStorage} className="btn-ghost text-xs"><Database className="size-4" />Prüfen</button>
          {storageInfo && <span className="text-xs text-ink-600">{storageInfo}</span>}
        </Row>
        <Row label="Alles zurücksetzen" hint="Löscht ALLE lokalen Daten unwiderruflich.">
          <button onClick={reset} className="btn-soft text-rose-600"><Trash2 className="size-4" />Zurücksetzen</button>
        </Row>
      </Card>
    </div>
  );
}

function AboutSection() {
  const [showSql, setShowSql] = useState(false);
  const sql = `-- Einmalig im Supabase SQL-Editor ausführen:
create table subjects (id text primary key, user_id uuid references auth.users not null, data jsonb not null, updated_at timestamptz default now());
alter table subjects enable row level security;
create policy "own" on subjects for all using (auth.uid() = user_id);

create table grades (id text primary key, user_id uuid references auth.users not null, data jsonb not null, updated_at timestamptz default now());
alter table grades enable row level security;
create policy "own" on grades for all using (auth.uid() = user_id);

create table tasks (id text primary key, user_id uuid references auth.users not null, data jsonb not null, updated_at timestamptz default now());
alter table tasks enable row level security;
create policy "own" on tasks for all using (auth.uid() = user_id);

create table lessons (id text primary key, user_id uuid references auth.users not null, data jsonb not null, updated_at timestamptz default now());
alter table lessons enable row level security;
create policy "own" on lessons for all using (auth.uid() = user_id);

create table user_settings (user_id uuid references auth.users primary key, data jsonb not null, updated_at timestamptz default now());
alter table user_settings enable row level security;
create policy "own" on user_settings for all using (auth.uid() = user_id);`;

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Info className="size-5 text-slate-500" />Über</h3>
      <div className="space-y-3 text-sm text-ink-700">
        <p><strong>Schulplaner / Notenapp</strong> – dein persönliches Schul-Tool.</p>
        <p>Die App funktioniert offline und kann auf iPad/Android über „Zum Home-Bildschirm" installiert werden.</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl p-3 bg-white/60">
            <div className="font-bold text-ink-800">Notensysteme</div>
            <div className="text-ink-500">Bayern, Oberstufe, Österreich, Frei</div>
          </div>
          <div className="rounded-2xl p-3 bg-white/60">
            <div className="font-bold text-ink-800">Speicher</div>
            <div className="text-ink-500">Lokal + Cloud (optional)</div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <div className="font-semibold text-ink-800 mb-1 flex items-center gap-2"><Smartphone className="size-4" />Cloud Sync einrichten</div>
          <ol className="text-xs text-ink-600 space-y-1 list-decimal list-inside">
            <li>Auf <strong>supabase.com</strong> kostenloses Konto erstellen</li>
            <li>Neues Projekt anlegen</li>
            <li>Im SQL-Editor das Script unten ausführen</li>
            <li>Unter Settings → API: URL und anon key kopieren</li>
            <li>In Vercel als Umgebungsvariablen eintragen:<br/><code className="bg-white px-1 rounded">VITE_SUPABASE_URL</code> und <code className="bg-white px-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
            <li>Neu deployen → in Daten-Tab anmelden</li>
          </ol>
          <button onClick={() => setShowSql(s => !s)} className="btn-ghost text-xs mt-2">
            {showSql ? 'SQL ausblenden' : 'SQL anzeigen'}
          </button>
          {showSql && (
            <pre className="mt-2 text-[10px] bg-slate-800 text-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{sql}</pre>
          )}
        </div>

        <a href="https://github.com/Bubi9543/Schulplaner" target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex">
          <SettingsIcon className="size-4" />Quellcode auf GitHub
        </a>
      </div>
    </Card>
  );
}

// avoid unused import warning
void (DEFAULT_GRADING_CONFIG as AppSettings['gradingConfig']);
