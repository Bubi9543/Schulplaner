import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { addDays, isSameDay, startOfWeek } from '@/lib/utils';
import type { AppTask, TaskKind } from '@/types';

const KIND_META: Record<TaskKind, { label: string; icon: string }> = {
  hausaufgabe: { label: 'Hausaufgabe', icon: '📝' },
  test: { label: 'Test', icon: '✏️' },
  schulaufgabe: { label: 'Schulaufgabe', icon: '📄' },
  projekt: { label: 'Projekt', icon: '🎯' },
  todo: { label: 'Todo', icon: '✅' },
};

export function CalendarPage() {
  const tasks = useStore(s => s.tasks);
  const subjects = useStore(s => s.subjects);
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

  return (
    <PageShell
      title="Kalender"
      subtitle="Alle Aufgaben & Termine im Monatsraster."
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

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <CalendarView
          tasks={filtered}
          onSelect={t => setDetail({ open: true, task: t })}
          onNew={d => setEditor({ open: true, task: { dueDate: d.getTime() } })}
        />
      </motion.div>

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
        defaultKind={editor.defaultKind}
        onClose={() => setEditor({ open: false })}
      />
    </PageShell>
  );
}

function CalendarView({ tasks, onSelect, onNew }: { tasks: AppTask[]; onSelect: (t: AppTask) => void; onNew: (d: Date) => void }) {
  const subjects = useStore(s => s.subjects);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const monthStart = new Date(cursor); monthStart.setDate(1);
  const monthName = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const gridStart = startOfWeek(monthStart, 1);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const tasksByDay = useMemo(() => {
    const m = new Map<string, AppTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  }, [tasks]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button className="size-9 grid place-items-center rounded-full hover:bg-white/80" onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); }}><ChevronLeft className="size-4" /></button>
          <div className="font-display font-bold text-lg capitalize min-w-[150px] text-center">{monthName}</div>
          <button className="size-9 grid place-items-center rounded-full hover:bg-white/80" onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); }}><ChevronRight className="size-4" /></button>
        </div>
        <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="chip">Heute</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink-500 mb-1">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = isSameDay(d, new Date());
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const day = tasksByDay.get(key) ?? [];
          return (
            <div
              key={i}
              onClick={() => onNew(d)}
              className={`group relative rounded-xl min-h-[88px] p-1.5 cursor-pointer transition border ${
                isToday ? 'theme-gradient-soft border-theme-soft' : inMonth ? 'bg-white/60 border-white/70 hover:bg-white' : 'bg-white/20 border-transparent'
              }`}
            >
              <div className={`text-[11px] font-bold ${isToday ? 'text-theme-deep' : inMonth ? 'text-ink-700' : 'text-ink-300'}`}>{d.getDate()}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {day.slice(0, 3).map(t => {
                  const subj = subjects.find(s => s.id === t.subjectId);
                  return (
                    <button key={t.id} onClick={(e) => { e.stopPropagation(); onSelect(t); }}
                      className={`text-[10px] font-medium truncate rounded-md px-1.5 py-0.5 text-white text-left ${t.done ? 'opacity-50 line-through' : ''}`}
                      style={{ background: subj?.color ?? '#64748b' }}>
                      {t.title}
                    </button>
                  );
                })}
                {day.length > 3 && <div className="text-[10px] text-ink-500 px-1">+{day.length - 3} mehr</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
