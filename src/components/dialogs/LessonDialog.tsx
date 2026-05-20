import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { WEEKDAYS_DE } from '@/lib/utils';
import type { Lesson, Weekday } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Lesson>;
  defaults?: { weekday?: Weekday; start?: string; end?: string };
}

export function LessonDialog({ open, onClose, initial, defaults }: Props) {
  const subjects = useStore(s => s.subjects);
  const addLesson = useStore(s => s.addLesson);
  const updateLesson = useStore(s => s.updateLesson);
  const deleteLesson = useStore(s => s.deleteLesson);
  const editing = !!initial?.id;

  const [subjectId, setSubjectId] = useState<string>(initial?.subjectId ?? subjects[0]?.id ?? '');
  const [weekday, setWeekday] = useState<Weekday>((initial?.weekday ?? defaults?.weekday ?? 1) as Weekday);
  const [start, setStart] = useState<string>(initial?.start ?? defaults?.start ?? '08:00');
  const [end, setEnd] = useState<string>(initial?.end ?? defaults?.end ?? '08:45');
  const [room, setRoom] = useState<string>(initial?.room ?? '');

  useEffect(() => {
    if (open) {
      setSubjectId(initial?.subjectId ?? subjects[0]?.id ?? '');
      setWeekday((initial?.weekday ?? defaults?.weekday ?? 1) as Weekday);
      setStart(initial?.start ?? defaults?.start ?? '08:00');
      setEnd(initial?.end ?? defaults?.end ?? '08:45');
      setRoom(initial?.room ?? '');
    }
  }, [open, initial, defaults, subjects]);

  async function save() {
    if (!subjectId) return;
    const payload = { subjectId, weekday, start, end, room: room.trim() || undefined };
    if (editing && initial?.id) await updateLesson(initial.id, payload);
    else await addLesson(payload);
    onClose();
  }

  async function remove() {
    if (initial?.id) { await deleteLesson(initial.id); onClose(); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Stunde bearbeiten' : 'Stunde hinzufügen'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={save} className="btn-primary" disabled={!subjectId}>Speichern</button>
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
        <div>
          <label className="label">Wochentag</label>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map(d => (
              <button key={d} type="button" onClick={() => setWeekday(d as Weekday)}
                className={`btn text-xs px-2 py-2 ${weekday === d ? 'btn-primary' : 'btn-ghost'}`}>
                {WEEKDAYS_DE[d].slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Von</label>
            <input type="time" className="input" value={start} onChange={e => {
              setStart(e.target.value);
              // keep duration when start changes if end was auto-set
            }} />
          </div>
          <div>
            <label className="label">Bis</label>
            <input type="time" className="input" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Dauer (Schnellwahl)</label>
          <div className="flex gap-2">
            {[
              { label: '45 min', min: 45 },
              { label: '1 Std', min: 60 },
              { label: '90 min', min: 90 },
            ].map(p => (
              <button
                key={p.min} type="button"
                onClick={() => {
                  if (!start) return;
                  const [h, m] = start.split(':').map(Number);
                  const total = h * 60 + m + p.min;
                  setEnd(`${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
                }}
                className="flex-1 btn btn-ghost text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Raum (optional)</label>
          <input className="input" value={room} onChange={e => setRoom(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
