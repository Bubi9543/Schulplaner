/**
 * dialogParts.tsx — gemeinsame Bausteine für die neugestalteten Dialoge
 * (Neue Aufgabe, Note hinzufügen, Detail-Ansichten).
 *
 * Reine Präsentations-Komponenten; nutzen die Domänen-Helfer der App
 * (currentLesson, grading, SubjectIcon). Speichern passiert weiterhin in den
 * jeweiligen Dialog-Containern.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { X, Pencil, Trash2, Calendar, Repeat, type LucideIcon } from 'lucide-react';
import type { Lesson, Subject, SchoolHoliday } from '@/types';
import type { SystemMeta } from '@/lib/grading';
import { gradeColor } from '@/lib/grading';
import { getCurrentLesson } from '@/lib/currentLesson';
import { isHoliday } from '@/lib/holidays';
import { useUpcomingHolidays } from '@/lib/useHolidays';
import { SubjectIcon } from '@/components/SubjectIcon';

/* ── kleine Helfer ─────────────────────────────────────────────────────── */
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Lokales ISO-Datum (YYYY-MM-DD) ohne Zeitzonen-Drift. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Datum relativ zu heute (n Tage), auf Mitternacht normiert. */
export function dayFromToday(n: number): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d;
}
/** Relative Tagesdifferenz eines ISO-Datums zu heute. */
export function relDaysFromIso(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00'); const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}
export function relText(n: number | null): string {
  if (n === null) return '';
  if (n === 0) return 'heute'; if (n === 1) return 'morgen'; if (n === -1) return 'gestern';
  return n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
}
function hexA(hex: string, a: number): string {
  return hex + Math.round(a * 255).toString(16).padStart(2, '0');
}

/**
 * Nächste `count` Termine eines Fachs laut Stundenplan, ab morgen.
 * Nutzt die wochentagbasierten Lessons der App (mehrere Stunden pro Tag
 * werden zu einem Tagestermin zusammengefasst).
 *
 * Ferientage werden übersprungen – an einem Ferientag findet kein Unterricht
 * statt, also ist das nicht die „nächste Stunde". Ohne geladene Ferien
 * (leeres Array) verhält sich die Funktion wie zuvor.
 */
export function nextLessonsForSubject(lessons: Lesson[], subjectId: string, count = 2, holidays: SchoolHoliday[] = []): Date[] {
  const weekdays = new Set(lessons.filter(l => l.subjectId === subjectId).map(l => l.weekday));
  if (!weekdays.size) return [];
  const out: Date[] = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  // Bis zu ~1 Jahr vorausschauen, damit auch lange Ferien (z. B. Sommer)
  // übersprungen werden können, ohne dass die Liste leer bleibt.
  for (let i = 1; i <= 400 && out.length < count; i++) {
    d.setDate(d.getDate() + 1);
    if (!weekdays.has(d.getDay() as Lesson['weekday'])) continue;
    if (holidays.length && isHoliday(d, holidays)) continue;
    out.push(new Date(d));
  }
  return out;
}

/* ── DialogShell: responsives Modal (Desktop) / Bottom-Sheet (Handy) ────── */
interface ShellProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  title?: string;
  /** Voll-Bleed-Header (z. B. farbige Vorschau) statt Eyebrow/Titel. */
  headerBand?: ReactNode;
  footer?: ReactNode;
  /** Responsive max-width-Klasse, z. B. "md:max-w-xl". */
  maxWidth?: string;
  children: ReactNode;
}

