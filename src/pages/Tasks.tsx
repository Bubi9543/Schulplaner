import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, ListTodo, CalendarDays, Filter, CheckCircle2, Circle, Inbox, AlertCircle } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { useStore } from '@/store/useStore';
import { addDays, isSameDay, relativeDate, startOfWeek } from '@/lib/utils';
import type { AppTask, TaskKind } from '@/types';

type View = 'list' | 'calendar' | 'kanban';

const KIND_META: Record<TaskKind, { label: string; icon: string }> = {
  hausaufgabe: { label: 'Hausaufgabe', icon: '📝' },
  test: { label: 'Test', icon: '✏️' },
  schulaufgabe: { label: 'Schulaufgabe', icon: '📄' },
  projekt: { label: 'Projekt', icon: '🎯' },
  todo: { label: 'Todo', icon: '✅' },
};

export function TasksPage() {
  const tasks = useStore(s => s.tasks);
  const subjects = useStore(s => s.subjects);
  const toggleTask = useStore(s => s.toggleTask);
  const [view, setView] = useState<View>('calendar');
  const [filterKind, setFilterKind] = useState<TaskKind | null>(null);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; task?: AppTask; defaultKind?: TaskKind }>({ open: false });

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
      title="Aufgaben"
      subtitle={`${tasks.filter(t => !t.done).length} offen · ${tasks.filter(t => t.done).length} erledigt`}
      actions={
        <>
          <div className="glass rounded-2xl p-1 flex">
            <ViewBtn active={view === 'calendar'} onClick={() => setView('calendar')} icon={<CalendarDays className="size-4" />} label="Kalender" />
            <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={<ListTodo className="size-4" />} label="Liste" />
            <ViewBtn active={view === 'kanban'} onClick={() => setView('kanban')} icon={<Inbox className="size-4" />} label="Board" />
          </div>
          <button className="btn-primary" onClick={() => setDialog({ open: true })}><Plus className="size-4" />Neu</button>
        </>
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

      <AnimatePresence mode="wait">
        {view === 'calendar' && (
          <motion.div key="cal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <CalendarView tasks={filtered} onSelect={t => setDialog({ open: true, task: t })} onNew={(d) => { const task: Partial<AppTask> = { dueDate: d.getTime() }; setDialog({ open: true, task: task as AppTask }); }} />
          </motion.div>
        )}
        {view === 'list' && (
          <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ListView tasks={filtered} onSelect={t => setDialog({ open: true, task: t })} onToggle={toggleTask} />
          </motion.div>
        )}
        {view === 'kanban' && (
          <motion.div key="kan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <KanbanView tasks={filtered} onSelect={t => setDialog({ open: true, task: t })} onToggle={toggleTask} />
          </motion.div>
        )}
      </AnimatePresence>

      <TaskDialog open={dialog.open} initial={dialog.task} defaultKind={dialog.defaultKind} onClose={() => setDialog({ open: false })} />
    </PageShell>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${active ? 'text-white' : 'text-ink-600'}`}>
      {active && <motion.span layoutId="task-view" className="absolute inset-0 rounded-xl theme-gradient" />}
      <span className="relative flex items-center gap-1.5">{icon}{label}</span>
    </button>
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

function ListView({ tasks, onSelect, onToggle }: { tasks: AppTask[]; onSelect: (t: AppTask) => void; onToggle: (id: string) => void }) {
  const subjects = useStore(s => s.subjects);
  const buckets = useMemo(() => {
    const out: Record<string, AppTask[]> = { overdue: [], today: [], week: [], later: [], noDate: [] };
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (const t of tasks) {
      if (!t.dueDate) { out.noDate.push(t); continue; }
      const d = new Date(t.dueDate); d.setHours(0, 0, 0, 0);
      const diff = (d.getTime() - now.getTime()) / 86400000;
      if (diff < 0) out.overdue.push(t);
      else if (diff < 1) out.today.push(t);
      else if (diff < 7) out.week.push(t);
      else out.later.push(t);
    }
    return out;
  }, [tasks]);
  const sections: Array<{ key: keyof typeof buckets; label: string; tint?: string }> = [
    { key: 'overdue', label: 'Überfällig', tint: 'text-rose-600' },
    { key: 'today', label: 'Heute & Morgen', tint: 'text-orange-600' },
    { key: 'week', label: 'Diese Woche' },
    { key: 'later', label: 'Später' },
    { key: 'noDate', label: 'Ohne Datum' },
  ];

  if (!tasks.length) {
    return <Card><div className="text-center py-8 text-ink-500">Keine Aufgaben – genieße den Moment 🌞</div></Card>;
  }

  return (
    <div className="space-y-4">
      {sections.map(sec => buckets[sec.key].length === 0 ? null : (
        <Card key={sec.key}>
          <h3 className={`h3 ${sec.tint ?? ''} mb-2 flex items-center gap-2`}>
            {sec.key === 'overdue' && <AlertCircle className="size-5" />}{sec.label}
            <span className="chip">{buckets[sec.key].length}</span>
          </h3>
          <ul className="divide-y divide-white/50">
            {buckets[sec.key].map(t => {
              const subj = subjects.find(s => s.id === t.subjectId);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5 group">
                  <button onClick={() => onToggle(t.id)} className="text-ink-400 hover:text-emerald-500">
                    {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
                  </button>
                  <button onClick={() => onSelect(t)} className="flex-1 min-w-0 text-left">
                    <div className={`font-medium text-ink-800 truncate ${t.done ? 'line-through text-ink-400' : ''}`}>{t.title}</div>
                    <div className="text-xs text-ink-500 flex items-center gap-2 mt-0.5">
                      <span>{KIND_META[t.kind].icon} {KIND_META[t.kind].label}</span>
                      {subj && (<><span>·</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: subj.color }} />{subj.name}</span></>)}
                      {t.dueDate && <><span>·</span><span>{relativeDate(t.dueDate)}</span></>}
                    </div>
                  </button>
                  <span className={`chip text-[10px] ${t.priority === 3 ? 'bg-rose-100 text-rose-600 border-rose-200' : t.priority === 2 ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}`}>
                    {t.priority === 3 ? 'Hoch' : t.priority === 2 ? 'Normal' : 'Niedrig'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function KanbanView({ tasks, onSelect, onToggle }: { tasks: AppTask[]; onSelect: (t: AppTask) => void; onToggle: (id: string) => void }) {
  const subjects = useStore(s => s.subjects);
  const cols = [
    { label: 'Backlog', filter: (t: AppTask) => !t.done && !t.dueDate, accent: 'from-slate-400 to-slate-500' },
    { label: 'Diese Woche', filter: (t: AppTask) => !t.done && t.dueDate && (t.dueDate - Date.now()) < 7 * 86400000, accent: 'from-orange-400 to-rose-500' },
    { label: 'Später', filter: (t: AppTask) => !t.done && t.dueDate && (t.dueDate - Date.now()) >= 7 * 86400000, accent: 'from-indigo-400 to-violet-500' },
    { label: 'Erledigt', filter: (t: AppTask) => t.done, accent: 'from-emerald-400 to-teal-500' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cols.map(c => {
        const items = tasks.filter(c.filter);
        return (
          <div key={c.label} className="card !p-3">
            <div className={`rounded-2xl mb-2 px-3 py-2 text-white text-sm font-semibold bg-gradient-to-r ${c.accent} flex items-center justify-between`}>
              {c.label}<span className="chip bg-white/20 text-white border-white/30">{items.length}</span>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {items.map(t => {
                const subj = subjects.find(s => s.id === t.subjectId);
                return (
                  <button key={t.id} onClick={() => onSelect(t)}
                    className="block w-full text-left rounded-2xl bg-white/80 hover:bg-white p-3 transition shadow-sm">
                    <div className="flex items-start gap-2">
                      <button onClick={(e) => { e.stopPropagation(); onToggle(t.id); }} className="mt-0.5 text-ink-400 hover:text-emerald-500">
                        {t.done ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Circle className="size-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm text-ink-800 ${t.done ? 'line-through text-ink-400' : ''}`}>{t.title}</div>
                        <div className="text-[10px] text-ink-500 flex items-center gap-1 flex-wrap mt-1">
                          {subj && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: subj.color }} />{subj.short}</span>}
                          {t.dueDate && <span>· {relativeDate(t.dueDate)}</span>}
                          <span>· {KIND_META[t.kind].label}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!items.length && <div className="text-center text-xs text-ink-400 py-6">leer</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
