import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Filter, Palmtree } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { addDays, isSameDay, startOfWeek } from '@/lib/utils';
import { getTaskKindLabel } from '@/lib/grading';
import { TaskKindIcon } from '@/components/TaskKindIcon';
import { fetchUpcomingHolidays, isoLocal } from '@/lib/holidays';
import type { AppTask, TaskKind, SchoolHoliday } from '@/types';
import { BUILTIN_TASK_KINDS, DEFAULT_QUICK_BUTTONS } from '@/types';

export function CalendarPage() {
  const tasks = useStore(s => s.tasks);
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const region = settings?.region;
  const customKinds = settings?.gradingConfig.customKinds ?? [];

  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!region) { setHolidays([]); return; }
    // Subdivision wird für DE/AT empfohlen, sonst kommen evtl. zu viele.
    if (region.country === 'DE' && !region.subdivision) { setHolidays([]); return; }
    fetchUpcomingHolidays(region).then(h => { if (!cancelled) setHolidays(h); });
    return () => { cancelled = true; };
  }, [region?.country, region?.subdivision]);
  const allKinds = useMemo<Array<{ id: TaskKind; label: string }>>(() => [
    ...BUILTIN_TASK_KINDS.map(id => ({ id, label: getTaskKindLabel(id) })),
    ...customKinds.map(c => ({ id: c.id, label: c.label })),
  ], [customKinds]);

  const quickKinds = useMemo(() => {
    const ids = settings?.quickButtons ?? DEFAULT_QUICK_BUTTONS;
    return ids.map(id => ({ id, label: getTaskKindLabel(id) }));
  }, [settings?.quickButtons]);

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
          <button onClick={() => setFilterKind(null)} className={`chip ${!filterKind ? 'bg-ink-900 text-ink-50 border-ink-900' : ''}`}>Alle</button>
          {allKinds.map(k => (
            <button key={k.id} onClick={() => setFilterKind(filterKind === k.id ? null : k.id)}
              className={`chip ${filterKind === k.id ? 'bg-orange-500 text-white border-orange-500' : ''}`}>
              <TaskKindIcon kind={k.id} className="size-3.5" />{k.label}
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
          holidays={holidays}
          quickKinds={quickKinds}
          onSelect={t => setDetail({ open: true, task: t })}
          onNew={(d, kind) => setEditor({ open: true, task: { dueDate: d.getTime() }, defaultKind: kind })}
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

function CalendarView({ tasks, holidays, quickKinds, onSelect, onNew }: {
  tasks: AppTask[];
  holidays: SchoolHoliday[];
  quickKinds: Array<{ id: TaskKind; label: string }>;
  onSelect: (t: AppTask) => void;
  onNew: (d: Date, kind?: TaskKind) => void;
}) {
  const subjects = useStore(s => s.subjects);
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  useEffect(() => {
    if (!pickerDay) return;
    let listenerAdded = false;
    const close = () => setPickerDay(null);
    const timer = setTimeout(() => {
      document.addEventListener('click', close, { once: true });
      listenerAdded = true;
    }, 0);
    return () => {
      clearTimeout(timer);
      if (listenerAdded) document.removeEventListener('click', close);
    };
  }, [pickerDay]);

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

  /** Pro Datum: zugehörige Ferienzeit + ob's der erste Tag der Ferien ist. */
  const holidayByDay = useMemo(() => {
    const m = new Map<string, { holiday: SchoolHoliday; isStart: boolean }>();
    for (const h of holidays) {
      const start = new Date(h.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(h.endDate); end.setHours(0, 0, 0, 0);
      const cur = new Date(start);
      while (cur <= end) {
        const key = isoLocal(cur);
        if (!m.has(key)) m.set(key, { holiday: h, isStart: cur.getTime() === start.getTime() });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [holidays]);

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
          const isoKey = isoLocal(d);
          const hol = holidayByDay.get(isoKey);

          const baseCls = isToday
            ? 'theme-gradient-soft border-theme-soft'
            : hol
              ? (inMonth ? 'cal-hol' : 'cal-hol-faded')
              : inMonth ? 'bg-white/60 border-white/70 hover:bg-white' : 'bg-white/20 border-transparent';

          const isPickerOpen = pickerDay === key;

          return (
            <div
              key={i}
              onClick={() => setPickerDay(isPickerOpen ? null : key)}
              title={hol ? hol.holiday.name : undefined}
              className={`group relative rounded-xl min-h-[88px] p-1.5 cursor-pointer transition border ${baseCls}`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className={`text-[11px] font-bold ${isToday ? 'text-theme-deep' : hol && inMonth ? 'cal-hol-num' : inMonth ? 'text-ink-700' : 'text-ink-300'}`}>{d.getDate()}</div>
                {hol && inMonth && <Palmtree className={`size-3 flex-shrink-0 cal-hol-icon`} />}
              </div>
              {/* Ferien-Name am ersten Tag */}
              {hol?.isStart && inMonth && (
                <div className="mt-0.5 text-[9px] font-semibold cal-hol-name uppercase tracking-wide truncate">
                  {hol.holiday.name}
                </div>
              )}
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

              {/* Kind picker overlay */}
              {isPickerOpen && (
                <div
                  className="absolute inset-0 z-10 rounded-xl cal-picker p-1.5 flex flex-col gap-0.5"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="text-[10px] font-bold text-ink-500 mb-0.5 truncate">
                    {d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                  </div>
                  {quickKinds.map(k => (
                    <button
                      key={k.id}
                      onClick={() => { setPickerDay(null); onNew(d, k.id); }}
                      className="cal-picker-btn text-[10px] font-medium text-left px-1.5 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                    >
                      <TaskKindIcon kind={k.id} className="size-3" /><span className="truncate">{k.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {holidays.length > 0 && (
        <div className="mt-3 text-[11px] text-ink-500 flex items-center gap-1.5">
          <Palmtree className="size-3.5 cal-hol-icon" />
          <span>Schulferien werden hervorgehoben.</span>
        </div>
      )}
    </Card>
  );
}
