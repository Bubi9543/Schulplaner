import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Palette, Sparkles, LayoutDashboard, GraduationCap, BookOpen, Database, Info, Pencil, Plus, RefreshCw, Trash2, Wand2, Upload, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { db } from '@/lib/db';
import { installDemo, resetAll } from '@/lib/demo';
import { KIND_LABEL } from '@/lib/grading';
import { DEFAULT_GRADING_CONFIG, DEFAULT_KIND_WEIGHTS } from '@/types';
import type { Subject, GradingSystem, GradeKind, AccentName, ThemeMode, DensityMode, FontScale, AnimationLevel, GreetingStyle, DashboardLayout, TaskKind, AppSettings } from '@/types';
import { ACCENT_HEX } from '@/types';

type SectionId = 'profile' | 'appearance' | 'animations' | 'dashboard' | 'grading' | 'subjects' | 'data' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; tint: string }> = [
  { id: 'profile', label: 'Profil', icon: User, tint: 'from-indigo-500 to-violet-500' },
  { id: 'appearance', label: 'Erscheinung', icon: Palette, tint: 'from-fuchsia-500 to-pink-500' },
  { id: 'animations', label: 'Animationen', icon: Sparkles, tint: 'from-amber-400 to-orange-500' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tint: 'from-sky-500 to-indigo-500' },
  { id: 'grading', label: 'Noten & Aufgaben', icon: GraduationCap, tint: 'from-emerald-500 to-teal-500' },
  { id: 'subjects', label: 'Fächer', icon: BookOpen, tint: 'from-violet-500 to-purple-500' },
  { id: 'data', label: 'Daten', icon: Database, tint: 'from-rose-500 to-pink-600' },
  { id: 'about', label: 'Über', icon: Info, tint: 'from-slate-500 to-slate-700' },
];

