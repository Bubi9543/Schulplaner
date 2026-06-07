import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Palette, Sparkles, LayoutDashboard, GraduationCap, BookOpen, Database, Info, Pencil, Plus, RefreshCw, Trash2, Wand2, Upload, Cloud, CloudOff, LogIn, LogOut, Smartphone, Calendar, CalendarRange, Check, Zap, Loader2, AlertTriangle, Copy, KeyRound, ExternalLink, Share2, ChevronUp, ChevronDown, Bell, BellOff, Send, Volume2, Moon, MessageSquare, Users, UserPlus, X, Timer, Trophy, NotebookPen, ClipboardCheck, Clock, Lightbulb, Eye, EyeOff, GripVertical, RotateCcw, PanelLeft, Lock, type LucideIcon } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { FriendsManager } from '@/pages/Friends';
import { SubjectIcon } from '@/components/SubjectIcon';
import { SchoolYearOnboardingDialog } from '@/components/dialogs/SchoolYearOnboardingDialog';
import { AccountAuth } from '@/components/AccountAuth';
import { AvatarUpload } from '@/components/AvatarUpload';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { getOrCreateMyProfile } from '@/lib/homeworkShare';
import { db } from '@/lib/db';
import { installDemo, installOberstufeDemo, resetAll } from '@/lib/demo';
import { buildExport, downloadExport, importData, getExampleFile } from '@/lib/portability';
import { CATEGORY_LABEL, CATEGORY_DESCRIPTION, BUILTIN_KIND_LABEL } from '@/lib/grading';
import { BUILTIN_GRADE_KINDS } from '@/types';
import { COUNTRIES, subdivisionsForCountry } from '@/lib/holidays';
import { useBaseNavItems, applyNavPrefs, LOCKED_NAV_ROUTES, type NavItem } from '@/components/Sidebar';
import type { Subject, GradingSystem, GradeKind, ThemeMode, DensityMode, FontScale, AnimationLevel, GreetingStyle, TaskKind, SchoolYear } from '@/types';
import { THEME_LIST, paletteFromHue, DEFAULT_CUSTOM_HUE } from '@/lib/themes';

type SectionId = 'profile' | 'friends' | 'appearance' | 'navigation' | 'dashboard' | 'grading' | 'subjects' | 'schoolyears' | 'notifications' | 'shortcut' | 'feedback' | 'data' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profile',       label: 'Profil',            icon: User },
  { id: 'friends',       label: 'Freunde',           icon: Users },
  { id: 'appearance',    label: 'Erscheinung',       icon: Palette },
  { id: 'navigation',    label: 'Ansichten & Menü',  icon: PanelLeft },
  { id: 'dashboard',     label: 'Dashboard',         icon: LayoutDashboard },
  { id: 'grading',       label: 'Noten & Aufgaben',  icon: GraduationCap },
  { id: 'subjects',      label: 'Fächer',            icon: BookOpen },
  { id: 'schoolyears',   label: 'Schuljahre',        icon: Calendar },
  { id: 'notifications', label: 'Benachrichtigungen', icon: Bell },
  { id: 'shortcut',      label: 'Apple Shortcut',    icon: Zap },
  { id: 'feedback',      label: 'Feedback',          icon: MessageSquare },
  { id: 'data',          label: 'Daten & Sync',      icon: Database },
  { id: 'about',         label: 'Über',              icon: Info },
];

const VALID_SECTIONS: SectionId[] = ['profile', 'friends', 'appearance', 'navigation', 'dashboard', 'grading', 'subjects', 'schoolyears', 'notifications', 'shortcut', 'feedback', 'data', 'about'];

