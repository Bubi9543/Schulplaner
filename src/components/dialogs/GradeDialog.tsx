import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Grade, GradeKind } from '@/types';
import { BUILTIN_GRADE_KINDS } from '@/types';
import { getKindLabel, getSystemMeta, gradeColor, isGoodGrade, isLargeAssessmentKind } from '@/lib/grading';
import { hexToRgba } from '@/lib/utils';
import { getActiveSubject, useTimeNow } from '@/lib/currentLesson';
import { useIsHoliday } from '@/lib/useHolidays';
import { Confetti } from '@/components/CountUp';
import { PhotoAttachment } from '@/components/PhotoAttachment';
import { uid } from '@/lib/db';
import { GraduationCap, Tag, Check, Sparkles } from 'lucide-react';
import {
  DialogShell, Field, GradePad, SubjectChips, KindChips, SegmentedControl,
  type KindChipItem, type SegOption,
} from './dialogParts';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Grade>;
  defaultSubjectId?: string;
}

const BUILTIN_KIND_ORDER: GradeKind[] = ['schulaufgabe', 'klausur', 'stegreif', 'muendlich', 'referat', 'projekt', 'sonstige'];
void BUILTIN_GRADE_KINDS;

const WEIGHT_OPTIONS: SegOption[] = [
  { value: 0.5, label: '×½' },
  { value: 1,   label: '×1' },
  { value: 1.5, label: '×1,5' },
  { value: 2,   label: '×2' },
];

function isPreset(v: number): boolean {
  return WEIGHT_OPTIONS.some(p => Math.abs((p.value as number) - v) < 1e-6);
}

