import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { getActiveSubject, useTimeNow } from '@/lib/currentLesson';
import { useIsHoliday } from '@/lib/useHolidays';
import { PhotoAttachment } from '@/components/PhotoAttachment';
import { uid } from '@/lib/db';
import type { AppTask, TaskKind } from '@/types';
import { BUILTIN_TASK_KINDS } from '@/types';
import { getTaskKindLabel, getTaskKindIcon } from '@/lib/grading';
import { BookOpen, Tag, GraduationCap, Calendar, Flag, Check, Share2, Sparkles } from 'lucide-react';
import {
  DialogShell, Field, KindChips, SubjectChips, LessonDateChips, PriorityPicker,
  isoDate, relDaysFromIso, relText, type KindChipItem,
} from './dialogParts';

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
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate ? isoDate(new Date(initial.dueDate)) : '');
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
    setDueDate(initial?.dueDate ? isoDate(new Date(initial.dueDate)) : '');
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

  const config = settings?.gradingConfig;
  const isHomework = kind === 'hausaufgabe';
  const hasSubscriptions = (settings?.homeworkSubscriptions?.length ?? 0) > 0;
  const subject = subjects.find(s => s.id === subjectId);
  const rel = relDaysFromIso(dueDate);

  const kindItems: KindChipItem[] = [
    ...BUILTIN_TASK_KINDS.map(k => ({ id: k, label: getTaskKindLabel(k, config), icon: getTaskKindIcon(k) })),
    ...(config?.customKinds ?? []).map(c => ({ id: c.id, label: c.label, icon: getTaskKindIcon(c.id) })),
  ];

  return (
    <DialogShell
      open={open} onClose={onClose} maxWidth="md:max-w-xl"
      eyebrow="Aufgabe" eyebrowIcon={BookOpen} title={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      footer={
        <>
          {editing && <button onClick={remove} className="btn-danger-soft mr-auto">Löschen</button>}
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={save} className="btn-primary" disabled={!title.trim()}><Check className="size-4" />Speichern</button>
        </>
      }
    >
      <Field label="Titel">
        <input className="input" autoFocus placeholder="z. B. Aufgaben S. 42 Nr. 3–7" value={title} onChange={e => setTitle(e.target.value)} />
      </Field>

      <Field label="Art" icon={Tag}>
        <KindChips items={kindItems} value={kind} onChange={setKind} />
      </Field>

      <Field label="Fach (optional)" icon={GraduationCap}>
        <SubjectChips subjects={subjects} value={subjectId} onChange={(id) => { setSubjectId(id); setAutoChosen(false); }} lessons={lessons} now={now} allowNone />
        {autoChosen && subject && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-theme-deep">
            <Sparkles className="size-3.5" /><span>Vorausgewählt: aktuelle Stunde ({subject.name})</span>
          </div>
        )}
      </Field>

      <Field label="Fällig am" icon={Calendar} hint={subject ? `Vorschläge richten sich nach deinem Stundenplan (${subject.name}).` : undefined}>
        <div className="flex flex-col gap-2.5">
          <LessonDateChips subjectId={subjectId} lessons={lessons} value={dueDate} onChange={setDueDate} />
          <div className="flex items-center gap-2.5">
            <input type="date" className="input flex-1" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            {rel !== null && <span className="subtle whitespace-nowrap font-semibold">{relText(rel)}</span>}
          </div>
        </div>
      </Field>

      <Field label="Priorität" icon={Flag}>
        <PriorityPicker value={priority} onChange={setPriority} />
      </Field>

      <Field label="Notizen (optional)">
        <textarea className="input min-h-[80px]" placeholder="Optional …" value={description} onChange={e => setDescription(e.target.value)} />
      </Field>

      {isHomework && (
        <button
          type="button"
          onClick={() => setShared(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition"
          style={shared
            ? { borderColor: 'rgb(var(--theme-primary-rgb) / 0.5)', background: 'rgb(var(--theme-primary-rgb) / 0.1)' }
            : { borderColor: 'rgb(var(--surface-border-rgb) / 0.8)', background: 'rgb(var(--surface-rgb) / 0.5)' }}
        >
          <span className="grid place-items-center size-9 rounded-xl shrink-0"
            style={shared
              ? { background: 'rgb(var(--theme-primary-rgb) / 0.16)', color: 'rgb(var(--theme-primary-deep-rgb))' }
              : { background: 'rgb(var(--ink-100))', color: 'rgb(var(--ink-500))' }}>
            <Share2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: 'rgb(var(--ink-800))' }}>Mit Mitschülern teilen</span>
            <span className="subtle block text-xs">
              {shared ? 'Sichtbar für deine Abonnenten' : hasSubscriptions ? 'Nur für dich (nicht geteilt)' : 'Aktiviere Freunde in den Einstellungen'}
            </span>
          </span>
          <span className={'switch ml-auto shrink-0' + (shared ? ' on' : '')}><span className="switch-knob" /></span>
        </button>
      )}

      <PhotoAttachment refId={taskIdRef.current} refType="task" />
    </DialogShell>
  );
}
