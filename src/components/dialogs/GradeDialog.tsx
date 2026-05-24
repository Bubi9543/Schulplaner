import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import type { Grade, GradeKind } from '@/types';
import { defaultWeight, KIND_LABEL, getSystemMeta, gradeColor, isGoodGrade } from '@/lib/grading';
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

const KIND_OPTIONS: GradeKind[] = ['schulaufgabe', 'klausur', 'stegreif', 'muendlich', 'referat', 'projekt', 'sonstige'];

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
  const [weight, setWeight] = useState<number>(initial?.weight ?? (config && subject ? defaultWeight(kind, subject.system, subject.category, config) : 1));
  const [weightMultiplier, setWeightMultiplier] = useState<0.5 | 1 | 2>((initial?.weightMultiplier ?? 1) as 0.5 | 1 | 2);
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
    setWeightMultiplier((initial?.weightMultiplier ?? 1) as 0.5 | 1 | 2);
    setIsPending(!!initial?.isPending);
    gradeIdRef.current = initial?.id ?? uid();
  }, [open, initial, defaultSubjectId, subjects, settings, lessons, config, now]);

  useEffect(() => {
    if (!editing && subject && config) setWeight(defaultWeight(kind, subject.system, subject.category, config));
  }, [kind, subject, editing, config]);

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
      weight,
      weightMultiplier: subject.system === 'oberstufe' && config!.oberstufe.allowPerGradeWeight ? weightMultiplier : undefined,
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

  const color = gradeColor(value, system, config);

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
              {KIND_OPTIONS.map(k => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? 'chip-active' : ''}`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          {subject.system === 'oberstufe' && config.oberstufe.allowPerGradeWeight && !isPending && (
            <div>
              <label className="label">Gewichtung dieser Note</label>
              <div className="grid grid-cols-3 gap-2">
                {([0.5, 1, 2] as const).map(m => (
                  <button key={m} type="button" onClick={() => setWeightMultiplier(m)}
                    className={`btn ${weightMultiplier === m ? 'btn-primary' : 'btn-ghost'}`}>
                    {m === 0.5 ? '×½' : m === 1 ? '×1' : '×2'}
                  </button>
                ))}
              </div>
              <div className="subtle mt-1">Multipliziert die Notenart-Gewichtung.</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Gewicht (Basis)</label>
              <input type="number" min={0.5} step={0.5} className="input" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 1)} />
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

          {settings?.isMainDevice && (
            <PhotoAttachment refId={gradeIdRef.current} refType="grade" />
          )}
        </div>
      </Modal>
      <Confetti trigger={confettiTrigger} />
    </>
  );
}
