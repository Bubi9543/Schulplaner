import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { SUBJECT_COLORS } from '@/types';
import type { Subject, SubjectCategory, GradingSystem } from '@/types';
import { CATEGORY_LABEL, CATEGORY_DESCRIPTION } from '@/lib/grading';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Subject>;
  defaultSystem?: GradingSystem;
}

export function SubjectDialog({ open, onClose, initial, defaultSystem = 'bayern' }: Props) {
  const addSubject = useStore(s => s.addSubject);
  const updateSubject = useStore(s => s.updateSubject);
  const deleteSubject = useStore(s => s.deleteSubject);
  const editing = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? '');
  const [short, setShort] = useState(initial?.short ?? '');
  const [color, setColor] = useState(initial?.color ?? SUBJECT_COLORS[0]);
  const [category, setCategory] = useState<SubjectCategory>(initial?.category ?? 'nebenfach');
  const [system, setSystem] = useState<GradingSystem>(initial?.system ?? defaultSystem);
  const [teacher, setTeacher] = useState(initial?.teacher ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [targetAverage, setTargetAverage] = useState<string>(initial?.targetAverage?.toString() ?? '');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setShort(initial?.short ?? '');
      setColor(initial?.color ?? SUBJECT_COLORS[0]);
      setCategory(initial?.category ?? 'nebenfach');
      setSystem(initial?.system ?? defaultSystem);
      setTeacher(initial?.teacher ?? '');
      setRoom(initial?.room ?? '');
      setTargetAverage(initial?.targetAverage?.toString() ?? '');
    }
  }, [open, initial, defaultSystem]);

  // Bei Wechsel zu Nicht-Bayern: 1:1-Variante auf normales Hauptfach normalisieren
  useEffect(() => {
    if (system !== 'bayern' && category === 'hauptfach-1zu1') setCategory('hauptfach');
  }, [system, category]);

  async function save() {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      short: short.trim() || name.trim().slice(0, 2),
      color,
      category,
      system,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      targetAverage: targetAverage ? parseFloat(targetAverage.replace(',', '.')) : undefined,
    };
    if (editing && initial?.id) {
      await updateSubject(initial.id, payload);
    } else {
      await addSubject(payload);
    }
    onClose();
  }

  async function remove() {
    if (initial?.id && confirm('Fach mit allen Noten/Stunden/Aufgaben wirklich löschen?')) {
      await deleteSubject(initial.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Fach bearbeiten' : 'Neues Fach'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={save} className="btn-primary" disabled={!name.trim()}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-3xl p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div className="size-16 rounded-2xl bg-white/25 grid place-items-center text-white font-display font-extrabold text-2xl">
            {(short || name).slice(0, 2)}
          </div>
          <div className="text-white">
            <div className="font-display font-bold text-lg">{name || 'Fachname'}</div>
            <div className="text-xs opacity-80">{CATEGORY_LABEL[category]} · {system === 'bayern' ? 'Bayern (1–6)' : system === 'oberstufe' ? 'Oberstufe (0–15)' : system === 'austria' ? 'Österreich (1–5)' : 'Frei'}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Mathematik" />
          </div>
          <div>
            <label className="label">Kürzel</label>
            <input className="input" value={short} onChange={e => setShort(e.target.value)} placeholder="M" maxLength={4} />
          </div>
        </div>

        <div>
          <label className="label">Farbe</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`size-9 rounded-2xl transition ${color === c ? 'ring-4 ring-white scale-110 shadow-soft' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notensystem</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['bayern', 'oberstufe', 'austria', 'custom'] as const).map(s => (
              <button key={s} type="button" onClick={() => setSystem(s)}
                className={`btn text-xs px-2 py-2 ${system === s ? 'btn-primary' : 'btn-ghost'}`}>
                {s === 'bayern' ? 'Bayern' : s === 'oberstufe' ? 'Oberstufe' : s === 'austria' ? 'Österreich' : 'Frei'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Kategorie</label>
          <div className={`grid gap-2 ${system === 'bayern' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
            {(system === 'bayern'
              ? (['hauptfach', 'hauptfach-1zu1', 'nebenfach'] as const)
              : (['hauptfach', 'nebenfach'] as const)
            ).map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`btn flex-col items-start text-left h-auto py-2.5 px-3 ${category === c ? 'btn-primary' : 'btn-ghost'}`}>
                <span className="font-semibold text-sm">{CATEGORY_LABEL[c]}</span>
                <span className={`text-[10px] mt-0.5 leading-tight font-normal ${category === c ? 'text-white/85' : 'text-ink-500'}`}>{CATEGORY_DESCRIPTION[c]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Lehrer:in (optional)</label>
            <input className="input" value={teacher} onChange={e => setTeacher(e.target.value)} />
          </div>
          <div>
            <label className="label">Raum (optional)</label>
            <input className="input" value={room} onChange={e => setRoom(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Zielnote (optional)</label>
          <input className="input" placeholder={system === 'bayern' ? 'z.B. 2,5' : system === 'oberstufe' ? 'z.B. 10' : system === 'austria' ? 'z.B. 2' : 'z.B. 2,5'} value={targetAverage} onChange={e => setTargetAverage(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
