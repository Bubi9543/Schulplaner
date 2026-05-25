import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ListTodo, Filter, CheckCircle2, Circle, AlertTriangle, Inbox } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { relativeDate } from '@/lib/utils';
import type { AppTask, TaskKind } from '@/types';

const KIND_META: Record<TaskKind, { label: string; icon: string }> = {
  hausaufgabe: { label: 'Hausaufgabe', icon: '📝' },
  test: { label: 'Test', icon: '✏️' },
  schulaufgabe: { label: 'Schulaufgabe', icon: '📄' },
  projekt: { label: 'Projekt', icon: '🎯' },
  todo: { label: 'Todo', icon: '✅' },
};

type BucketKey = 'heute' | 'morgen' | 'thisWeek' | 'nextWeek' | 'later' | 'noDate' | 'overdue';

interface Bucket {
  key: BucketKey;
  label: string;
  hint?: string;
  tone: 'danger' | 'warn' | 'default' | 'muted';
  items: AppTask[];
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function TasksPage() {
  const tasks = useStore(s => s.tasks);
  const subjects = useStore(s => s.subjects);
  const toggleTask = useStore(s => s.toggleTask);

  const [filterKind, setFilterKind] = useState<TaskKind | null>(null);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [detail, setDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [editor, setEditor] = useState<{ open: boolean; task?: Partial<AppTask>; defaultKind?: TaskKind }>({ open: false });

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (!showDone && t.done) return false;
      if (filterKind && t.kind !== filterKind) return false;
      if (filterSubject && t.subjectId !== filterSubject) return false;
      return true;
    });
  }, [tasks, filterKind, filterSubject, showDone]);

  const buckets = useMemo<Bucket[]>(() => {
    const today = startOfDay(Date.now());
    const tomorrow = today + 86400000;
    const dayAfterTomorrow = today + 2 * 86400000;
    const inAWeek = today + 7 * 86400000;
    const inTwoWeeks = today + 14 * 86400000;

    const overdue: AppTask[] = [];
    const heute: AppTask[] = [];
    const morgen: AppTask[] = [];
    const thisWeek: AppTask[] = [];
    const nextWeek: AppTask[] = [];
    const later: AppTask[] = [];
    const noDate: AppTask[] = [];

    for (const t of filtered) {
      if (!t.dueDate) {
        noDate.push(t);
        continue;
      }
      const due = startOfDay(t.dueDate);
      // Überfällig: mehr als 1 Tag nach Fälligkeit UND noch offen
      if (!t.done && due < today - 86400000) {
        overdue.push(t);
        continue;
      }
      if (due === today) heute.push(t);
      else if (due === tomorrow) morgen.push(t);
      else if (due >= dayAfterTomorrow && due < inAWeek) thisWeek.push(t);
      else if (due >= inAWeek && due < inTwoWeeks) nextWeek.push(t);
      else if (due >= inTwoWeeks) later.push(t);
      else heute.push(t); // gestern noch nicht überfällig (Karenztag)
    }

    const sortByDue = (a: AppTask, b: AppTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || a.priority - b.priority;
    overdue.sort(sortByDue);
    heute.sort(sortByDue);
    morgen.sort(sortByDue);
    thisWeek.sort(sortByDue);
    nextWeek.sort(sortByDue);
    later.sort(sortByDue);
    noDate.sort((a, b) => b.createdAt - a.createdAt);

    return [
      { key: 'heute',    label: 'Heute',         hint: 'Fällig heute',                tone: 'warn',    items: heute },
      { key: 'morgen',   label: 'Morgen',        tone: 'default', items: morgen },
      { key: 'thisWeek', label: 'Diese Woche',   tone: 'default', items: thisWeek },
      { key: 'nextWeek', label: 'Nächste Woche', tone: 'default', items: nextWeek },
      { key: 'later',    label: 'Später',        tone: 'muted',   items: later },
      { key: 'noDate',   label: 'Ohne Datum',    tone: 'muted',   items: noDate },
      { key: 'overdue',  label: 'Überfällig',    hint: 'Mehr als 1 Tag nach Fälligkeit, noch nicht erledigt', tone: 'danger', items: overdue },
    ];
  }, [filtered]);

  const openCount = tasks.filter(t => !t.done).length;
  const doneCount = tasks.filter(t => t.done).length;
  const totalShown = buckets.reduce((acc, b) => acc + b.items.length, 0);

  return (
    <PageShell
      title="Aufgaben"
      subtitle={`${openCount} offen · ${doneCount} erledigt`}
      actions={
        <button className="btn-primary" onClick={() => setEditor({ open: true })}>
          <Plus className="size-4" />Neu
        </button>
      }
    >
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="size-4 text-ink-400" />
          <button onClick={() => setFilterKind(null)} className={`chip ${!filterKind ? 'bg-ink-900 text-white border-ink-900' : ''}`}>Alle</button>
          {(Object.keys(KIND_META) as TaskKind[]).map(k => (
            <button key={k} onClick={() => setFilterKind(filterKind === k ? null : k)}
              className={`chip ${filterKind === k ? 'bg-orange-500 text-white border-orange-500' : ''}`}>
              <span>{KIND_META[k].icon}</span>{KIND_META[k].label}
            </button>
          ))}
          <div className="w-px h-5 bg-ink-200 mx-1" />
          <select value={filterSubject ?? ''} onChange={e => setFilterSubject(e.target.value || null)}
            className="chip bg-white/80 cursor-pointer text-sm">
            <option value="">Alle Fächer</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="chip cursor-pointer">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} className="size-3.5 accent-theme" />
            erledigte zeigen
          </label>
        </div>
      </Card>

      {totalShown === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-10">
            <div className="size-14 rounded-2xl bg-white/70 grid place-items-center shadow-soft mb-4">
              <Inbox className="size-7 text-ink-500" />
            </div>
            <h3 className="font-display font-bold text-ink-800 text-lg">Keine Aufgaben</h3>
            <p className="subtle mt-1 max-w-sm">{tasks.length ? 'Filter prüfen oder erledigte einblenden.' : 'Leg los — was steht als nächstes an?'}</p>
            <button onClick={() => setEditor({ open: true })} className="btn-primary mt-4"><Plus className="size-4" />Neue Aufgabe</button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {buckets.map((b, idx) => b.items.length === 0 ? null : (
            <motion.div key={b.key}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}>
              <BucketCard bucket={b} onSelect={t => setDetail({ open: true, task: t })} onToggle={toggleTask} />
            </motion.div>
          ))}
        </div>
      )}

      <TaskDetailDialog
        open={detail.open}
        task={detail.task}
        onClose={() => setDetail({ open: false })}
        onEdit={t => {
          setDetail({ open: false });
          setEditor({ open: true, task: t });
        }}
      />
      <TaskDialog
        open={editor.open}
        initial={editor.task}
        onClose={() => setEditor({ open: false })}
      />
    </PageShell>
  );
}