export function SettingsPage() {
  const settings = useStore(s => s.settings);
  const [section, setSection] = useState<SectionId>('profile');

  if (!settings) return null;

  return (
    <PageShell accent="rose" title="Einstellungen" subtitle="Profil, Aussehen, Notensysteme und mehr – alles personalisierbar.">
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card className="col-span-12 md:col-span-3 lg:col-span-3 !p-2 md:sticky md:top-4 md:self-start">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible no-scrollbar">
            {SECTIONS.map(s => {
              const active = section === s.id;
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setSection(s.id)}
                  className={`relative shrink-0 md:shrink flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold transition text-left ${active ? 'text-white' : 'text-ink-700 hover:bg-white/70'}`}>
                  {active && <motion.span layoutId="settings-active" className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${s.tint}`} />}
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
          {value === opt.value && <motion.span layoutId={`seg-${opt.label}-${String(opt.value)}`} className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
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
      <h3 className="h3 mb-3 flex items-center gap-2"><User className="size-5 text-indigo-500" />Profil</h3>
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
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Palette className="size-5 text-fuchsia-500" />Erscheinung</h3>
      <Row label="Theme" hint="Hell oder dunkel? Auto folgt dem System.">
        <Segmented<ThemeMode> value={settings.theme} options={[
          { value: 'light', label: 'Hell' }, { value: 'dark', label: 'Dunkel' }, { value: 'auto', label: 'Auto' },
        ]} onChange={v => setSettings({ theme: v })} />
      </Row>
      <Row label="Akzentfarbe" hint="Farbe für Highlights und Buttons.">
        <div className="flex gap-1.5">
          {(['indigo', 'rose', 'emerald', 'amber', 'sky', 'violet'] as AccentName[]).map(a => (
            <button key={a} onClick={() => setSettings({ accent: a })}
              className={`size-8 rounded-xl transition ${settings.accent === a ? 'ring-4 ring-white scale-110' : ''}`}
              style={{ background: ACCENT_HEX[a] }} aria-label={a} />
          ))}
        </div>
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
              }} className={`chip ${active ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
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
        <h3 className="h3 mb-3 flex items-center gap-2"><GraduationCap className="size-5 text-emerald-500" />Standard für neue Fächer</h3>
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
            onChange={e => setSettings({ trendThreshold: parseFloat(e.target.value) })} className="w-32 accent-indigo-500" />
          <span className="text-xs font-bold text-ink-700 w-10 text-right">{settings.trendThreshold.toFixed(2).replace('.', ',')}</span>
        </Row>
        <Row label="Auto-Vorauswahl aktuelles Fach" hint="Im Hausaufgaben-/Notendialog automatisch das gerade laufende Fach wählen.">
          <Toggle checked={settings.autoSelectActiveSubject} onChange={v => setSettings({ autoSelectActiveSubject: v })} />
        </Row>
        <Row label="Vorlauf in Minuten" hint="So viele Minuten vor Stundenbeginn gilt das nächste Fach schon als aktiv.">
          <input type="range" min="0" max="30" step="5" value={settings.activeSubjectThresholdMin}
            onChange={e => setSettings({ activeSubjectThresholdMin: parseInt(e.target.value) })} className="w-32 accent-indigo-500" />
          <span className="text-xs font-bold text-ink-700 w-10 text-right">{settings.activeSubjectThresholdMin}min</span>
        </Row>
        <Row label="Standard-Priorität neuer Aufgaben">
          <Segmented<1 | 2 | 3> value={settings.defaultTaskPriority} options={[
            { value: 1, label: 'Niedrig' }, { value: 2, label: 'Normal' }, { value: 3, label: 'Hoch' },
          ]} onChange={v => setSettings({ defaultTaskPriority: v })} />
        </Row>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="h3 flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-indigo-500" />Bayern (1–6)</h3>
          <button className="btn-soft text-xs" onClick={() => setGradingConfig({ bayern: { kindWeights: { ...DEFAULT_KIND_WEIGHTS } } })}>
            <RotateCcw className="size-3" /> Standard
          </button>
        </div>
        <div className="text-xs text-ink-500 mb-2">Gewicht pro Notenart und Fach-Typ. Höher = zählt stärker im Schnitt.</div>
        <WeightMatrix
          kindWeights={cfg.bayern.kindWeights}
          onChange={kw => setGradingConfig({ bayern: { kindWeights: kw } })}
        />
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-emerald-500" />Oberstufe (0–15)</h3>
        <Row label="Gewichtung pro Note erlauben" hint="Bei jeder Note kannst du dann ×½ / ×1 / ×2 wählen.">
          <Toggle checked={cfg.oberstufe.allowPerGradeWeight}
            onChange={v => setGradingConfig({ oberstufe: { ...cfg.oberstufe, allowPerGradeWeight: v } })} />
        </Row>
        <div className="text-xs text-ink-500 mt-2 mb-2">Gewicht pro Notenart:</div>
        <WeightMatrix
          kindWeights={cfg.oberstufe.kindWeights}
          onChange={kw => setGradingConfig({ oberstufe: { ...cfg.oberstufe, kindWeights: kw } })}
        />
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-rose-500" />Österreich (1–5)</h3>
        <WeightMatrix
          kindWeights={cfg.austria.kindWeights}
          onChange={kw => setGradingConfig({ austria: { kindWeights: kw } })}
        />
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-amber-500" />Frei konfigurierbar</h3>
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
        <WeightMatrix
          kindWeights={cfg.custom.kindWeights}
          onChange={kw => setGradingConfig({ custom: { ...cfg.custom, kindWeights: kw } })}
        />
      </Card>
    </div>
  );
}

function WeightMatrix({ kindWeights, onChange }: { kindWeights: Record<GradeKind, { haupt: number; neben: number }>; onChange: (kw: Record<GradeKind, { haupt: number; neben: number }>) => void }) {
  const kinds: GradeKind[] = ['schulaufgabe', 'stegreif', 'muendlich', 'projekt', 'sonstige'];
  function set(k: GradeKind, cat: 'haupt' | 'neben', v: number) {
    onChange({ ...kindWeights, [k]: { ...kindWeights[k], [cat]: v } });
  }
  const sumH = kinds.reduce((acc, k) => acc + kindWeights[k].haupt, 0);
  const sumN = kinds.reduce((acc, k) => acc + kindWeights[k].neben, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink-500">
            <th className="text-left py-1.5">Notenart</th>
            <th className="text-center w-32">Hauptfach</th>
            <th className="text-center w-32">Nebenfach</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map(k => (
            <tr key={k} className="border-t border-white/40">
              <td className="py-2 font-medium text-ink-800">{KIND_LABEL[k]}</td>
              <td>
                <NumberStepper value={kindWeights[k].haupt} onChange={v => set(k, 'haupt', v)} />
              </td>
              <td>
                <NumberStepper value={kindWeights[k].neben} onChange={v => set(k, 'neben', v)} />
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/40 text-xs text-ink-500">
            <td className="py-2 font-semibold">Summe / Division</td>
            <td className="text-center font-bold">÷ {sumH}</td>
            <td className="text-center font-bold">÷ {sumN}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NumberStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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
        <h3 className="h3 flex items-center gap-2"><BookOpen className="size-5 text-violet-500" />Fächer ({subjects.length})</h3>
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
                <div className="text-xs text-ink-500">{s.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'} · {s.system === 'bayern' ? 'Bayern' : s.system === 'oberstufe' ? 'Oberstufe' : s.system === 'austria' ? 'Österreich' : 'Frei'}</div>
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

function DataSection() {
  const settings = useStore(s => s.settings)!;
  const subjects = useStore(s => s.subjects);
  const load = useStore(s => s.load);
  const [storageInfo, setStorageInfo] = useState<string>('');

  function exportJson() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      settings,
      subjects,
      grades: useStore.getState().grades,
      tasks: useStore.getState().tasks,
      lessons: useStore.getState().lessons,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notenapp-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Daten aus Datei importieren? Bestehende Daten werden ersetzt.')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await resetAll();
      if (data.subjects?.length) await db.subjects.bulkAdd(data.subjects);
      if (data.grades?.length) await db.grades.bulkAdd(data.grades);
      if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
      if (data.lessons?.length) await db.lessons.bulkAdd(data.lessons);
      if (data.settings) await db.settings.put({ ...data.settings, id: 'app' });
      await load();
      alert('Erfolgreich importiert!');
    } catch (err) {
      alert('Fehler beim Import: ' + (err instanceof Error ? err.message : String(err)));
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
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Database className="size-5 text-rose-500" />Daten</h3>
      <Row label="Export" hint="Als JSON-Datei sichern.">
        <button onClick={exportJson} className="btn-ghost"><RefreshCw className="size-4" />Exportieren</button>
      </Row>
      <Row label="Import" hint="JSON-Datei wiederherstellen (überschreibt).">
        <label className="btn-ghost cursor-pointer">
          <Upload className="size-4" />Datei wählen
          <input type="file" accept="application/json" className="hidden" onChange={importJson} />
        </label>
      </Row>
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
  );
}

function AboutSection() {
  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Info className="size-5 text-slate-500" />Über</h3>
      <div className="space-y-3 text-sm text-ink-700">
        <p><strong>Schulplaner / Notenapp</strong> – dein persönliches Schul-Tool. Alle Daten bleiben lokal in deinem Browser, nichts wandert ins Netz.</p>
        <p>Die App funktioniert offline und kann auf iPad/Android über „Zum Home-Bildschirm" wie eine echte App installiert werden.</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl p-3 bg-white/60">
            <div className="font-bold text-ink-800">Notensysteme</div>
            <div className="text-ink-500">Bayern, Oberstufe, Österreich, Frei</div>
          </div>
          <div className="rounded-2xl p-3 bg-white/60">
            <div className="font-bold text-ink-800">Speicher</div>
            <div className="text-ink-500">Lokal (IndexedDB)</div>
          </div>
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
