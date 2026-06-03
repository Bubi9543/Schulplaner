import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { getActiveSubject, useTimeNow } from '@/lib/currentLesson';
import { useIsHoliday } from '@/lib/useHolidays';
import { PhotoAttachment } from '@/components/PhotoAttachment';
import { uid } from '@/lib/db';
import type { AppTask, TaskKind } from '@/types';
import { BUILTIN_TASK_KINDS } from '@/types';
import { getTaskKindLabel } from '@/lib/grading';
import { TaskKindIcon } from '@/components/TaskKindIcon';
import { Share2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Partial<AppTask>;
  defaultKind?: TaskKind;
}

export function TaskDialog({ open, onClose, initial, defaultKind }: Props) {
  const subjects = useStore(s => s.subjects);
  const lessons = useStore(s => s.lessons);
  const settings = useStore(s => s.settings);
  const addTask = useStore(s => s.addTask);
  const updateTask = useStore(s => s.updateTask);
  const deleteTask = useStore(s => s.deleteTask);
  const now = useTimeNow(30000);
  const isHolidayToday = useIsHoliday(now);

  const editing = !!initial?.id;
  const taskIdRef = useRef<string>(initial?.id ?? uid());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? defaultKind ?? 'hausaufgabe');
  const [subjectId, setSubjectId] = useState<string>(initial?.subjectId ?? '');
  const [autoChosen, setAutoChosen] = useState(false);
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 10) : '');
  const [priority, setPriority] = useState<1 | 2 | 3>((initial?.priority ?? settings?.defaultTaskPriority ?? 2) as 1 | 2 | 3);
  const [shared, setShared] = useState<boolean>(initial?.shared ?? settings?.homeworkShareByDefault ?? false);

  useEffect(() => {
    if (!open) return;
    let sid = initial?.subjectId ?? '';
    let auto = false;
    if (!sid && !editing && settings?.autoSelectActiveSubject && !isHolidayToday) {
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
    setShared(initial?.shared ?? settings?.homeworkShareByDefault ?? false);
    taskIdRef.current = initial?.id ?? uid();
  }, [open, initial, defaultKind, editing, settings, lessons, subjects, now, isHolidayToday]);

  async function save() {
    if (!title.trim()) return;
    const isHomework = kind === 'hausaufgabe';
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
      shared: isHomework ? shared : false,
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

  const isHomework = kind === 'hausaufgabe';
  const hasSubscriptions = (settings?.homeworkSubscriptions?.length ?? 0) > 0;

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
            {BUILTIN_TASK_KINDS.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`chip ${kind === k ? 'chip-active' : ''}`}>
                <TaskKindIcon kind={k} className="size-3.5" />{getTaskKindLabel(k)}
              </button>
            ))}
            {settings?.gradingConfig.customKinds?.map(c => (
              <button key={c.id} type="button" onClick={() => setKind(c.id)}
                className={`chip ${kind === c.id ? 'chip-active' : ''}`}
                title={`Eigene Kategorie · zählt als Note ${c.weighting === 'large' ? 'wie Schulaufgabe' : 'wie Mündlich'}`}
              >
                <TaskKindIcon kind={c.id} className="size-3.5" />{c.label}
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
              <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-theme-deep">
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

        {/* Sharing-Toggle – nur bei Hausaufgaben sichtbar */}
        {isHomework && (
          <button
            type="button"
            onClick={() => setShared(v => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition ${
              shared
                ? 'border-theme bg-theme-soft text-theme-deep'
                : 'border-ink-200 bg-white/60 text-ink-600 hover:border-ink-300'
            }`}
          >
            <div className={`relative w-10 h-5.5 rounded-full transition flex-shrink-0 ${shared ? 'bg-theme' : 'bg-ink-300'}`}
              style={{ height: '22px', minWidth: '40px' }}>
              <motion.span
                className="absolute top-0.5 left-0.5 size-[18px] bg-white rounded-full shadow"
                animate={{ x: shared ? 18 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
            <Share2 className="size-4 flex-shrink-0" />
            <div className="text-left min-w-0">
              <div className="text-sm font-semibold leading-tight">Mit Mitschülern teilen</div>
              <div className="text-xs opacity-70 leading-tight mt-0.5">
                {shared
                  ? 'Wird für deine Abonnenten sichtbar'
                  : hasSubscriptions
                    ? 'Nur für dich (nicht geteilt)'
                    : 'Aktiviere Freunde in den Einstellungen'}
              </div>
            </div>
          </button>
        )}

        <PhotoAttachment refId={taskIdRef.current} refType="task" />
      </div>
    </Modal>
  );
}