function BucketCard({ bucket, onSelect, onToggle }: { bucket: Bucket; onSelect: (t: AppTask) => void; onToggle: (id: string) => void }) {
  const subjects = useStore(s => s.subjects);
  const toneClass = (() => {
    switch (bucket.tone) {
      case 'danger': return 'text-rose-700';
      case 'warn':   return 'text-orange-600';
      case 'muted':  return 'text-ink-500';
      default:       return 'text-ink-800';
    }
  })();
  const chipClass = (() => {
    switch (bucket.tone) {
      case 'danger': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'warn':   return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'muted':  return 'bg-ink-100 text-ink-600 border-ink-200';
      default:       return '';
    }
  })();
  const cardClass = bucket.tone === 'danger' ? 'border-rose-200/80 bg-rose-50/40' : '';

  return (
    <Card className={cardClass}>
      <div className="flex items-center gap-2 mb-2.5">
        {bucket.tone === 'danger' && <AlertTriangle className="size-5 text-rose-600" />}
        {bucket.tone !== 'danger' && bucket.key === 'heute' && <ListTodo className="size-5 text-orange-500" />}
        <h3 className={`h3 ${toneClass}`}>{bucket.label}</h3>
        <span className={`chip ${chipClass}`}>{bucket.items.length}</span>
        {bucket.hint && <span className="text-[11px] text-ink-400 ml-1 hidden sm:inline">{bucket.hint}</span>}
      </div>
      <ul className="divide-y divide-white/50">
        {bucket.items.map(t => {
          const subj = subjects.find(s => s.id === t.subjectId);
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5 group">
              <button
                onClick={() => onToggle(t.id)}
                className={`grid place-items-center size-7 rounded-full hover:bg-white/70 transition ${t.done ? 'text-emerald-500' : 'text-ink-400 hover:text-emerald-500'}`}
                aria-label={t.done ? 'Erledigt' : 'Offen'}
              >
                {t.done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
              </button>
              <button onClick={() => onSelect(t)} className="flex-1 min-w-0 text-left">
                <div className={`font-medium text-ink-800 truncate ${t.done ? 'line-through text-ink-400' : ''}`}>{t.title}</div>
                <div className="text-xs text-ink-500 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>{KIND_META[t.kind].icon} {KIND_META[t.kind].label}</span>
                  {subj && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: subj.color }} />
                        {subj.name}
                      </span>
                    </>
                  )}
                  {t.dueDate && <><span>·</span><span>{relativeDate(t.dueDate)}</span></>}
                </div>
              </button>
              <span
                className={`chip text-[10px] flex-shrink-0 ${
                  t.priority === 3 ? 'bg-rose-100 text-rose-600 border-rose-200'
                  : t.priority === 2 ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : ''
                }`}
              >
                {t.priority === 3 ? 'Hoch' : t.priority === 2 ? 'Normal' : 'Niedrig'}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