export function GradeDialog({ open, onClose, initial, defaultSubjectId }: Props) {
  const subjects = useStore(s => s.subjects);
  const lessons = useStore(s => s.lessons);
  const addGrade = useStore(s => s.addGrade);
  const updateGrade = useStore(s => s.updateGrade);
  const deleteGrade = useStore(s => s.deleteGrade);
  const settings = useStore(s => s.settings);
  const now = useTimeNow(30000);
  const isHolidayToday = useIsHoliday(now);

  const config = settings?.gradingConfig;
  const editing = !!initial?.id;

  const initialSubjectId = (() => {
    if (initial?.subjectId) return initial.subjectId;
    if (defaultSubjectId) return defaultSubjectId;
    if (settings?.autoSelectActiveSubject && !isHolidayToday) {
      const active = getActiveSubject(lessons, subjects, now, settings.activeSubjectThresholdMin);
      if (active) return active.id;
    }
    return subjects[0]?.id ?? '';
  })();

  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [autoChosen, setAutoChosen] = useState<boolean>(!initial?.subjectId && !defaultSubjectId && subjectId !== (subjects[0]?.id ?? ''));
  const subject = subjects.find(s => s.id === subjectId);
  const system = subject?.system ?? settings?.system ?? 'bayern';
  const meta = config ? getSystemMeta(system, config) : null;

  const [value, setValue] = useState<number>(initial?.value ?? meta?.defaultValue ?? 2);
  const [kind, setKind] = useState<GradeKind>(initial?.kind ?? 'schulaufgabe');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState<string>(new Date(initial?.date ?? Date.now()).toISOString().slice(0, 10));
  const [weightMultiplier, setWeightMultiplier] = useState<number>(initial?.weightMultiplier ?? 1);
  const [customWeightInput, setCustomWeightInput] = useState<string>(
    initial?.weightMultiplier && !isPreset(initial.weightMultiplier) ? String(initial.weightMultiplier).replace('.', ',') : ''
  );
  const [isPending, setIsPending] = useState<boolean>(!!initial?.isPending);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const gradeIdRef = useRef<string>(initial?.id ?? uid());

  useEffect(() => {
    if (!open) return;
    const sid = (() => {
      if (initial?.subjectId) return initial.subjectId;
      if (defaultSubjectId) return defaultSubjectId;
      if (settings?.autoSelectActiveSubject && !isHolidayToday) {
        const active = getActiveSubject(lessons, subjects, now, settings.activeSubjectThresholdMin);
        if (active) return active.id;
      }
      return subjects[0]?.id ?? '';
    })();
    const subj = subjects.find(s => s.id === sid);
    const sys = subj?.system ?? settings?.system ?? 'bayern';
    const m = config ? getSystemMeta(sys, config) : null;
    setSubjectId(sid);
    setAutoChosen(!initial?.subjectId && !defaultSubjectId && sid !== (subjects[0]?.id ?? ''));
    setValue(initial?.value ?? m?.defaultValue ?? 2);
    setKind(initial?.kind ?? 'schulaufgabe');
    setTitle(initial?.title ?? '');
    setDate(new Date(initial?.date ?? Date.now()).toISOString().slice(0, 10));
    setWeightMultiplier(initial?.weightMultiplier ?? 1);
    setCustomWeightInput(initial?.weightMultiplier && !isPreset(initial.weightMultiplier) ? String(initial.weightMultiplier).replace('.', ',') : '');
    setIsPending(!!initial?.isPending);
    gradeIdRef.current = initial?.id ?? uid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, defaultSubjectId]);

  if (!subject || !meta || !config) return null;

  async function save() {
    if (!subject) return;
    const payload = {
      id: gradeIdRef.current,
      subjectId,
      value,
      kind,
      title: title.trim() || undefined,
      date: new Date(date).getTime(),
      weight: 1,
      weightMultiplier: weightMultiplier !== 1 ? weightMultiplier : undefined,
      isPending,
    };
    if (editing && initial?.id) {
      await updateGrade(initial.id, payload);
    } else {
      await addGrade(payload);
    }
    if (!isPending && settings?.confettiOnGood && isGoodGrade(value, subject.system)) {
      setConfettiTrigger(Date.now());
      setTimeout(onClose, 250);
    } else {
      onClose();
    }
  }

  async function remove() {
    if (initial?.id) {
      await deleteGrade(initial.id);
      onClose();
    }
  }

  function applyCustomWeight(raw: string) {
    setCustomWeightInput(raw);
    const cleaned = raw.replace(',', '.').trim();
    const parsed = parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) setWeightMultiplier(parsed);
  }

  const color = gradeColor(value, system, config);
  const customActive = !isPreset(weightMultiplier);
  const isLargeKind = isLargeAssessmentKind(kind, config);
  const showCategoryHint = subject.system === 'bayern' && subject.category !== 'nebenfach';

  const kindItems: KindChipItem[] = [
    ...BUILTIN_KIND_ORDER.map(k => ({ id: k, label: getKindLabel(k, config) })),
    ...(config.customKinds ?? []).map(c => ({ id: c.id, label: c.label, note: c.weighting === 'large' ? '· SA' : '· Mdl' })),
  ];

  return (
    <>
      <DialogShell
        open={open} onClose={onClose} maxWidth="md:max-w-xl"
        eyebrow="Note" eyebrowIcon={GraduationCap} title={editing ? 'Note bearbeiten' : 'Note hinzufügen'}
        footer={
          <>
            {editing && <button onClick={remove} className="btn-danger-soft mr-auto">Löschen</button>}
            <button onClick={onClose} className="btn-ghost">Abbrechen</button>
            <button onClick={save} className="btn-primary"><Check className="size-4" />Speichern</button>
          </>
        }
      >
        <Field label="Fach">
          <SubjectChips subjects={subjects} value={subjectId} onChange={(id) => { setSubjectId(id); setAutoChosen(false); }} lessons={lessons} now={now} />
          {autoChosen && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-theme-deep">
              <Sparkles className="size-3.5" /><span>Vorausgewählt: aktuelle Stunde ({subject.name})</span>
            </div>
          )}
        </Field>

        {/* Farbige Live-Vorschau */}
        <div className="rounded-3xl px-5 py-4 text-center text-white overflow-hidden"
          style={{ background: isPending ? 'linear-gradient(135deg, #64748b, #475569)' : `linear-gradient(135deg, ${color}, ${hexToRgba(color, .8)})`, transition: 'background .3s' }}>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.9)' }}>{isPending ? 'Geplant' : getKindLabel(kind, config)}</div>
          <div className="font-display font-extrabold leading-none mt-1" style={{ fontSize: 56 }}>{isPending ? '?' : meta.formatValue(value)}</div>
          <div className="text-[13px] mt-1" style={{ opacity: .9 }}>{subject.name}</div>
        </div>

        {!isPending && (
          <Field label="Wert">
            <GradePad meta={meta} value={value} onChange={setValue} system={system} config={config} />
          </Field>
        )}

        <Field label="Art" icon={Tag} hint={showCategoryHint
          ? (isLargeKind
            ? `Diese Note zählt ${subject.category === 'hauptfach' ? 'doppelt' : '1:1'} mit dem Rest (Schulaufgaben-Block).`
            : 'Wird zum Schnitt der kleinen Leistungen verrechnet.')
          : undefined}>
          <KindChips items={kindItems} value={kind} onChange={setKind} />
        </Field>

        {!isPending && (
          <Field label="Gewichtung dieser Note" hint="Wirkt innerhalb der Gruppe (Schulaufgaben oder Rest). ×2 bedeutet, diese Note zählt doppelt.">
            <SegmentedControl options={WEIGHT_OPTIONS} value={customActive ? '' : weightMultiplier} tinted
              onChange={(v) => { setWeightMultiplier(v as number); setCustomWeightInput(''); }} />
            <div className="flex items-center gap-2 mt-2">
              <input type="text" inputMode="decimal" placeholder="Custom (z. B. 0,75)"
                className="input" style={customActive ? { borderColor: 'rgb(var(--theme-primary-rgb) / 0.5)' } : undefined}
                value={customWeightInput} onChange={e => applyCustomWeight(e.target.value)} />
              <span className="text-xs text-ink-500 whitespace-nowrap">aktuell ×{weightMultiplier.toString().replace('.', ',')}</span>
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Titel (optional)">
            <input className="input" placeholder="z. B. 2. Schulaufgabe" value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
        </div>

        <button type="button" className="flex items-center gap-3 text-left" onClick={() => setIsPending(p => !p)}>
          <span className={'switch shrink-0' + (isPending ? ' on' : '')}><span className="switch-knob" /></span>
          <span className="text-sm" style={{ color: 'rgb(var(--ink-700))' }}>Note steht aus (Termin vormerken)</span>
        </button>

        <PhotoAttachment refId={gradeIdRef.current} refType="grade" />
      </DialogShell>
      <Confetti trigger={confettiTrigger} />
    </>
  );
}
