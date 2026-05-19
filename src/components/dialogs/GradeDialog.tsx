import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import type { Grade, GradeKind } from '@/types';
import { defaultWeight, GRADE_RANGES, KIND_WEIGHTS, gradeColor } from '@/lib/grading';
import { hexToRgba } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Grade>;
  defaultSubjectId?: string;
}

const KIND_OPTIONS: GradeKind[] = ['schulaufgabe', 'stegreif', 'muendlich', 'projekt', 'sonstige'];

export function GradeDialog({ open, onClose, initial, defaultSubjectId }: Props) {
  const subjects = useStore(s => s.subjects);
  const addGrade = useStore(s => s.addGrade);
  const updateGrade = useStore(s => s.updateGrade);
  const deleteGrade = useStore(s => s.deleteGrade);
  const settings = useStore(s => s.settings);

  const editing = !!initial?.id;
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? defaultSubjectId ?? subjects[0]?.id ?? '');
  const subject = subjects.find(s => s.id === subjectId);
  const system = subject?.system ?? settings?.system ?? 'bayern';
  const range = GRADE_RANGES[system];
  const [value, setValue] = useState<number>(initial?.value ?? range.default);
  const [kind, setKind] = useState<GradeKind>(initial?.kind ?? 'schulaufgabe');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState<string>(new Date(initial?.date ?? Date.now()).toISOString().slice(0, 10));
  const [weight, setWeight] = useState<number>(initial?.weight ?? defaultWeight(kind, system, subject?.category ?? 'neben'));
  const [isPending, setIsPending] = useState<boolean>(!!initial?.isPending);

  useEffect(() => {
    if (open) {
      setSubjectId(initial?.subjectId ?? defaultSubjectId ?? subjects[0]?.id ?? '');
      setValue(initial?.value ?? GRADE_RANGES[(subjects.find(s => s.id === (initial?.subjectId ?? defaultSubjectId ?? subjects[0]?.id))?.system) ?? 'bayern'].default);
      setKind(initial?.kind ?? 'schulaufgabe');
      setTitle(initial?.title ?? '');
      setDate(new Date(initial?.date ?? Date.now()).toISOString().slice(0, 10));
      setIsPending(!!initial?.isPending);
    }
  }, [open, initial, defaultSubjectId, subjects]);

  useEffect(() => {
    if (!editing && subject) setWeight(defaultWeight(kind, subject.system, subject.category));
  }, [kind, subject, editing]);

  if (!subject) return null;

  async function save() {
    if (!subject) return;
    const payload = {
      subjectId,
      value,
      kind,
      title: title.trim() || undefined,
      date: new Date(date).getTime(),
      weight,
      isPending,
    };
    if (editing && initial?.id) {
      await updateGrade(initial.id, payload);
    } else {
      await addGrade(payload);
    }
    onClose();
  }

  async function remove() {
    if (initial?.id) {
      await deleteGrade(initial.id);
      onClose();
    }
  }

  const color = gradeColor(value, system);

  return (
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
          <select className="input" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="rounded-3xl p-5 text-center text-white" style={{ background: `linear-gradient(135deg, ${color}, ${hexToRgba(color, .85)})` }}>
          <div className="text-xs uppercase tracking-wider opacity-90">Note</div>
          <div className="font-display font-extrabold text-5xl mt-1">{isPending ? '?' : (system === 'oberstufe' ? Math.round(value) + ' P' : value.toFixed(2).replace('.', ','))}</div>
          <div className="text-xs opacity-80 mt-1">{subject.name}</div>
        </div>

        {!isPending && (
          <div>
            <label className="label">Wert</label>
            <input
              type="range"
              min={range.min} max={range.max} step={range.step}
              value={value}
              onChange={e => setValue(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-ink-400 mt-1">
              <span>{range.min}</span><span>{range.max}</span>
            </div>
          </div>
        )}

        <div>
          <label className="label">Art</label>
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                {KIND_WEIGHTS[k]?.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Gewicht</label>
            <input type="number" min={0.5} step={0.5} className="input" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 1)} />
          </div>
        </div>

        <div>
          <label className="label">Titel (optional)</label>
          <input className="input" placeholder="z.B. 2. Schulaufgabe" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isPending} onChange={e => setIsPending(e.target.checked)} className="size-5 accent-indigo-500" />
          <span className="text-sm text-ink-700">Note steht aus (Termin vormerken)</span>
        </label>
      </div>
    </Modal>
  );
}
