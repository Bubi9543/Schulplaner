import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { getActiveSubject, useTimeNow } from '@/lib/currentLesson';
import { PhotoAttachment } from '@/components/PhotoAttachment';
import { uid } from '@/lib/db';
import type { AppTask, TaskKind } from '@/types';
import { Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<AppTask>;
  defaultKind?: TaskKind;
}

const KIND_LABEL: Record<TaskKind, string> = {
  hausaufgabe: 'Hausaufgabe',
  test: 'Test',
  schulaufgabe: 'Schulaufgabe',
  projekt: 'Projekt',
  todo: 'Todo',
};

export function TaskDialog({ open, onClose, initial, defaultKind }: Props) {
  const subjects = useStore(s => s.subjects);
  const lessons = useStore(s => s.lessons);
  const settings = useStore(s => s.settings);
  const addTask = useStore(s => s.addTask);
  const updateTask = useStore(s => s.updateTask);
  const deleteTask = useStore(s => s.deleteTask);
  const now = useTimeNow(30000);

  const editing = !!initial?.id;
  const taskIdRef = useRef<string>(initial?.id ?? uid());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? defaultKind ?? 'hausaufgabe');
  const [subjectId, setSubjectId] = useState<string>(initial?.subjectId ?? '');
  const [autoChosen, setAutoChosen] = useState(false);
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : '');
  const [priority, setPriority] = useState<1 | 2 | 3>((initial?.priority ?? settings?.defaultTaskPriority ?? 2) as 1 | 2 | 3);

  useEffect(() => {
    if (!open) return;
    let sid = initial?.subjectId ?? '';
    let auto = false;
    if (!sid && !editing && settings?.autoSelectActiveSubject) {
      const active = getActiveSubject(lessons, subjects, now, settings.activeSubjectThresholdMin);
      if (active) { sid = active.id; auto = true; }
    }
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setKind(initial?.kind ?? defaultKind ?? 'hausaufgabe');
    setSubjectId(sid);
    setAutoChosen(auto);
    setDueDate(initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : '');
    setPriority((initial?.priority ?? settings?.defaultTaskPriority ?? 2) as 1 | 2 | 3);
    taskIdRef.current = initial?.id ?? uid();
  }, [open, initial, defaultKind, editing, settings, lessons, subjects, now]);

  async function save() {
    if (!title.trim()) return;
    const payload = {
      id: taskIdRef.current,
      title: title.trim(),
      description: description.trim() || undefined,
      kind,
      subjectId: subjectId || undefined,
      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      priority,
      done: initial?.done ?? false,
      doneAt: initial?.doneAt,
    };
    if (editing && initial?.id) {
      await updateTask(initial.id, payload);
    } else {
      await addTask(payload);
    }
    onClose();
  }

  async function remove() {
    if (initial?.id) {
      await deleteTask(initial.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-soft text-rose-600">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={save} className="btn-primary" disabled={!title.trim()}>Speichern</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Titel</label>
          <input className="input" autoFocus placeholder="z.B. Aufgaben S. 42" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Art</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABEL) as TaskKind[]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? 'bg-indigo-500 text-white border-indigo-500' : ''}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fach (optional)</label>
            <select className="input" value={subjectId} onChange={e => { setSubjectId(e.target.value); setAutoChosen(false); }}>
              <option value="">– kein Fach –</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {autoChosen && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-600">
                <Sparkles className="size-3" /> Vorausgewählt: aktuelle Stunde
              </div>
            )}
          </div>
          <div>
            <label className="label">Fällig am</label>
            <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Priorität</label>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(p => (
              <button key={p} type="button" onClick={() => setPriority(p)}
                className={`flex-1 btn ${priority === p ? 'btn-primary' : 'btn-ghost'}`}>
                {p === 1 ? 'Niedrig' : p === 2 ? 'Normal' : 'Hoch'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Notizen (optional)</label>
          <textarea className="input min-h-[80px]" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {settings?.isMainDevice && (
          <PhotoAttachment refId={taskIdRef.current} refType="task" />
        )}
      </div>
    </Modal>
  );
}
