import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import type { Grade, GradeKind } from '@/types';
import { BUILTIN_GRADE_KINDS } from '@/types';
import { getKindLabel, getSystemMeta, gradeColor, isGoodGrade, isLargeAssessmentKind } from '@/lib/grading';
import { hexToRgba } from '@/lib/utils';
import { getActiveSubject, useTimeNow } from '@/lib/currentLesson';
import { Confetti } from '@/components/CountUp';
import { PhotoAttachment } from '@/components/PhotoAttachment';
import { uid } from '@/lib/db';
import { Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Grade>;
  defaultSubjectId?: string;
}

const BUILTIN_KIND_ORDER: GradeKind[] = ['schulaufgabe', 'klausur', 'stegreif', 'muendlich', 'referat', 'projekt', 'sonstige'];
// Sanity-Check: BUILTIN_KIND_ORDER muss eine Permutation von BUILTIN_GRADE_KINDS sein
void BUILTIN_GRADE_KINDS;

const WEIGHT_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '×½' },
  { value: 1,   label: '×1' },
  { value: 1.5, label: '×1,5' },
  { value: 2,   label: '×2' },
];

function isPreset(v: number): boolean {
  return WEIGHT_PRESETS.some(p => Math.abs(p.value - v) < 1e-6);
}

export function GradeDialog({ open, onClose, initial, defaultSubjectId }: Props) {
  const subjects = useStore(s => s.subjects);
  const lessons = useStore(s => s.lessons);
  const addGrade = useStore(s => s.addGrade);
  const updateGrade = useStore(s => s.updateGrade);
  const deleteGrade = useStore(s => s.deleteGrade);
  const settings = useStore(s => s.settings);
  const now = useTimeNow(30000);

  const config = settings?.gradingConfig;
  const editing = !!initial?.id;

  const initialSubjectId = (() => {
    if (initial?.subjectId) return initial.subjectId;
    if (defaultSubjectId) return defaultSubjectId;
    if (settings?.autoSelectActiveSubject) {
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
      if (settings?.autoSelectActiveSubject) {
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
    if (Number.isFinite(parsed) && parsed > 0) {
      setWeightMultiplier(parsed);
    }
  }

  const color = gradeColor(value, system, config);
  const customActive = !isPreset(weightMultiplier);
  const isLargeKind = isLargeAssessmentKind(kind, config);
  const showCategoryHint = subject.system === 'bayern' && subject.category !== 'nebenfach';
  const customKinds = config.customKinds ?? [];

  return (
    <>
      <Modal open={open} onClose={onClose} title={editing ? 'Note bearbeiten' : 'Note hinzufügen'}
        footer={
          <>
            {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
            <button onClick={onClose} className="btn-ghost">Abbrechen</button>
            <button onClick={save} className="btn-primary">Speichern</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Fach</label>
            <select className="input" value={subjectId} onChange={e => { setSubjectId(e.target.value); setAutoChosen(false); }}>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {autoChosen && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-theme-deep">
                <Sparkles className="size-3" /> Vorausgewählt: aktuelle Stunde
              </div>
            )}
          </div>

          <div className="rounded-3xl p-5 text-center text-white" style={{ background: `linear-gradient(135deg, ${color}, ${hexToRgba(color, .85)})` }}>
            <div className="text-xs uppercase tracking-wider opacity-90">Note</div>
            <div className="font-display font-extrabold text-5xl mt-1">{isPending ? '?' : meta.formatValue(value)}</div>
            <div className="text-xs opacity-80 mt-1">{subject.name}</div>
          </div>

          {!isPending && (
            <div>
              <label className="label">Wert</label>
              {meta.valueOptions.length <= 16 ? (
                <div className="grid grid-cols-6 gap-1.5">
                  {meta.valueOptions.map(v => (
                    <button key={v} type="button" onClick={() => setValue(v)}
                      className={`py-2 rounded-xl font-display font-bold text-sm transition ${value === v ? 'text-white shadow-md' : 'bg-white/70 text-ink-700 hover:bg-white'}`}
                      style={value === v ? { background: gradeColor(v, system, config) } : undefined}>
                      {meta.formatValue(v).replace(' P', '')}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="range" min={meta.min} max={meta.max} step={meta.step}
                  value={value}
                  onChange={e => setValue(parseFloat(e.target.value))}
                  className="w-full accent-theme"
                />
              )}
              <div className="flex justify-between text-xs text-ink-400 mt-1">
                <span>{meta.formatValue(meta.min)}</span><span>{meta.formatValue(meta.max)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="label">Art</label>
            <div className="flex flex-wrap gap-2">
              {BUILTIN_KIND_ORDER.map(k => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? 'chip-active' : ''}`}>
                  {getKindLabel(k, config)}
                </button>
              ))}
              {customKinds.map(c => (
                <button key={c.id} type="button" onClick={() => setKind(c.id)}
                  className={`chip ${kind === c.id ? 'chip-active' : ''}`}
                  title={c.weighting === 'large' ? 'Eigene Kategorie · zählt wie Schulaufgabe' : 'Eigene Kategorie · zählt wie Mündlich'}
                >
                  {c.label}
                  <span className="ml-1 opacity-60 text-[10px]">
                    {c.weighting === 'large' ? '· SA' : '· Mdl'}
                  </span>
                </button>
              ))}
            </div>
            {showCategoryHint && (
              <div className="subtle mt-1.5 text-xs">
                {isLargeKind
                  ? `Diese Note zählt ${subject.category === 'hauptfach' ? 'doppelt' : '1:1'} mit dem Rest (Schulaufgaben-Block).`
                  : 'Wird zum Schnitt der kleinen Leistungen verrechnet.'}
              </div>
            )}
          </div>

          {!isPending && (
            <div>
              <label className="label">Gewichtung dieser Note</label>
              <div className="grid grid-cols-4 gap-2">
                {WEIGHT_PRESETS.map(p => (
                  <button key={p.value} type="button"
                    onClick={() => { setWeightMultiplier(p.value); setCustomWeightInput(''); }}
                    className={`btn ${!customActive && Math.abs(weightMultiplier - p.value) < 1e-6 ? 'btn-primary' : 'btn-ghost'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Custom (z.B. 0,75)"
                  className={`input ${customActive ? 'border-theme' : ''}`}
                  value={customWeightInput}
                  onChange={e => applyCustomWeight(e.target.value)}
                />
                <span className="text-xs text-ink-500 whitespace-nowrap">aktuell ×{weightMultiplier.toString().replace('.', ',')}</span>
              </div>
              <div className="subtle mt-1.5 text-xs">
                Wirkt innerhalb der Gruppe (Schulaufgaben oder Rest). ×2 bedeutet, diese Note zählt doppelt.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Titel (optional)</label>
            <input className="input" placeholder="z.B. 2. Schulaufgabe" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isPending} onChange={e => setIsPending(e.target.checked)} className="size-5 accent-theme" />
            <span className="text-sm text-ink-700">Note steht aus (Termin vormerken)</span>
          </label>

          <PhotoAttachment refId={gradeIdRef.current} refType="grade" />
        </div>
      </Modal>
      <Confetti trigger={confettiTrigger} />
    </>
  );
}