export function DialogShell({ open, onClose, eyebrow, eyebrowIcon: EyebrowIcon, title, headerBand, footer, maxWidth = 'md:max-w-lg', children }: ShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className={`relative w-full ${maxWidth} max-h-[94vh] md:max-h-[86vh] glass-strong rounded-t-3xl md:rounded-3xl shadow-soft overflow-hidden flex flex-col`}
            initial={{ y: 40, scale: .98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: .98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            {/* Griff (nur Handy) */}
            <div className="md:hidden flex justify-center pt-2.5 shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-ink-300" />
            </div>

            {headerBand}

            {(title || eyebrow) && (
              <div className="flex items-start justify-between gap-3 px-5 pt-3 md:pt-5 shrink-0">
                <div className="min-w-0">
                  {eyebrow && (
                    <div className="eyebrow flex items-center gap-1.5 mb-1 whitespace-nowrap">
                      {EyebrowIcon && <EyebrowIcon className="size-3.5" strokeWidth={2.4} />}{eyebrow}
                    </div>
                  )}
                  {title && <h2 className="h2">{title}</h2>}
                </div>
                <button onClick={onClose} className="iconbtn ghost -mr-1 -mt-0.5 shrink-0" style={{ color: 'rgb(var(--ink-500))' }} title="Schließen">
                  <X className="size-5" />
                </button>
              </div>
            )}

            <div className="dlg-scroll px-5 pt-4 pb-2 flex flex-col gap-4 overflow-y-auto flex-1">
              {children}
            </div>

            {footer && (
              <div className="flex items-center justify-end gap-2.5 px-5 py-4 shrink-0 border-t"
                style={{ borderColor: 'rgb(var(--surface-border-rgb) / 0.55)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Field (Label + Hint) ──────────────────────────────────────────────── */
export function Field({ label, hint, icon: Icon, children }: { label?: string; hint?: ReactNode; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div>
      {label && (
        <label className="label flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5" strokeWidth={2.2} />}{label}
        </label>
      )}
      {children}
      {hint && <div className="subtle mt-1.5 text-xs">{hint}</div>}
    </div>
  );
}

/* ── MetaTile ──────────────────────────────────────────────────────────── */
export function MetaTile({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="meta-tile">
      <div className="mt-label"><Icon className="size-3.5" strokeWidth={2.2} />{label}</div>
      <div className="mt-value">{children}</div>
    </div>
  );
}

/* ── SegmentedControl (animierter Thumb) ───────────────────────────────── */
export interface SegOption { value: string | number; label?: string; icon?: LucideIcon; }
export function SegmentedControl({ options, value, onChange, tinted = false, thumbColor }: {
  options: SegOption[]; value: string | number; onChange: (v: never) => void; tinted?: boolean; thumbColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false });
  const found = options.findIndex(o => o.value === value);
  const hasActive = found >= 0;
  const idx = Math.max(0, found);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const recalc = () => {
      const btns = el.querySelectorAll<HTMLButtonElement>('.seg-btn');
      const b = btns[idx]; if (!b) return;
      setThumb({ left: b.offsetLeft, width: b.offsetWidth, ready: true });
    };
    recalc();
    const ro = new ResizeObserver(recalc); ro.observe(el);
    return () => ro.disconnect();
  }, [idx, options.length]);
  return (
    <div className="seg" ref={ref}>
      <div className={'seg-thumb' + (tinted && !thumbColor ? ' tinted' : '')}
        style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width, opacity: thumb.ready && hasActive ? 1 : 0,
          ...(thumbColor ? { background: thumbColor, boxShadow: `0 6px 18px -6px ${thumbColor}` } : {}) }} />
      {options.map(o => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button key={String(o.value)} type="button"
            className={'seg-btn' + (active ? ' is-active' : '') + ((tinted || thumbColor) && active ? ' on-tint' : '')}
            onClick={() => onChange(o.value as never)}>
            {Icon && <Icon className="size-4" strokeWidth={2.2} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── PriorityPicker ────────────────────────────────────────────────────── */
export const PRIO_COLOR: Record<1 | 2 | 3, string> = { 1: '#10b981', 2: '#f59e0b', 3: '#ef4444' };
export const PRIO_LABEL: Record<1 | 2 | 3, string> = { 1: 'Niedrig', 2: 'Normal', 3: 'Hoch' };
export function PriorityPicker({ value, onChange }: { value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <SegmentedControl
      options={[{ value: 1, label: 'Niedrig' }, { value: 2, label: 'Normal' }, { value: 3, label: 'Hoch' }]}
      value={value} onChange={(v) => onChange(v as 1 | 2 | 3)} thumbColor={PRIO_COLOR[value]} />
  );
}

/* ── Toggle ────────────────────────────────────────────────────────────── */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} aria-pressed={on}>
      <span className="switch-knob" />
    </button>
  );
}

/* ── KindChips (Aufgaben- / Notenarten) ────────────────────────────────── */
export interface KindChipItem { id: string; label: string; icon?: LucideIcon; note?: string; }
export function KindChips({ items, value, onChange }: { items: KindChipItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(k => {
        const active = value === k.id; const Icon = k.icon;
        return (
          <button key={k.id} type="button" onClick={() => onChange(k.id)} className={'dlg-chip' + (active ? ' is-active' : '')}>
            {Icon && <Icon className="size-4" strokeWidth={2.2} />}{k.label}
            {k.note && <span className="opacity-60 text-[10px] font-bold ml-0.5">{k.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── SubjectChips (mit JETZT-Badge der laufenden Stunde) ───────────────── */
export function SubjectChips({ subjects, value, onChange, lessons, now, allowNone = false, wrap = true }: {
  subjects: Subject[]; value: string; onChange: (id: string) => void; lessons: Lesson[]; now: Date; allowNone?: boolean; wrap?: boolean;
}) {
  const current = getCurrentLesson(lessons, subjects, now);
  const currentId = current?.subject.id;
  return (
    <div className={wrap ? 'flex flex-wrap gap-2.5' : 'flex gap-2.5 overflow-x-auto pb-1.5 -mx-0.5 mask-fade-r'}>
      {allowNone && (
        <button type="button" className={'dlg-chip shrink-0' + (!value ? ' is-active' : '')} onClick={() => onChange('')}>Kein Fach</button>
      )}
      {subjects.map(s => {
        const active = value === s.id;
        const isNow = s.id === currentId;
        return (
          <button key={s.id} type="button" onClick={() => onChange(s.id)} className="dlg-chip shrink-0"
            style={active
              ? { background: s.color, color: '#fff', borderColor: s.color, boxShadow: `0 7px 20px -7px ${s.color}` }
              : isNow ? { borderColor: s.color, color: s.color } : undefined}>
            <span style={{ color: active ? '#fff' : s.color, display: 'inline-flex' }}>
              <SubjectIcon subject={s} className="size-[18px]" strokeWidth={2.2} />
            </span>
            {s.name}
            {isNow && (
              <span className="inline-flex items-center gap-1 ml-0.5 px-1.5 py-0.5 rounded-full text-[10.5px] font-extrabold tracking-wide"
                style={{ background: active ? 'rgba(255,255,255,.25)' : hexA(s.color, .13), color: active ? '#fff' : s.color }}>
                <span className="now-pulse" style={{ width: 5, height: 5, borderRadius: 999, background: active ? '#fff' : s.color }} />JETZT
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── LessonDateChips (Heute/Morgen + nächste Stunden des Fachs) ─────────── */
export function LessonDateChips({ subjectId, lessons, value, onChange }: {
  subjectId: string; lessons: Lesson[]; value: string; onChange: (iso: string) => void;
}) {
  const holidays = useUpcomingHolidays();
  const lessonDates = subjectId ? nextLessonsForSubject(lessons, subjectId, 2, holidays) : [];
  const list: Array<{ label: string; d: Date; sub?: string; lesson?: boolean }> = [
    { label: 'Heute', d: dayFromToday(0) },
    { label: 'Morgen', d: dayFromToday(1) },
  ];
  if (lessonDates[0]) list.push({ label: 'Nächste Stunde', d: lessonDates[0], sub: `${WD[lessonDates[0].getDay()]} ${lessonDates[0].getDate()}.${lessonDates[0].getMonth() + 1}.`, lesson: true });
  if (lessonDates[1]) list.push({ label: 'Übernächste', d: lessonDates[1], sub: `${WD[lessonDates[1].getDay()]} ${lessonDates[1].getDate()}.${lessonDates[1].getMonth() + 1}.`, lesson: true });
  return (
    <div className="flex flex-wrap gap-2.5">
      {list.map((p, i) => {
        const v = isoDate(p.d); const active = value === v;
        return (
          <button key={i} type="button" onClick={() => onChange(active ? '' : v)} className={'dlg-chip' + (active ? ' is-active' : '')}>
            {p.lesson ? <Repeat className="size-4" strokeWidth={2.2} /> : <Calendar className="size-4" strokeWidth={2.2} />}
            <span className="flex flex-col items-start leading-tight">
              <span>{p.label}</span>
              {p.sub && <span className="text-[11px] font-semibold" style={{ opacity: active ? .85 : .7 }}>{p.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── GradePad ──────────────────────────────────────────────────────────── */
export function GradePad({ meta, value, onChange, system, config }: {
  meta: SystemMeta; value: number; onChange: (v: number) => void; system: Subject['system']; config?: Parameters<typeof gradeColor>[2];
}) {
  const opts = meta.valueOptions;
  // Spaltenzahl: 6 für Bayern/kleine Skalen, sonst 4 (z. B. Oberstufe 0–15).
  const cols = opts.length <= 6 ? opts.length : opts.length <= 12 ? 4 : opts.length <= 16 ? 4 : 5;
  if (opts.length > 24) {
    // Sehr große Skalen: Slider beibehalten.
    return (
      <div>
        <input type="range" min={meta.min} max={meta.max} step={meta.step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-theme" />
        <div className="flex justify-between text-xs text-ink-400 mt-1">
          <span>{meta.formatValue(meta.min)}</span><span>{meta.formatValue(meta.max)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="gradepad" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {opts.map(v => {
        const active = value === v; const col = gradeColor(v, system, config);
        return (
          <button key={v} type="button" className={'gradepad-btn' + (active ? ' is-active' : '')}
            style={active ? { background: col, boxShadow: `0 10px 24px -8px ${col}` } : undefined}
            onClick={() => onChange(v)}>
            {meta.formatValue(v).replace(' P', '')}
          </button>
        );
      })}
    </div>
  );
}

/* ── HeaderActions (Edit/Delete/Close) ─────────────────────────────────── */
function HeaderActions({ onEdit, onDelete, onClose }: { onEdit?: () => void; onDelete?: () => void; onClose: () => void }) {
  return (
    <div className="flex gap-1">
      {onEdit && <button type="button" className="iconbtn ghost" onClick={onEdit} title="Bearbeiten"><Pencil className="size-[17px]" /></button>}
      {onDelete && <button type="button" className="iconbtn ghost danger" onClick={onDelete} title="Löschen"><Trash2 className="size-[17px]" /></button>}
      <button type="button" className="iconbtn ghost" onClick={onClose} title="Schließen"><X className="size-[18px]" /></button>
    </div>
  );
}

/* ── DetailHeader (heller Aufgaben-Header) ─────────────────────────────── */
export function DetailHeader({ kindLabel, kindIcon: KindIcon, subject, title, status, done, onEdit, onDelete, onClose }: {
  kindLabel: string; kindIcon: LucideIcon; subject?: Subject; title: string;
  status?: { icon: LucideIcon; label: string; color: string }; done?: boolean;
  onEdit?: () => void; onDelete?: () => void; onClose: () => void;
}) {
  const color = subject?.color ?? '#6366f1';
  const StatusIcon = status?.icon;
  return (
    <div className="relative px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: 'rgb(var(--surface-border-rgb) / 0.55)' }}>
      <div className="absolute top-3.5 right-3.5" style={{ color: 'rgb(var(--ink-500))' }}>
        <HeaderActions onEdit={onEdit} onDelete={onDelete} onClose={onClose} />
      </div>
      <div className="flex gap-3.5 items-start pr-28">
        <div className="grid place-items-center shrink-0" style={{ width: 48, height: 48, borderRadius: 15, background: hexA(color, .14), color }}>
          <KindIcon className="size-[23px]" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="eyebrow">{kindLabel}</span>
            {status && StatusIcon && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold whitespace-nowrap"
                style={{ background: hexA(status.color, .16), color: status.color }}>
                <StatusIcon className="size-[11px]" strokeWidth={2.6} />{status.label}
              </span>
            )}
          </div>
          <h2 className="font-display font-extrabold mt-1.5 leading-tight"
            style={{ fontSize: 23, letterSpacing: '-.02em', color: 'rgb(var(--ink-900))', textDecoration: done ? 'line-through' : 'none', opacity: done ? .6 : 1 }}>
            {title}
          </h2>
        </div>
      </div>
      {subject && (
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold"
          style={{ background: hexA(color, .12), color }}>
          <SubjectIcon subject={subject} className="size-[15px]" strokeWidth={2.3} />{subject.name}
        </div>
      )}
    </div>
  );
}

/* ── GradeHeader (helle Note im farbigen Ring) ─────────────────────────── */
export function GradeHeader({ gradeText, color, kindLabel, subject, title, onEdit, onDelete, onClose }: {
  gradeText: string; color: string; kindLabel: string; subject: Subject; title?: string;
  onEdit?: () => void; onDelete?: () => void; onClose: () => void;
}) {
  return (
    <div className="relative px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: 'rgb(var(--surface-border-rgb) / 0.55)' }}>
      <div className="absolute top-3.5 right-3.5" style={{ color: 'rgb(var(--ink-500))' }}>
        <HeaderActions onEdit={onEdit} onDelete={onDelete} onClose={onClose} />
      </div>
      <div className="flex gap-4 items-center pr-24">
        <div className="grid place-items-center shrink-0" style={{ width: 88, height: 88, borderRadius: 999, border: `3px solid ${color}`, background: hexA(color, .1) }}>
          <span className="font-display font-extrabold leading-none" style={{ fontSize: 42, color }}>{gradeText}</span>
        </div>
        <div className="min-w-0">
          <span className="eyebrow" style={{ color }}>{kindLabel}</span>
          {title && (
            <h2 className="font-display font-extrabold mt-1.5 leading-tight" style={{ fontSize: 21, letterSpacing: '-.02em', color: 'rgb(var(--ink-900))' }}>{title}</h2>
          )}
          <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-bold"
            style={{ background: hexA(subject.color, .12), color: subject.color }}>
            <SubjectIcon subject={subject} className="size-[14px]" strokeWidth={2.3} />{subject.name}
          </div>
        </div>
      </div>
    </div>
  );
}

export { hexA };