export function SettingsPage() {
  const settings = useStore(s => s.settings);
  const [params, setParams] = useSearchParams();
  const urlSection = params.get('section') as SectionId | null;
  const initialSection: SectionId = urlSection && VALID_SECTIONS.includes(urlSection) ? urlSection : 'profile';
  const [section, setSection] = useState<SectionId>(initialSection);

  // Wenn sich der URL-Param ändert (z.B. durch Sidebar-Klick), Sektion mitführen.
  useEffect(() => {
    if (urlSection && VALID_SECTIONS.includes(urlSection) && urlSection !== section) {
      setSection(urlSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSection]);

  // Wenn die User die Sektion intern wechselt, URL ohne History-Push aktualisieren.
  function changeSection(s: SectionId) {
    setSection(s);
    const next = new URLSearchParams(params);
    if (s === 'profile') next.delete('section');
    else next.set('section', s);
    setParams(next, { replace: true });
  }

  if (!settings) return null;

  return (
    <PageShell title="Einstellungen" subtitle="Profil, Aussehen, Notensysteme, Cloud-Sync und mehr.">
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card className="col-span-12 md:col-span-3 lg:col-span-3 !p-2 md:sticky md:top-4 md:self-start">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible no-scrollbar">
            {SECTIONS.map(s => {
              const active = section === s.id;
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => changeSection(s.id)}
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
              {section === 'friends' && <FriendsManager />}
              {section === 'appearance' && <AppearanceSection />}
              {section === 'navigation' && <NavigationSection />}
              {section === 'dashboard' && <DashboardSection />}
              {section === 'grading' && <GradingSection />}
              {section === 'subjects' && <SubjectsSection />}
              {section === 'schoolyears' && <SchoolYearsSection />}
              {section === 'notifications' && <NotificationsSection />}
              {section === 'shortcut' && <ShortcutSection />}
              {section === 'feedback' && <FeedbackSection />}
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

  const region = settings.region ?? { country: 'DE' };
  const subOptions = subdivisionsForCountry(region.country);

  function save() {
    setSettings({ name: name.trim() || undefined, school: school.trim() || undefined, classLevel: classLevel.trim() || undefined });
  }

  function setCountry(country: string) {
    // Land gewechselt → Bundesland zurücksetzen
    setSettings({ region: { country, subdivision: undefined } });
  }
  function setSubdivision(sub: string) {
    setSettings({ region: { ...region, subdivision: sub || undefined } });
  }

  return (
    <div className="space-y-4">
    <AccountAuth compact />
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><User className="size-5 text-theme" />Profil</h3>
      <Row label="Profilbild" hint="Erscheint in der Seitenleiste und für deine Freunde.">
        <AvatarUpload
          value={settings.avatarUrl}
          onChange={url => setSettings({ avatarUrl: url })}
          name={name || settings.name || ''}
        />
      </Row>
      <Row label="Name" hint="Wird für die Begrüßung im Dashboard verwendet.">
        <input className="input max-w-[260px]" value={name} onChange={e => setName(e.target.value)} onBlur={save} placeholder="Dein Name" />
      </Row>
      <Row label="Schule (optional)">
        <input className="input max-w-[260px]" value={school} onChange={e => setSchool(e.target.value)} onBlur={save} placeholder="z.B. Albertus-Magnus-Gymnasium" />
      </Row>
      <Row label="Klassenstufe (optional)">
        <input className="input max-w-[160px]" value={classLevel} onChange={e => setClassLevel(e.target.value)} onBlur={save} placeholder="z.B. 11" />
      </Row>
      <Row label="Land" hint="Für Ferien & Feiertage.">
        <select className="input max-w-[200px]" value={region.country} onChange={e => setCountry(e.target.value)}>
          {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Row>
      {subOptions.length > 0 && (
        <Row label="Bundesland" hint="Schulferien sind regional unterschiedlich.">
          <select className="input max-w-[260px]" value={region.subdivision ?? ''} onChange={e => setSubdivision(e.target.value)}>
            <option value="">– wählen –</option>
            {subOptions.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Row>
      )}
    </Card>
    </div>
  );
}

function AppearanceSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const customHue = settings.customHue ?? DEFAULT_CUSTOM_HUE;
  const customPal = paletteFromHue(customHue);
  const customActive = settings.colorTheme === 'custom';
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
                className={`group relative h-28 rounded-2xl overflow-hidden transition-all text-left ${active ? 'ring-2 ring-offset-2 ring-offset-transparent scale-[1.02]' : 'hover:scale-[1.01]'}`}
                style={{
                  '--tw-ring-color': t.primary,
                  background: `linear-gradient(160deg, ${t.gradientFrom}, ${t.gradientVia} 55%, ${t.gradientTo})`,
                } as React.CSSProperties}
              >
                <div className="absolute inset-0" style={{
                  background: `radial-gradient(circle at 25% 20%, rgb(${t.aurora1Rgb} / 0.5) 0, transparent 50%), radial-gradient(circle at 80% 85%, rgb(${t.aurora2Rgb} / 0.45) 0, transparent 50%)`,
                }} />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 30%, transparent 60%)' }} />
                {active && (
                  <div className="absolute top-2 right-2 size-6 rounded-full bg-white/95 grid place-items-center shadow-md z-10">
                    <Check className="size-3.5" style={{ color: t.primary }} />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 px-3 py-2.5">
                  <div className="font-display font-bold text-sm text-white drop-shadow-sm">{t.name}</div>
                  <div className="text-[11px] text-white/80">{t.description}</div>
                </div>
              </button>
            );
          })}

          {/* Eigene Farbe – Farbton frei wählbar */}
          <button onClick={() => setSettings({ colorTheme: 'custom', customHue })}
            className={`group relative h-28 rounded-2xl overflow-hidden transition-all text-left ${customActive ? 'ring-2 ring-offset-2 ring-offset-transparent scale-[1.02]' : 'hover:scale-[1.01]'}`}
            style={{
              '--tw-ring-color': customPal.primary,
              background: `linear-gradient(160deg, ${customPal.gradientFrom}, ${customPal.gradientVia} 55%, ${customPal.gradientTo})`,
            } as React.CSSProperties}
          >
            <div className="absolute inset-0" style={{
              background: `radial-gradient(circle at 25% 20%, rgb(${customPal.aurora1Rgb} / 0.5) 0, transparent 50%), radial-gradient(circle at 80% 85%, rgb(${customPal.aurora2Rgb} / 0.45) 0, transparent 50%)`,
            }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 30%, transparent 60%)' }} />
            {customActive && (
              <div className="absolute top-2 right-2 size-6 rounded-full bg-white/95 grid place-items-center shadow-md z-10">
                <Check className="size-3.5" style={{ color: customPal.primary }} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 px-3 py-2.5">
              <div className="font-display font-bold text-sm text-white drop-shadow-sm">Eigene Farbe</div>
              <div className="text-[11px] text-white/80">Farbton frei wählen</div>
            </div>
          </button>
        </div>

        {/* Farbton-Regler – erscheint, wenn „Eigene Farbe" aktiv ist */}
        <AnimatePresence initial={false}>
          {customActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }} className="overflow-hidden"
            >
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-ink-800">Farbton</span>
                  <span className="size-7 rounded-full border-2 border-white shadow-md" style={{ background: customPal.primary }} />
                </div>
                <input
                  type="range" min={0} max={359} value={customHue}
                  onChange={e => setSettings({ colorTheme: 'custom', customHue: Number(e.target.value) })}
                  className="hue-slider w-full"
                  style={{ background: 'linear-gradient(to right, hsl(0,75%,58%), hsl(60,75%,58%), hsl(120,75%,58%), hsl(180,75%,58%), hsl(240,75%,58%), hsl(300,75%,58%), hsl(360,75%,58%))' }}
                  aria-label="Farbton wählen"
                />
                <p className="text-[11px] text-ink-500 mt-2.5 flex gap-1.5"><Lightbulb className="size-3.5 shrink-0 mt-px" /><span>Nur der Farbton ist wählbar – Sättigung und Helligkeit setzen wir passend, damit immer genug Kontrast bleibt.</span></p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Sparkles className="size-5 text-amber-500" />Animationen & Feedback</h3>
        <Row label="Animations-Stufe" hint="Wie viel Bewegung soll's sein?">
          <Segmented<AnimationLevel> value={settings.animationLevel} options={[
            { value: 'rich', label: 'Reichhaltig' }, { value: 'reduced', label: 'Reduziert' }, { value: 'minimal', label: 'Minimal' },
          ]} onChange={v => setSettings({ animationLevel: v })} />
        </Row>
        <Row label="Konfetti bei guten Noten" hint="Bei Note 1/2 (Bayern), ab 12 P (Oberstufe).">
          <Toggle checked={settings.confettiOnGood} onChange={v => setSettings({ confettiOnGood: v })} />
        </Row>
        <div className="text-xs text-ink-500 mt-2 flex gap-1.5"><Lightbulb className="size-3.5 shrink-0 mt-px" /><span>Wenn dein Gerät „Bewegung reduzieren" aktiviert hat, schalten wir automatisch auf Reduziert.</span></div>
      </Card>
    </div>
  );
}

function NavigationSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const base = useBaseNavItems();
  // Alle Einträge in der aktuellen Reihenfolge – inkl. ausgeblendete, damit
  // man sie hier wieder einschalten kann.
  const items = applyNavPrefs(base, settings.navOrder, undefined);
  const hidden = settings.navHidden ?? [];
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const isDefault = !settings.navOrder?.length && !hidden.length;

  function persistOrder(next: NavItem[]) {
    setSettings({ navOrder: next.map(i => i.to) });
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    persistOrder(next);
  }
  function toggleHidden(to: string) {
    const set = new Set(hidden);
    if (set.has(to)) set.delete(to); else set.add(to);
    setSettings({ navHidden: [...set] });
  }
  function reset() {
    setSettings({ navOrder: undefined, navHidden: undefined });
  }
  function onDrop(target: number) {
    if (dragIdx !== null) move(dragIdx, target);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-display font-bold text-ink-900">Ansichten & Menü</h3>
            <p className="text-xs text-ink-500 max-w-md mt-0.5">
              Ziehe Einträge zum Sortieren oder blende aus, was du nicht brauchst. Die Reihenfolge gilt für die Seitenleiste (Desktop) und die Tab-Leiste (Handy).
            </p>
          </div>
          {!isDefault && (
            <button onClick={reset} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-600 hover:bg-white/70 transition">
              <RotateCcw className="size-3.5" /> Zurücksetzen
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => {
            const Icon = item.icon;
            const isHidden = hidden.includes(item.to);
            const locked = LOCKED_NAV_ROUTES.includes(item.to);
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
            return (
              <li
                key={item.to}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnter={() => setOverIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition select-none
                  ${dragIdx === i ? 'opacity-50' : ''}
                  ${isOver ? 'border-theme-deep/60 bg-white/70' : 'border-white/50 bg-white/40'}
                  ${isHidden ? 'opacity-60' : ''}`}
              >
                <span className="cursor-grab active:cursor-grabbing text-ink-400 touch-none" title="Zum Sortieren ziehen">
                  <GripVertical className="size-4" />
                </span>
                <span className={`grid place-items-center size-8 rounded-xl shrink-0 ${isHidden ? 'bg-ink-200/60 text-ink-400' : 'theme-gradient text-white'}`}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-ink-800 text-sm">{item.label}</span>
                  {isHidden && <span className="ml-2 text-[11px] text-ink-400 font-medium">ausgeblendet</span>}
                </span>

                {/* Reihenfolge per Pfeil (Touch-Fallback zum Drag) */}
                <div className="flex flex-col -my-1">
                  <button onClick={() => move(i, i - 1)} disabled={i === 0}
                    className="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30 disabled:hover:text-ink-400 transition" aria-label="Nach oben">
                    <ChevronUp className="size-4" />
                  </button>
                  <button onClick={() => move(i, i + 1)} disabled={i === items.length - 1}
                    className="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30 disabled:hover:text-ink-400 transition" aria-label="Nach unten">
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                {locked ? (
                  <span className="grid place-items-center size-8 text-ink-300" title="Immer sichtbar">
                    <Lock className="size-4" />
                  </span>
                ) : (
                  <button onClick={() => toggleHidden(item.to)}
                    className={`grid place-items-center size-8 rounded-xl transition ${isHidden ? 'text-ink-400 hover:bg-white/70' : 'text-theme-deep hover:bg-white/70'}`}
                    title={isHidden ? 'Einblenden' : 'Ausblenden'}>
                    {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="text-xs text-ink-500 mt-3 flex gap-1.5"><Lightbulb className="size-3.5 shrink-0 mt-px" /><span>Die Einstellungen bleiben immer sichtbar – damit du hierher zurückfindest.</span></div>
      </Card>
    </div>
  );
}

function DashboardSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><LayoutDashboard className="size-5 text-sky-500" />Dashboard</h3>
      <Row label="Begrüßungsstil" hint="Wie soll dich das Dashboard ansprechen?">
        <Segmented<GreetingStyle> value={settings.dashboardGreetingStyle} options={[
          { value: 'casual', label: 'Locker' }, { value: 'formal', label: 'Formell' }, { value: 'fun', label: 'Lustig' },
        ]} onChange={v => setSettings({ dashboardGreetingStyle: v })} />
      </Row>
      <Row label="Wochenstart">
        <Segmented<0 | 1> value={settings.weekStart} options={[
          { value: 1, label: 'Montag' }, { value: 0, label: 'Sonntag' },
        ]} onChange={v => setSettings({ weekStart: v })} />
      </Row>
      <Row label="Schul-Tagesfenster" hint="Bestimmt den sichtbaren Zeitbereich im Heute-Stundenplan-Widget.">
        <input type="time" className="input max-w-[120px]" value={settings.schoolStart}
          onChange={e => setSettings({ schoolStart: e.target.value })} />
        <span className="text-ink-500">bis</span>
        <input type="time" className="input max-w-[120px]" value={settings.schoolEnd}
          onChange={e => setSettings({ schoolEnd: e.target.value })} />
      </Row>
      <Row label="Quick-Buttons" hint="Welche Knöpfe oben im Dashboard erscheinen.">
        <div className="flex flex-wrap gap-1.5">
          {(['todo', 'hausaufgabe', 'projekt'] as TaskKind[]).map(k => {
            const active = settings.quickButtons.includes(k);
            return (
              <button key={k} onClick={() => {
                const next = active ? settings.quickButtons.filter(x => x !== k) : [...settings.quickButtons, k];
                setSettings({ quickButtons: next });
              }} className={`chip ${active ? 'chip-active' : ''}`}>
                {k === 'todo' ? 'Todo' : k === 'hausaufgabe' ? 'Hausaufgabe' : 'Projekt'}
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
          <span className="chip">Bayern · 1–6</span>
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

      <CustomKindsCard />

    </div>
  );
}

function CustomKindsCard() {
  const settings = useStore(s => s.settings)!;
  const setGradingConfig = useStore(s => s.setGradingConfig);
  const cfg = settings.gradingConfig;
  const customKinds = cfg.customKinds ?? [];

  const [draftLabel, setDraftLabel] = useState('');
  const [draftWeighting, setDraftWeighting] = useState<'large' | 'rest'>('rest');

  function addKind() {
    const label = draftLabel.trim();
    if (!label) return;
    const id = 'custom-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    const next = [...customKinds, { id, label, weighting: draftWeighting }];
    setGradingConfig({ customKinds: next });
    setDraftLabel('');
    setDraftWeighting('rest');
  }

  function updateKind(id: string, patch: Partial<{ label: string; weighting: 'large' | 'rest' }>) {
    const next = customKinds.map(k => k.id === id ? { ...k, ...patch } : k);
    setGradingConfig({ customKinds: next });
  }

  function deleteKind(id: string) {
    const k = customKinds.find(c => c.id === id);
    if (!k) return;
    if (!confirm(`Kategorie „${k.label}" löschen? Bestehende Noten mit dieser Kategorie behalten ihren Eintrag, werden aber wieder als „Sonstige" verrechnet.`)) return;
    const next = customKinds.filter(c => c.id !== id);
    setGradingConfig({ customKinds: next });
  }

  const BUILTIN_KIND_ORDER: string[] = ['schulaufgabe', 'klausur', 'stegreif', 'muendlich', 'referat', 'projekt', 'sonstige'];
  void BUILTIN_GRADE_KINDS;

  return (
    <Card>
      <h3 className="h3 mb-2 flex items-center gap-2">
        <span className="inline-block size-3 rounded-full bg-violet-500" />
        Leistungsnachweis-Kategorien
      </h3>
      <p className="subtle mb-3">
        Eingebaute Kategorien stehen immer zur Verfügung. Du kannst zusätzlich eigene anlegen (z. B. „Vokabeltest").
      </p>

      <div className="space-y-1 mb-4">
        <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-1.5">Eingebaut</div>
        {BUILTIN_KIND_ORDER.map(id => (
          <div key={id} className="rounded-xl bg-white/50 border border-white/60 px-3 py-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-700">{BUILTIN_KIND_LABEL[id]}</span>
            <span className="text-[10px] text-ink-400 font-medium">
              {id === 'schulaufgabe' || id === 'klausur' ? 'wie Schulaufgabe' : 'wie Mündlich'}
            </span>
          </div>
        ))}
      </div>

      {customKinds.length > 0 && (
        <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-1.5">Eigene</div>
      )}
      {customKinds.length > 0 && (
        <ul className="space-y-2 mb-4">
          {customKinds.map(k => (
            <li key={k.id} className="rounded-2xl bg-white/70 border border-white/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                className="input flex-1 min-w-0"
                value={k.label}
                onChange={e => updateKind(k.id, { label: e.target.value })}
                placeholder="Bezeichnung"
              />
              <div className="inline-flex glass rounded-2xl p-1 gap-0.5">
                {(['large', 'rest'] as const).map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => updateKind(k.id, { weighting: w })}
                    className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition ${k.weighting === w ? 'text-white' : 'text-ink-700'}`}
                  >
                    {k.weighting === w && (
                      <motion.span layoutId={`ck-${k.id}`} className="absolute inset-0 rounded-xl theme-gradient" />
                    )}
                    <span className="relative whitespace-nowrap">
                      {w === 'large' ? 'wie Schulaufgabe' : 'wie Mündlich'}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => deleteKind(k.id)}
                className="size-9 grid place-items-center rounded-xl text-ink-400 hover:text-rose-500 hover:bg-rose-50 transition"
                title="Löschen"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl bg-theme-soft/30 border border-theme-soft p-3">
        <label className="label">Neue Kategorie</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1 min-w-0"
            placeholder="z. B. Vokabeltest"
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addKind(); }}
          />
          <div className="inline-flex glass rounded-2xl p-1 gap-0.5">
            {(['large', 'rest'] as const).map(w => (
              <button
                key={w}
                type="button"
                onClick={() => setDraftWeighting(w)}
                className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition ${draftWeighting === w ? 'text-white' : 'text-ink-700'}`}
              >
                {draftWeighting === w && <motion.span layoutId="ck-new" className="absolute inset-0 rounded-xl theme-gradient" />}
                <span className="relative whitespace-nowrap">{w === 'large' ? 'wie Schulaufgabe' : 'wie Mündlich'}</span>
              </button>
            ))}
          </div>
          <button onClick={addKind} disabled={!draftLabel.trim()} className="btn-primary">
            <Plus className="size-4" />Hinzufügen
          </button>
        </div>
        <div className="text-[11px] text-ink-500 mt-2 leading-relaxed">
          <strong>wie Schulaufgabe</strong> = große Leistung, zählt im Bayern-Hauptfach doppelt (mit Schulaufgaben/Klausuren).<br />
          <strong>wie Mündlich</strong> = kleine Leistung, zählt im Rest-Block (Stegreif/Mündlich/Referat).
        </div>
      </div>
    </Card>
  );
}

function SubjectsSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const subjects = useStore(s => s.subjects);
  const updateSubject = useStore(s => s.updateSubject);
  const moveSubject = useStore(s => s.moveSubject);
  const [subjDialog, setSubjDialog] = useState<{ open: boolean; subject?: Subject }>({ open: false });

  const groups = settings.subjectGroups ?? [];
  const sortedGroups = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Gruppieren: für jede Gruppe ihre Fächer + die ohne Gruppe als "Ohne Kategorie"
  const subjectsByGroup = (() => {
    const m = new Map<string | null, Subject[]>();
    for (const s of subjects) {
      const key = s.groupId ?? null;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  })();

  function newGroup() {
    const label = prompt('Name der Gruppe? (z. B. Naturwissenschaften, Sprachen)');
    if (!label?.trim()) return;
    const id = 'grp-' + Math.random().toString(36).slice(2, 9);
    const next = [...groups, { id, label: label.trim(), position: groups.length }];
    setSettings({ subjectGroups: next });
  }

  function renameGroup(id: string) {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    const label = prompt('Neuer Name:', g.label);
    if (!label?.trim()) return;
    setSettings({ subjectGroups: groups.map(x => x.id === id ? { ...x, label: label.trim() } : x) });
  }

  async function deleteGroup(id: string) {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    const inGroup = subjects.filter(s => s.groupId === id);
    if (inGroup.length && !confirm(`Gruppe „${g.label}" löschen? ${inGroup.length} Fächer landen wieder „Ohne Kategorie".`)) return;
    // Subject-Group-IDs leeren
    for (const s of inGroup) await updateSubject(s.id, { groupId: undefined });
    setSettings({ subjectGroups: groups.filter(x => x.id !== id) });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="h3 flex items-center gap-2">
            <BookOpen className="size-5 text-theme" />
            Fächer ({subjects.length})
          </h3>
          <div className="flex gap-2">
            <button onClick={newGroup} className="btn-ghost text-xs">
              <Plus className="size-4" />Gruppe
            </button>
            <button onClick={() => setSubjDialog({ open: true })} className="btn-primary">
              <Plus className="size-4" />Fach
            </button>
          </div>
        </div>

        {!subjects.length ? (
          <Empty icon={Plus} title="Noch keine Fächer" description="Lege jetzt dein erstes Fach an." />
        ) : (
          <div className="space-y-4">
            {/* Gruppen mit Inhalt */}
            {sortedGroups.map(g => {
              const items = (subjectsByGroup.get(g.id) ?? []).sort((a, b) =>
                (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'de')
              );
              return (
                <SubjectGroupBlock
                  key={g.id}
                  title={g.label}
                  groupId={g.id}
                  subjects={items}
                  groups={groups}
                  onRename={() => renameGroup(g.id)}
                  onDelete={() => deleteGroup(g.id)}
                  onEdit={s => setSubjDialog({ open: true, subject: s })}
                  onMove={moveSubject}
                  onChangeGroup={(s, newGroupId) => updateSubject(s.id, { groupId: newGroupId })}
                />
              );
            })}
            {/* Fächer ohne Gruppe */}
            <SubjectGroupBlock
              title={sortedGroups.length ? 'Ohne Kategorie' : 'Alle Fächer'}
              groupId={null}
              subjects={(subjectsByGroup.get(null) ?? []).sort((a, b) =>
                (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'de')
              )}
              groups={groups}
              onEdit={s => setSubjDialog({ open: true, subject: s })}
              onMove={moveSubject}
              onChangeGroup={(s, newGroupId) => updateSubject(s.id, { groupId: newGroupId })}
              hideHeaderActions
            />
          </div>
        )}

        <SubjectDialog open={subjDialog.open} initial={subjDialog.subject} onClose={() => setSubjDialog({ open: false })} />
      </Card>
    </div>
  );
}

function SubjectGroupBlock({
  title, groupId, subjects, groups, onRename, onDelete, onEdit, onMove, onChangeGroup, hideHeaderActions,
}: {
  title: string;
  groupId: string | null;
  subjects: Subject[];
  groups: Array<{ id: string; label: string }>;
  onRename?: () => void;
  onDelete?: () => void;
  onEdit: (s: Subject) => void;
  onMove: (id: string, delta: -1 | 1) => Promise<void>;
  onChangeGroup: (s: Subject, newGroupId: string | undefined) => Promise<void>;
  hideHeaderActions?: boolean;
}) {
  if (groupId === null && subjects.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 pl-1">
        <h4 className="text-xs uppercase tracking-wider font-semibold text-ink-500">
          {title} <span className="text-ink-400">· {subjects.length}</span>
        </h4>
        {!hideHeaderActions && (
          <div className="flex gap-1">
            {onRename && (
              <button onClick={onRename} className="size-7 grid place-items-center rounded-full hover:bg-white/70 text-ink-500" title="Umbenennen">
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="size-7 grid place-items-center rounded-full hover:bg-rose-50 text-ink-400 hover:text-rose-500" title="Gruppe löschen">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {subjects.length === 0 ? (
        <div className="text-xs text-ink-400 italic px-3 py-2">Noch keine Fächer in dieser Gruppe.</div>
      ) : (
        <ul className="space-y-2">
          {subjects.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-3 bg-white/70 flex items-center gap-3"
            >
              <div className="size-11 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: s.color }}><SubjectIcon subject={s} className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-800 truncate">{s.name}</div>
                <div className="text-xs text-ink-500">
                  {CATEGORY_LABEL[s.category]}
                </div>
              </div>
              <select
                value={s.groupId ?? ''}
                onChange={e => onChangeGroup(s, e.target.value || undefined)}
                className="chip bg-white/80 cursor-pointer text-xs max-w-[140px]"
                title="Gruppe zuweisen"
              >
                <option value="">Ohne Kategorie</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onMove(s.id, -1)}
                  disabled={i === 0}
                  className="size-6 grid place-items-center rounded-md hover:bg-white text-ink-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Nach oben"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => onMove(s.id, 1)}
                  disabled={i === subjects.length - 1}
                  className="size-6 grid place-items-center rounded-md hover:bg-white text-ink-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Nach unten"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
              <button onClick={() => onEdit(s)} className="size-9 grid place-items-center rounded-full hover:bg-white" title="Bearbeiten">
                <Pencil className="size-4" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
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

/* ─── Kalender-Abonnement ─────────────────────────────────────────── */

type CalendarFeedKind = 'schedule' | 'exams';

/** Texte & Dateiname je Feed-Art – hält die Karte selbst generisch. */
const CAL_FEED_CFG: Record<CalendarFeedKind, {
  fileName: string;
  title: string;
  intro: string;
  loggedOut: string;
  emptyWarning: string;
}> = {
  schedule: {
    fileName: 'stundenplan',
    title: 'Stundenplan abonnieren',
    intro: 'Generiere einen Link, mit dem du deinen Stundenplan in Google Calendar, Apple Kalender oder Outlook abonnieren kannst. Der Kalender aktualisiert sich automatisch, wenn du deinen Stundenplan änderst.',
    loggedOut: 'Logge dich ein, um deinen Stundenplan als Abo-Link für Google/Apple Kalender zu bekommen.',
    emptyWarning: 'Dein Stundenplan ist leer – der Feed wird leer sein, bis du Stunden anlegst.',
  },
  exams: {
    fileName: 'tests',
    title: 'Tests abonnieren',
    intro: 'Generiere einen Link, mit dem du deine angekündigten Tests & Klausuren in Google Calendar, Apple Kalender oder Outlook abonnieren kannst. Jede geplante Prüfung erscheint als ganztägiger Termin und aktualisiert sich automatisch.',
    loggedOut: 'Logge dich ein, um deine Tests als Abo-Link für Google/Apple Kalender zu bekommen.',
    emptyWarning: 'Du hast aktuell keine angekündigten Tests – der Feed bleibt leer, bis du eine Prüfung mit Datum planst.',
  },
};

function CalendarSubscriptionCard({ kind = 'schedule' }: { kind?: CalendarFeedKind }) {
  const authUser = useStore(s => s.authUser);
  const lessons = useStore(s => s.lessons);
  const grades = useStore(s => s.grades);
  const cfg = CAL_FEED_CFG[kind];
  const [token, setToken] = useState<import('@/lib/calendarSubscription').CalendarToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'url' | 'webcal' | null>(null);

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    import('@/lib/calendarSubscription').then(async (mod) => {
      try {
        const t = await mod.getActiveCalendarToken(kind);
        if (!cancelled) setToken(t);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [authUser, kind]);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const mod = await import('@/lib/calendarSubscription');
      const t = await mod.createCalendarToken(kind);
      setToken(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Kalender-Link zurückziehen? Bestehende Abos in Google/Apple Kalender werden ungültig.')) return;
    setBusy(true); setError(null);
    try {
      const mod = await import('@/lib/calendarSubscription');
      await mod.revokeCalendarTokens(kind);
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, which: 'url' | 'webcal') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }

  if (!supabase) {
    return null; // wenn keine Cloud, zeigen wir die Karte gar nicht erst
  }

  if (!authUser) {
    return (
      <Card>
        <h3 className="h3 mb-2 flex items-center gap-2"><Calendar className="size-5 text-theme" />{cfg.title}</h3>
        <p className="text-sm text-ink-500">{cfg.loggedOut}</p>
      </Card>
    );
  }

  const isEmpty = kind === 'exams'
    ? grades.filter(g => g.isPending && !!g.date).length === 0
    : lessons.length === 0;

  return (
    <Card>
      <h3 className="h3 mb-1 flex items-center gap-2">
        <Calendar className="size-5 text-theme" />
        {cfg.title}
      </h3>
      <p className="subtle mb-3">{cfg.intro}</p>

      {loading ? (
        <div className="rounded-2xl bg-white/60 p-6 grid place-items-center">
          <Loader2 className="size-5 text-theme animate-spin" />
        </div>
      ) : token ? (
        <CalendarTokenView token={token} fileName={cfg.fileName} onRevoke={revoke} onRegenerate={generate} busy={busy} copied={copied} onCopy={copy} />
      ) : (
        <div className="space-y-3">
          {isEmpty && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              {cfg.emptyWarning}
            </div>
          )}
          <button onClick={generate} disabled={busy} className="btn-primary w-full">
            {busy ? <><Loader2 className="size-4 animate-spin" />Erstelle …</> : <><KeyRound className="size-4" />Kalender-Link erstellen</>}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </Card>
  );
}

function CalendarTokenView({
  token,
  fileName,
  onRevoke,
  onRegenerate,
  busy,
  copied,
  onCopy,
}: {
  token: import('@/lib/calendarSubscription').CalendarToken;
  fileName: string;
  onRevoke: () => void;
  onRegenerate: () => void;
  busy: boolean;
  copied: 'url' | 'webcal' | null;
  onCopy: (v: string, k: 'url' | 'webcal') => void;
}) {
  const [urls, setUrls] = useState<{ https: string; webcal: string; google: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/calendarSubscription').then((mod) => {
      if (cancelled) return;
      setUrls({
        https: mod.buildCalendarFeedUrl(token.token, fileName),
        webcal: mod.buildCalendarWebcalUrl(token.token, fileName),
        google: mod.buildGoogleCalendarAddUrl(token.token, fileName),
      });
    });
    return () => { cancelled = true; };
  }, [token.token, fileName]);

  if (!urls) return <div className="rounded-2xl bg-white/60 p-6 grid place-items-center"><Loader2 className="size-5 text-theme animate-spin" /></div>;

  const last = token.lastAccessedAt
    ? new Date(token.lastAccessedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'noch nie';

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">
          Abo-URL
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-xs bg-white/70 rounded-xl px-2 py-1.5 truncate font-mono text-ink-800">
            {urls.https}
          </code>
          <button onClick={() => onCopy(urls.https, 'url')} className="btn-ghost py-1 px-2 text-xs">
            {copied === 'url' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied === 'url' ? 'Kopiert' : 'Kopieren'}
          </button>
        </div>
        <div className="text-[11px] text-ink-500 mt-1.5">
          Zuletzt abgerufen: {last}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <a href={urls.google} target="_blank" rel="noopener noreferrer" className="btn-ghost justify-center">
          <ExternalLink className="size-4" />In Google Calendar
        </a>
        <a href={urls.webcal} className="btn-ghost justify-center">
          <ExternalLink className="size-4" />In Apple/Outlook
        </a>
      </div>

      <div className="rounded-2xl bg-theme-soft/30 border border-theme-soft p-3 text-[11px] text-ink-700 leading-relaxed">
        <strong>So abonnierst du:</strong>
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>Google Calendar:</strong> Klick „In Google Calendar" oder unter „Andere Kalender hinzufügen → Per URL" einfügen.</li>
          <li><strong>Apple Kalender (Mac/iOS):</strong> Klick „In Apple/Outlook" oder Datei → Neues Kalenderabonnement → URL einfügen.</li>
          <li><strong>Outlook:</strong> Kalender importieren → Aus dem Web → URL einfügen.</li>
        </ul>
        <div className="mt-1.5 text-ink-500">
          Refresh-Intervalle sind Sache der jeweiligen App (Apple: ~1h, Google: 4–24h, Outlook: ~3h).
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onRegenerate} disabled={busy} className="btn-ghost flex-1 text-xs">
          <RefreshCw className="size-3.5" />Neuen Link erstellen
        </button>
        <button onClick={onRevoke} disabled={busy} className="btn-soft flex-1 text-xs text-rose-600">
          <Trash2 className="size-3.5" />Link zurückziehen
        </button>
      </div>
    </div>
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
  const [isOberstufe, setIsOberstufe] = useState(false);
  const [oberG8, setOberG8] = useState(false);
  const [yearOnboarding, setYearOnboarding] = useState<{ open: boolean; yearName: string; oberstufe: boolean }>({ open: false, yearName: '', oberstufe: false });

  function suggestName() {
    if (isOberstufe) return 'Oberstufe';
    const [y] = newStart.split('-').map(Number);
    return `${y}/${String(y + 1).slice(2)}`;
  }

  async function create() {
    const name = newName.trim() || suggestName();
    // In der Oberstufe nie Fächer aus einem regulären Jahr kopieren (anderes Notensystem).
    const doCopy = copySubjects && !!activeId && !isOberstufe;
    const skipCopy = !doCopy;
    await addSchoolYear({
      name,
      startDate: new Date(newStart).getTime(),
      copySubjectsFromYearId: doCopy ? activeId : undefined,
      copyLessonsFromYearId: doCopy && copyLessons ? activeId : undefined,
      oberstufe: isOberstufe,
      oberstufeJahrgaenge: isOberstufe ? (oberG8 ? [11, 12] : [12, 13]) : undefined,
    });
    setShowForm(false);
    setNewName('');
    const wasOberstufe = isOberstufe;
    setIsOberstufe(false);
    setOberG8(false);
    // Wenn nicht kopiert wurde, ist das Jahr leer → kleines Onboarding öffnen.
    if (skipCopy) {
      setYearOnboarding({ open: true, yearName: name, oberstufe: wasOberstufe });
    }
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
            <div>
              <label className="label">Art</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsOberstufe(false)}
                  className={`text-left rounded-xl p-3 border transition ${!isOberstufe ? 'border-theme bg-theme-soft/50' : 'border-white/50 bg-white/60 hover:bg-white/80'}`}
                >
                  <div className="flex items-center gap-2 font-semibold text-ink-900 text-sm">
                    <Calendar className="size-4" /> Reguläres Schuljahr
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">Ein Jahr mit eigenen Fächern & Noten.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOberstufe(true)}
                  className={`text-left rounded-xl p-3 border transition ${isOberstufe ? 'border-theme bg-theme-soft/50' : 'border-white/50 bg-white/60 hover:bg-white/80'}`}
                >
                  <div className="flex items-center gap-2 font-semibold text-ink-900 text-sm">
                    <GraduationCap className="size-4" /> Oberstufe (Bayern)
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">Q-Phase mit 4 Halbjahren, Punkte 0–15.</div>
                </button>
              </div>
            </div>
            {isOberstufe && (
              <div>
                <label className="label">Jahrgangsstufen</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setOberG8(false)}
                    className={`rounded-xl p-2.5 border text-sm font-semibold transition ${!oberG8 ? 'border-theme bg-theme-soft/50 text-ink-900' : 'border-white/50 bg-white/60 text-ink-600 hover:bg-white/80'}`}>
                    G9 · 12/13
                  </button>
                  <button type="button" onClick={() => setOberG8(true)}
                    className={`rounded-xl p-2.5 border text-sm font-semibold transition ${oberG8 ? 'border-theme bg-theme-soft/50 text-ink-900' : 'border-white/50 bg-white/60 text-ink-600 hover:bg-white/80'}`}>
                    G8 · 11/12
                  </button>
                </div>
              </div>
            )}
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
            {activeId && !isOberstufe && (
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
                      {y.oberstufe && <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 px-1.5 py-0.5 rounded-md bg-amber-100 inline-flex items-center gap-1"><GraduationCap className="size-3" />Oberstufe</span>}
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

      <SchoolYearOnboardingDialog
        open={yearOnboarding.open}
        yearName={yearOnboarding.yearName}
        defaultSystem={yearOnboarding.oberstufe ? 'oberstufe' : undefined}
        onClose={() => setYearOnboarding({ open: false, yearName: '', oberstufe: false })}
      />
    </div>
  );
}

/* ─── Benachrichtigungen ─────────────────────────────────────────────── */

function NotificationsSection() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  const authUser = useStore(s => s.authUser);
  const n = settings.notifications;

  const [permission, setPermission] = useState<import('@/lib/push').PushPermission>('default');
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('@/lib/push');
      if (cancelled) return;
      setSupported(mod.isPushSupported());
      setPermission(mod.currentPermission());
      const sub = await mod.getActiveSubscription();
      if (!cancelled) setSubscribed(!!sub);
    })();
    return () => { cancelled = true; };
  }, []);

  function patchN(patch: Partial<typeof n>) {
    setSettings({ notifications: { ...n, ...patch } });
  }
  function patchSub<K extends keyof typeof n>(key: K, patch: Partial<typeof n[K]>) {
    setSettings({ notifications: { ...n, [key]: { ...(n[key] as object), ...patch } } });
  }

  async function enableAll() {
    setBusy(true); setMsg(null);
    try {
      const mod = await import('@/lib/push');
      let perm = mod.currentPermission();
      if (perm !== 'granted') perm = await mod.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMsg({ kind: 'err', text: 'Browser hat die Erlaubnis abgelehnt – im Browser-Setting wieder aktivierbar.' });
        return;
      }
      const res = await mod.subscribePush();
      if (!res.ok) {
        setMsg({ kind: 'err', text: res.error ?? 'Unbekannter Fehler.' });
        return;
      }
      setSubscribed(true);
      patchN({ enabled: true });
      setMsg({ kind: 'ok', text: 'Push aktiviert! Du bekommst ab jetzt Benachrichtigungen auf diesem Gerät.' });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const mod = await import('@/lib/push');
      await mod.unsubscribePush();
      setSubscribed(false);
      patchN({ enabled: false });
      setMsg({ kind: 'ok', text: 'Push deaktiviert auf diesem Gerät.' });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true); setMsg(null);
    try {
      const mod = await import('@/lib/push');
      await mod.showLocalTestNotification();
      setMsg({ kind: 'ok', text: 'Test-Notification ausgelöst – schau in deinen System-Notification-Bereich.' });
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><BellOff className="size-5 text-ink-400" />Benachrichtigungen</h3>
        <p className="text-sm text-ink-500">
          Dieses Gerät unterstützt keine Push-Benachrichtigungen. Auf iOS funktioniert das
          nur, wenn du die App über „Zum Home-Bildschirm" installierst.
        </p>
      </Card>
    );
  }

  if (!supabase) {
    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><BellOff className="size-5 text-ink-400" />Benachrichtigungen</h3>
        <p className="text-sm text-ink-500">Cloud-Sync ist nicht eingerichtet.</p>
      </Card>
    );
  }

  if (!authUser) {
    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Bell className="size-5 text-theme" />Benachrichtigungen</h3>
        <p className="text-sm text-ink-500">
          Logge dich erst ein – dann kannst du Push-Benachrichtigungen aktivieren.
        </p>
      </Card>
    );
  }

  const masterOn = n.enabled && subscribed && permission === 'granted';

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Bell className="size-5 text-theme" />Benachrichtigungen</h3>
        <p className="subtle mb-3">
          Lass dich an Hausaufgaben, Klausuren, Stundenbeginn und Lern-Deadlines erinnern.
          Funktioniert auch wenn der Browser geschlossen ist (außer iOS-Safari ohne PWA-Install).
        </p>

        <div className={`rounded-2xl p-4 mb-3 ${masterOn ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className="flex items-start gap-3">
            <div className={`size-10 rounded-2xl grid place-items-center text-white flex-shrink-0 ${masterOn ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              {masterOn ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm ${masterOn ? 'text-emerald-800' : 'text-amber-900'}`}>
                {masterOn ? 'Aktiv auf diesem Gerät' : 'Noch nicht aktiviert'}
              </div>
              <div className={`text-xs mt-0.5 ${masterOn ? 'text-emerald-700' : 'text-amber-800'}`}>
                {masterOn
                  ? 'Browser-Erlaubnis erteilt, Gerät registriert.'
                  : permission === 'denied'
                    ? 'Im Browser blockiert. Du musst die Erlaubnis manuell in den Browser-Einstellungen wieder erlauben.'
                    : 'Klick „Aktivieren" und erlaube Benachrichtigungen.'}
              </div>
            </div>
            {masterOn ? (
              <button onClick={disable} disabled={busy} className="btn-soft text-rose-600">
                <BellOff className="size-4" />Deaktivieren
              </button>
            ) : (
              <button onClick={enableAll} disabled={busy || permission === 'denied'} className="btn-primary">
                {busy ? <><Loader2 className="size-4 animate-spin" />…</> : <><Bell className="size-4" />Aktivieren</>}
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className={`rounded-2xl p-3 text-sm mb-3 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            {msg.text}
          </div>
        )}

        {masterOn && (
          <button onClick={sendTest} disabled={busy} className="btn-ghost text-xs w-full justify-center">
            <Send className="size-3.5" />Test-Benachrichtigung schicken
          </button>
        )}
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Volume2 className="size-5 text-theme" />Was und wann</h3>
        <p className="subtle mb-3">Pro Event-Typ einzeln steuerbar. Funktioniert nur wenn oben aktiviert.</p>

        <EventBlock
          icon={NotebookPen}
          title="Hausaufgaben"
          subtitle="Erinnerung vor dem Fälligkeitsdatum"
          enabled={n.homework.enabled}
          onToggle={v => patchSub('homework', { enabled: v })}
        >
          <Row label="Vorlauf" hint="Wieviele Stunden vor der Fälligkeit du erinnert werden willst.">
            <NumberInput value={n.homework.hoursBefore} unit="h" min={1} max={72} step={1}
              onChange={v => patchSub('homework', { hoursBefore: v })} />
          </Row>
        </EventBlock>

        <EventBlock
          icon={ClipboardCheck}
          title="Klausuren & Tests"
          subtitle="Vorlauf für große Leistungen"
          enabled={n.exam.enabled}
          onToggle={v => patchSub('exam', { enabled: v })}
        >
          <Row label="Erste Erinnerung" hint="Tage vorher. 0 = aus.">
            <NumberInput value={n.exam.daysBefore} unit="Tage" min={0} max={14} step={1}
              onChange={v => patchSub('exam', { daysBefore: v })} />
          </Row>
          <Row label="Zweite Erinnerung" hint="Stunden vorher. 0 = aus.">
            <NumberInput value={n.exam.hoursBefore} unit="h" min={0} max={48} step={1}
              onChange={v => patchSub('exam', { hoursBefore: v })} />
          </Row>
        </EventBlock>

        <EventBlock
          icon={Clock}
          title="Stundenbeginn"
          subtitle="Kurz vor einer Schulstunde"
          enabled={n.lessonStart.enabled}
          onToggle={v => patchSub('lessonStart', { enabled: v })}
        >
          <Row label="Vorlauf" hint="Minuten vor Stundenbeginn.">
            <NumberInput value={n.lessonStart.minutesBefore} unit="Min" min={1} max={60} step={1}
              onChange={v => patchSub('lessonStart', { minutesBefore: v })} />
          </Row>
          <Row label="Nur Mo–Fr" hint="Am Wochenende keine Stunden-Erinnerungen.">
            <Toggle checked={n.lessonStart.onlyWeekdays}
              onChange={v => patchSub('lessonStart', { onlyWeekdays: v })} />
          </Row>
        </EventBlock>

        <EventBlock
          icon={BookOpen}
          title="Lern-Deadlines"
          subtitle="Wenn du in der Lerncheckliste ein Ziel-Datum gesetzt hast"
          enabled={n.studyDeadline.enabled}
          onToggle={v => patchSub('studyDeadline', { enabled: v })}
        >
          <Row label="Vorlauf" hint="Stunden vor der Lern-Deadline.">
            <NumberInput value={n.studyDeadline.hoursBefore} unit="h" min={1} max={168} step={1}
              onChange={v => patchSub('studyDeadline', { hoursBefore: v })} />
          </Row>
        </EventBlock>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Moon className="size-5 text-indigo-500" />Stille Zeit</h3>
        <p className="subtle mb-3">Während dieses Fensters kommen keine Benachrichtigungen durch.</p>

        <Row label="Stille Zeit aktiv">
          <Toggle checked={n.quietHours.enabled}
            onChange={v => patchSub('quietHours', { enabled: v })} />
        </Row>
        {n.quietHours.enabled && (
          <Row label="Von – Bis" hint="Über Mitternacht erlaubt (z. B. 22:00 → 07:00).">
            <input
              type="time"
              value={n.quietHours.from}
              onChange={e => patchSub('quietHours', { from: e.target.value })}
              className="input max-w-[120px]"
            />
            <span className="text-ink-500">bis</span>
            <input
              type="time"
              value={n.quietHours.to}
              onChange={e => patchSub('quietHours', { to: e.target.value })}
              className="input max-w-[120px]"
            />
          </Row>
        )}
      </Card>

      <div className="text-[11px] text-ink-400 leading-relaxed px-1 flex gap-1.5">
        <Lightbulb className="size-3.5 shrink-0 mt-px" />
        <span>Push muss auf jedem Gerät einzeln aktiviert werden. Die Einstellungen
        (welche Events / Vorlauf / Stille Zeit) gelten global für deinen Account.</span>
      </div>
    </div>
  );
}

function EventBlock({ icon: Icon, title, subtitle, enabled, onToggle, children }: {
  icon: LucideIcon; title: string; subtitle: string;
  enabled: boolean; onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/60 border border-white/60 p-3 mb-3 last:mb-0">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-white grid place-items-center text-ink-600 flex-shrink-0"><Icon className="size-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-ink-800">{title}</div>
          <div className="text-xs text-ink-500">{subtitle}</div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="pl-12 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, unit, min, max, step }: {
  value: number; onChange: (v: number) => void; unit: string;
  min: number; max: number; step: number;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="size-7 grid place-items-center rounded-full bg-white/80 hover:bg-white text-ink-700"
        type="button"
      >
        −
      </button>
      <span className="font-bold text-ink-800 tabular-nums w-12 text-center">
        {value} {unit}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="size-7 grid place-items-center rounded-full bg-white/80 hover:bg-white text-ink-700"
        type="button"
      >
        +
      </button>
    </div>
  );
}

function DataSection() {
  const load = useStore(s => s.load);
  const authUser = useStore(s => s.authUser);
  const replaceCloud = useStore(s => s.replaceCloud);
  const setSettings = useStore(s => s.setSettings);
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
      // Wenn eingeloggt: Cloud-Stand komplett mit Import-Stand überschreiben,
      // damit das auf allen Geräten ankommt.
      if (authUser) {
        setImportStatus({ kind: 'ok', msg: msg + '\n\nSynchronisiere in die Cloud …' });
        await replaceCloud();
        msg += '\n\nIn die Cloud gepusht – andere Geräte ziehen automatisch nach.';
      }
      setImportStatus({ kind: 'ok', msg });
    } catch (err) {
      setImportStatus({ kind: 'err', msg: 'Fehler: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      e.target.value = '';
    }
  }

  async function loadDemo() {
    if (!confirm('Demodaten laden? Das aktuelle Schuljahr wird überschrieben – andere Schuljahre bleiben erhalten.')) return;
    await installDemo();
    await load();
    // Wenn eingeloggt: Cloud-Stand komplett mit Demo überschreiben.
    if (authUser) await replaceCloud();
  }

  async function loadOberstufeDemo() {
    if (!confirm('Oberstufe-Demodaten laden? Das aktuelle Schuljahr wird überschrieben – andere Schuljahre bleiben erhalten.')) return;
    await installOberstufeDemo();
    await load();
    if (authUser) await replaceCloud();
  }

  async function reset() {
    if (!confirm('Wirklich ALLE Daten zurücksetzen? Das kann nicht rückgängig gemacht werden.')) return;
    await resetAll();
    location.reload();
  }

  async function restartOnboarding() {
    if (!confirm('Onboarding erneut starten? Deine Daten (Fächer, Noten, Stundenplan) bleiben erhalten.')) return;
    await setSettings({ onboarded: false });
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
      <CalendarSubscriptionCard kind="schedule" />
      <CalendarSubscriptionCard kind="exams" />
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
        <Row label="Demodaten" hint="Lädt fertige Beispieldaten ins aktuelle Schuljahr (andere Jahre bleiben erhalten).">
          <div className="flex gap-2">
            <button onClick={loadDemo} className="btn-ghost"><Wand2 className="size-4" />Schule</button>
            <button onClick={loadOberstufeDemo} className="btn-ghost"><GraduationCap className="size-4" />Oberstufe</button>
          </div>
        </Row>
        <Row label="Speicherplatz">
          <button onClick={checkStorage} className="btn-ghost text-xs"><Database className="size-4" />Prüfen</button>
          {storageInfo && <span className="text-xs text-ink-600">{storageInfo}</span>}
        </Row>
        <Row label="Onboarding erneut starten" hint="Zeigt den Einrichtungs-Assistenten noch einmal. Deine Daten bleiben erhalten.">
          <button onClick={restartOnboarding} className="btn-ghost"><RefreshCw className="size-4" />Neu starten</button>
        </Row>
        <Row label="Alles zurücksetzen" hint="Löscht ALLE lokalen Daten unwiderruflich.">
          <button onClick={reset} className="btn-soft text-rose-600"><Trash2 className="size-4" />Zurücksetzen</button>
        </Row>
      </Card>
    </div>
  );
}

function AboutSection() {
  const FEATURES: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; desc: string }> = [
    { icon: GraduationCap, label: 'Notensystem', desc: 'Bayern (1–6) mit eigenen Leistungsnachweis-Kategorien' },
    { icon: Calendar, label: 'Schuljahre & Stundenplan', desc: 'Mehrere Schuljahre parallel, Fächer/Stunden pro Jahr getrennt' },
    { icon: Cloud, label: 'Cloud-Sync & Realtime', desc: 'Automatischer Live-Sync zwischen all deinen Geräten' },
    { icon: Smartphone, label: 'PWA & Offline', desc: 'Funktioniert offline, installierbar auf iPad/iPhone/Android' },
    { icon: Share2, label: 'Stundenplan teilen', desc: '4-stelliger Code für Freunde aus deiner Klasse' },
    { icon: CalendarRange, label: 'Kalender-Abo', desc: 'Live-Sync in Google Calendar / Apple Kalender / Outlook' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-4">
          <div className="size-14 rounded-2xl theme-gradient grid place-items-center text-white shadow-glow flex-shrink-0">
            <GraduationCap className="size-7" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-extrabold text-2xl text-ink-900 leading-tight">Schulplaner</h3>
            <p className="text-sm text-ink-600 mt-1">
              Dein persönliches Schul-Tool für Noten, Aufgaben und Stundenplan – schön übersichtlich,
              ohne Werbung, ohne Schnickschnack.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-ink-500">
              <span className="chip">v1.0</span>
              <span className="chip">React 19 + TypeScript</span>
              <span className="chip">Supabase</span>
              <span className="chip">PWA</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Sparkles className="size-5 text-theme" />Was die App kann</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-2xl bg-white/70 border border-white/60 p-3 flex items-start gap-3">
                <div className="size-9 rounded-xl bg-theme-soft text-theme-deep grid place-items-center flex-shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-ink-800">{f.label}</div>
                  <div className="text-xs text-ink-500 mt-0.5 leading-relaxed">{f.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Info className="size-5 text-slate-500" />Rechtliches & Quellcode</h3>
        <div className="flex flex-wrap gap-2">
          <a href="https://github.com/Bubi9543/Schulplaner" target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex">
            <ExternalLink className="size-4" />Quellcode (GitHub)
          </a>
          <a href="/impressum" className="btn-ghost inline-flex">
            <Info className="size-4" />Impressum
          </a>
          <a href="/datenschutz" className="btn-ghost inline-flex">
            <Info className="size-4" />Datenschutz
          </a>
        </div>
        <div className="text-[11px] text-ink-400 mt-3 leading-relaxed">
          Daten liegen auf deinem Gerät (IndexedDB) und – wenn du eingeloggt bist – verschlüsselt
          bei Supabase in der EU. Keine Tracker, kein Werbe-Sharing.
        </div>
      </Card>
    </div>
  );
}

/* ─── Feedback ─────────────────────────────────────────────────────── */

type FeedbackType = 'bug' | 'idee' | 'sonstiges';

function FeedbackSection() {
  const settings = useStore(s => s.settings);
  const [type, setType] = useState<FeedbackType>('idee');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (!supabase) { setError('Cloud-Sync ist nicht eingerichtet.'); return; }

    setBusy(true);
    setError(null);
    try {
      const { error: dbErr } = await supabase.from('feedback').insert({
        type,
        title: title.trim(),
        description: desc.trim() || null,
        email: email.trim() || null,
        name: settings?.name || null,
        school: settings?.school || null,
      });
      if (dbErr) throw new Error(dbErr.message);
      setSent(true);
      setTitle('');
      setDesc('');
      setEmail('');
    } catch (err) {
      setError('Konnte nicht gesendet werden. Versuch es später nochmal.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <div className="text-center py-8 space-y-3">
          <div className="size-14 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center mx-auto">
            <Check className="size-7" />
          </div>
          <h3 className="font-display font-bold text-xl text-ink-900">Danke für dein Feedback!</h3>
          <p className="text-sm text-ink-500">Deine Nachricht ist angekommen. Wir schauen uns das an.</p>
          <button className="btn-ghost mt-2" onClick={() => setSent(false)}>
            <MessageSquare className="size-4" />Noch etwas senden
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="h3 mb-1 flex items-center gap-2">
          <MessageSquare className="size-5 text-theme" />Feedback & Bug-Reports
        </h3>
        <p className="text-sm text-ink-500 mb-4">
          Hast du eine Idee, einen Bug gefunden oder Verbesserungsvorschläge? Schreib es hier rein — geht direkt an den Entwickler.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label mb-1.5">Typ</label>
            <div className="flex gap-2">
              {([['bug', 'Bug'], ['idee', 'Idee'], ['sonstiges', 'Sonstiges']] as const).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setType(val)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${type === val ? 'bg-theme-soft text-theme-deep ring-1 ring-theme/30' : 'bg-white/70 text-ink-600 hover:bg-white'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label mb-1.5" htmlFor="fb-title">Titel *</label>
            <input id="fb-title" type="text" className="input" placeholder={type === 'bug' ? 'Was funktioniert nicht?' : 'Worum geht es?'}
              value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />
          </div>

          <div>
            <label className="label mb-1.5" htmlFor="fb-desc">Beschreibung</label>
            <textarea id="fb-desc" className="input min-h-[100px] resize-y" placeholder="Beschreib das Problem oder die Idee genauer…"
              value={desc} onChange={e => setDesc(e.target.value)} maxLength={2000} />
          </div>

          <div>
            <label className="label mb-1.5" htmlFor="fb-email">Email (optional)</label>
            <input id="fb-email" type="email" className="input" placeholder="Falls wir nachfragen sollen"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="size-4 flex-shrink-0" />{error}
            </div>
          )}

          <button type="submit" disabled={busy || !title.trim()} className="btn-primary w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Feedback absenden
          </button>
        </form>
      </Card>
    </div>
  );
}

/* ─── Apple-Shortcut ────────────────────────────────────────────────── */

function ShortcutSection() {
  const [authUser, setAuthUser] = useState<{ id: string } | null>(null);
  const [token, setToken] = useState<import('@/lib/shortcutToken').ShortcutToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user ? { id: data.user.id } : null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUser(session?.user ? { id: session.user.id } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) { setToken(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    import('@/lib/shortcutToken').then(async (mod) => {
      try {
        const t = await mod.getActiveShortcutToken();
        if (!cancelled) setToken(t);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [authUser]);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const mod = await import('@/lib/shortcutToken');
      const t = await mod.createShortcutToken('Apple Shortcut');
      setToken(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Shortcut-Token zurückziehen? Dein Apple Shortcut funktioniert dann nicht mehr.')) return;
    setBusy(true); setError(null);
    try {
      const mod = await import('@/lib/shortcutToken');
      await mod.revokeShortcutTokens();
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }

  if (!supabase) {
    return (
      <Card>
        <h3 className="h3 mb-2 flex items-center gap-2"><Zap className="size-5 text-theme" />Apple Shortcut</h3>
        <p className="text-sm text-ink-500">Cloud-Sync ist nicht eingerichtet – Shortcut-Zugriff geht nur mit aktiviertem Cloud-Account.</p>
      </Card>
    );
  }

  if (!authUser) {
    return (
      <Card>
        <h3 className="h3 mb-2 flex items-center gap-2"><Zap className="size-5 text-theme" />Apple Shortcut</h3>
        <p className="text-sm text-ink-500">Logge dich erst unter „Daten & Sync" ein – der Shortcut braucht einen Cloud-Account, damit angelegte Aufgaben auf all deinen Geräten landen.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="h3 mb-1 flex items-center gap-2">
        <Zap className="size-5 text-theme" />
        Apple Shortcut
      </h3>
      <p className="subtle mb-3">
        Lege Aufgaben mit einem Tap auf deinem iPhone, iPad oder Mac an – ohne die App zu öffnen.
        Der Shortcut zeigt deine echten Fächer zur Auswahl, fragt Titel und Fälligkeit ab und
        speichert die Aufgabe direkt in deinem Account.
      </p>

      {loading ? (
        <div className="rounded-2xl bg-white/60 p-6 grid place-items-center">
          <Loader2 className="size-5 text-theme animate-spin" />
        </div>
      ) : token ? (
        <ShortcutTokenView
          token={token}
          onRevoke={revoke}
          onRegenerate={generate}
          busy={busy}
          copied={copied}
          onCopy={copy}
        />
      ) : (
        <div className="space-y-3">
          <button onClick={generate} disabled={busy} className="btn-primary w-full">
            {busy ? <><Loader2 className="size-4 animate-spin" />Erstelle …</> : <><KeyRound className="size-4" />Shortcut-Token erstellen</>}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </Card>
  );
}

function ShortcutTokenView({
  token,
  onRevoke,
  onRegenerate,
  busy,
  copied,
  onCopy,
}: {
  token: import('@/lib/shortcutToken').ShortcutToken;
  onRevoke: () => void;
  onRegenerate: () => void;
  busy: boolean;
  copied: string | null;
  onCopy: (v: string, k: string) => void;
}) {
  const [urls, setUrls] = useState<{ subjects: string; subjectNames: string; task: string; ping: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/shortcutToken').then((mod) => {
      if (cancelled) return;
      setUrls({
        subjects: mod.buildSubjectsUrl(token.token),
        subjectNames: mod.buildSubjectNamesUrl(token.token),
        task: mod.buildTaskUrl(token.token),
        ping: mod.buildPingUrl(token.token),
      });
    });
    return () => { cancelled = true; };
  }, [token.token]);

  if (!urls) return <div className="rounded-2xl bg-white/60 p-6 grid place-items-center"><Loader2 className="size-5 text-theme animate-spin" /></div>;

  const last = token.lastUsedAt
    ? new Date(token.lastUsedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'noch nie benutzt';

  return (
    <div className="space-y-4">
      {/* Dein Token */}
      <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">Dein Token</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-xs bg-white/70 rounded-xl px-2 py-1.5 truncate font-mono text-ink-800">{token.token}</code>
          <button onClick={() => onCopy(token.token, 'token')} className="btn-ghost py-1 px-2 text-xs">
            {copied === 'token' ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            {copied === 'token' ? 'Kopiert' : 'Kopieren'}
          </button>
        </div>
        <div className="text-[11px] text-ink-500 mt-1.5">Zuletzt genutzt: {last}</div>
      </div>

      {/* Installations-Anleitung */}
      <ShortcutGuide token={token.token} onCopy={onCopy} copied={copied} />

      {/* Shortcut → Hausaufgaben teilen */}
      <ShortcutShareRow />

      {/* URLs für Power-User / falls jemand den Shortcut selbst nachbauen will */}
      <details className="text-[11px] text-ink-500">
        <summary className="cursor-pointer font-semibold hover:text-ink-700">Roh-Endpoints (für Shortcut-Bau)</summary>
        <div className="space-y-2 mt-2">
          <UrlRow label="GET — Fächernamen (JSON-Array, direkt für die Listen-Auswahl)" url={urls.subjectNames} k="subject-names" copied={copied} onCopy={onCopy} />
          <UrlRow label="POST — Aufgabe anlegen (JSON-Body mit subjectName)" url={urls.task} k="task" copied={copied} onCopy={onCopy} />
          <UrlRow label="GET — Fächer mit IDs (Full-JSON, falls du Power-Tools baust)" url={urls.subjects} k="subjects-json" copied={copied} onCopy={onCopy} />
        </div>
      </details>

      <div className="flex gap-2">
        <button onClick={onRegenerate} disabled={busy} className="btn-ghost flex-1 text-xs">
          <RefreshCw className="size-3.5" />Neuen Token erstellen
        </button>
        <button onClick={onRevoke} disabled={busy} className="btn-soft flex-1 text-xs text-rose-600">
          <Trash2 className="size-3.5" />Zurückziehen
        </button>
      </div>
    </div>
  );
}

function UrlRow({ label, url, k, copied, onCopy }: { label: string; url: string; k: string; copied: string | null; onCopy: (v: string, k: string) => void }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/60 p-3">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-[11px] bg-white/70 rounded-xl px-2 py-1.5 truncate font-mono text-ink-800">{url}</code>
        <button onClick={() => onCopy(url, k)} className="btn-ghost py-1 px-2 text-xs">
          {copied === k ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          {copied === k ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
    </div>
  );
}

function ShortcutShareRow() {
  const settings = useStore(s => s.settings)!;
  const setSettings = useStore(s => s.setSettings);
  return (
    <Row label="Hausaufgaben automatisch teilen"
      hint="Via Shortcut erstellte Hausaufgaben werden beim nächsten Sync mit Mitschülern geteilt (wenn Freunde-Abos aktiv sind).">
      <Toggle
        checked={settings.homeworkShareViaShortcut}
        onChange={v => setSettings({ homeworkShareViaShortcut: v })}
      />
    </Row>
  );
}

function ShortcutGuide({ token, onCopy, copied }: { token: string; onCopy: (v: string, k: string) => void; copied: string | null }) {
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  useEffect(() => {
    import('@/lib/shortcutToken').then(mod => setInstallUrl(mod.SHORTCUT_ICLOUD_URL));
  }, []);

  if (!installUrl) {
    // Shortcut existiert noch nicht – Hinweis statt Anleitung.
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 leading-relaxed">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="size-4 flex-shrink-0" />
          <strong className="text-sm">Shortcut wird vorbereitet</strong>
        </div>
        Der fertige Apple Shortcut zum 1-Klick-Installieren ist noch nicht hinterlegt. Sobald der Entwickler
        ihn auf einem iPhone/iPad gebaut und den iCloud-Link eingetragen hat, erscheint hier ein
        „Installieren"-Button. Bis dahin kannst du den Token oben bereits erstellen und sichern – er bleibt
        gültig.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-theme-soft/30 border border-theme-soft p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-theme" />
        <strong className="text-sm text-ink-800">Shortcut auf dein iPhone/iPad holen</strong>
      </div>

      <ol className="text-xs text-ink-700 leading-relaxed space-y-2 list-decimal list-inside">
        <li><strong>Token kopieren</strong> (Button oben unter „Dein Token"). Du brauchst ihn gleich genau einmal.</li>
        <li><strong>„Shortcut installieren"</strong> tippen → iOS fragt: „Shortcut hinzufügen?" → bestätigen.</li>
        <li>Beim ersten Start fragt der Shortcut: „Schulplaner-Token einfügen". Token einsetzen → fertig.</li>
        <li>Shortcut zu Home-Bildschirm oder Widget hinzufügen — und Aufgaben künftig per Tap anlegen.</li>
      </ol>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <button onClick={() => onCopy(token, 'token-cta')} className="btn-ghost justify-center">
          {copied === 'token-cta' ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
          Token kopieren
        </button>
        <a href={installUrl} target="_blank" rel="noopener noreferrer" className="btn-primary justify-center">
          <ExternalLink className="size-4" />Shortcut installieren
        </a>
      </div>

      <div className="text-[11px] text-ink-500 leading-relaxed border-t border-white/60 pt-2">
        Tipp: Der Token ist dein Schlüssel — wer ihn hat, kann Aufgaben in deinem Account anlegen.
        Falls dir ein iPad abhanden kommt: oben „Zurückziehen" — der alte Token ist sofort tot.
      </div>
    </div>
  );
}
