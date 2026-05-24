import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import type { LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Plus, ListTodo, GraduationCap, NotebookPen, CheckCircle2, Circle,
  TrendingUp, TrendingDown, Sparkles, ArrowRight, Briefcase, FileText,
  Calendar, GripHorizontal, X, Award, Clock, BookOpen, BarChart2, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageShell } from '@/components/PageShell';
import { GradeBadge } from '@/components/GradeBadge';
import { AverageRing } from '@/components/AverageRing';
import { TodayTimeline } from '@/components/TodayTimeline';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { useStore } from '@/store/useStore';
import {
  effectiveWeight, formatAverage, gradeTrend, overallAverage,
  subjectAverage, getSystemMeta, gradeColor,
} from '@/lib/grading';
import { cn, daysUntil, relativeDate, WEEKDAYS_DE } from '@/lib/utils';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { Grade, TaskKind } from '@/types';


// ─── Widget system ─────────────────────────────────────────────────────────────

type WidgetType =
  | 'grade-overview'
  | 'grade-trend'
  | 'timeline'
  | 'tasks-today'
  | 'recent-grades'
  | 'pending-grades'
  | 'grade-distribution'
  | 'subjects';

interface WidgetInstance { id: string; type: WidgetType; }

const LAYOUT_KEY = 'dash_layout_v2';
const WIDGETS_KEY = 'dash_widgets_v2';

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'w-overview',     type: 'grade-overview' },
  { id: 'w-trend',        type: 'grade-trend' },
  { id: 'w-timeline',     type: 'timeline' },
  { id: 'w-tasks',        type: 'tasks-today' },
  { id: 'w-recent',       type: 'recent-grades' },
  { id: 'w-pending',      type: 'pending-grades' },
  { id: 'w-distribution', type: 'grade-distribution' },
  { id: 'w-subjects',     type: 'subjects' },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'w-overview',     x: 0,  y: 0,  w: 5,  h: 5, minW: 3, minH: 4 },
  { i: 'w-trend',        x: 5,  y: 0,  w: 7,  h: 5, minW: 4, minH: 4 },
  { i: 'w-timeline',     x: 0,  y: 5,  w: 7,  h: 8, minW: 4, minH: 5 },
  { i: 'w-tasks',        x: 7,  y: 5,  w: 5,  h: 8, minW: 3, minH: 4 },
  { i: 'w-recent',       x: 0,  y: 13, w: 6,  h: 6, minW: 3, minH: 4 },
  { i: 'w-pending',      x: 6,  y: 13, w: 6,  h: 6, minW: 3, minH: 4 },
  { i: 'w-distribution', x: 0,  y: 19, w: 5,  h: 7, minW: 3, minH: 5 },
  { i: 'w-subjects',     x: 5,  y: 19, w: 7,  h: 7, minW: 4, minH: 4 },
];

const WIDGET_META: Record<WidgetType, {
  label: string;
  icon: React.ElementType;
  defaultSize: { w: number; h: number };
}> = {
  'grade-overview':     { label: 'Gesamtschnitt',       icon: Award,       defaultSize: { w: 5, h: 5 } },
  'grade-trend':        { label: 'Notenverlauf',         icon: TrendingUp,  defaultSize: { w: 7, h: 5 } },
  'timeline':           { label: 'Stundenplan heute',    icon: Calendar,    defaultSize: { w: 7, h: 8 } },
  'tasks-today':        { label: 'Aufgaben heute',       icon: ListTodo,    defaultSize: { w: 5, h: 8 } },
  'recent-grades':      { label: 'Letzte Noten',         icon: GraduationCap, defaultSize: { w: 6, h: 6 } },
  'pending-grades':     { label: 'Ausstehende Noten',    icon: Clock,       defaultSize: { w: 6, h: 6 } },
  'grade-distribution': { label: 'Notenverteilung',      icon: BarChart2,   defaultSize: { w: 5, h: 7 } },
  'subjects':           { label: 'Fächer',               icon: BookOpen,    defaultSize: { w: 7, h: 7 } },
};

const QUICK_BUTTON_META: Record<TaskKind, { label: string; icon: React.ReactNode }> = {
  todo:         { label: 'Todo',         icon: <ListTodo className="size-4" /> },
  hausaufgabe:  { label: 'Hausaufgabe',  icon: <NotebookPen className="size-4" /> },
  test:         { label: 'Test',         icon: <GraduationCap className="size-4" /> },
  schulaufgabe: { label: 'Schulaufgabe', icon: <FileText className="size-4" /> },
  projekt:      { label: 'Projekt',      icon: <Briefcase className="size-4" /> },
};

// ─── Widget chrome ─────────────────────────────────────────────────────────────

function WidgetShell({
  children, editMode, onRemove, title,
}: {
  children: React.ReactNode;
  editMode: boolean;
  onRemove: () => void;
  title: string;
}) {
  return (
    <div className="relative h-full card !p-0 overflow-hidden flex flex-col">
      {editMode && (
        <div className="drag-handle flex-shrink-0 bg-black/5 cursor-grab active:cursor-grabbing flex items-center px-3 h-8 gap-2 select-none border-b border-black/[.06] z-10">
          <GripHorizontal className="size-3.5 text-ink-400" />
          <span className="text-xs text-ink-500 flex-1 truncate">{title}</span>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="size-5 rounded-full bg-rose-500 text-white grid place-items-center hover:bg-rose-600 flex-shrink-0"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden p-4" style={{ containerType: 'inline-size' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Individual widget components ──────────────────────────────────────────────

function GradeOverviewWidget() {
  const { subjects, grades, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const system = settings?.system ?? 'bayern';
  const overall = useMemo(() => overallAverage(grades, subjects, config), [grades, subjects, config]);
  const trend = useMemo(() =>
    gradeTrend(grades, g => subjects.find(s => s.id === g.subjectId), config, settings?.trendThreshold ?? 0.2),
    [grades, subjects, config, settings?.trendThreshold]);

  return (
    <div className="h-full -m-4 flex flex-col theme-gradient text-white rounded-b-[inherit] p-4" style={{ containerType: 'inline-size' }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-[clamp(0.625rem,3.5cqi,0.75rem)] uppercase tracking-wider text-white/80">Gesamtschnitt</div>
        <span className={cn('chip', trend === 'up'
          ? 'bg-emerald-400/30 text-white border-emerald-200/40'
          : trend === 'down'
          ? 'bg-rose-400/30 text-white border-rose-200/40'
          : 'bg-white/15 text-white border-white/20')}>
          {trend === 'up' ? <TrendingUp className="size-3.5" /> : trend === 'down' ? <TrendingDown className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {trend === 'up' ? 'Besser' : trend === 'down' ? 'Schlechter' : 'Stabil'}
        </span>
      </div>
      <div className="flex-1 flex items-center gap-3 mt-2 min-h-0 min-w-0">
        <div className="bg-white/15 rounded-3xl p-2 h-full aspect-square flex-shrink-0 max-h-full">
          <AverageRing value={overall} system={system} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="text-white/80 text-[clamp(0.625rem,3.5cqi,0.875rem)]">alle Fächer</div>
          <div className="font-display font-bold text-[clamp(1.25rem,9cqi,2rem)] mt-1 leading-tight">{formatAverage(overall, system, settings?.averageDigits ?? 2)}</div>
          <Link to="/noten" className="mt-2 inline-flex items-center gap-1 text-white/95 hover:text-white text-[clamp(0.625rem,3cqi,0.875rem)] font-semibold">
            Details <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function GradeTrendWidget() {
  const { grades, subjects, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const system = settings?.system ?? 'bayern';
  const systemMeta = getSystemMeta(system, config);

  const chartData = useMemo(() => {
    const sorted = [...grades].filter(g => !g.isPending).sort((a, b) => a.date - b.date);
    if (!sorted.length) return [];
    let runSum = 0; let runW = 0;
    return sorted.map(g => {
      const subj = subjects.find(s => s.id === g.subjectId);
      const w = effectiveWeight(g, subj, config);
      runSum += g.value * w; runW += w;
      const d = new Date(g.date);
      return { date: `${d.getDate()}.${d.getMonth() + 1}.`, avg: runSum / runW };
    });
  }, [grades, subjects, config]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Notenverlauf</h3>
        <span className="chip">Laufender Schnitt</span>
      </div>
      <div className="flex-1 -mx-2 min-h-0">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--theme-primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--theme-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis reversed={systemMeta.goodIsLow} domain={[systemMeta.min, systemMeta.max]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={30} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }}
                formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v))}
              />
              <Area type="monotone" dataKey="avg" stroke="var(--theme-primary)" strokeWidth={2.5} fill="url(#dashGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full grid place-items-center text-ink-400 text-sm">Noch zu wenige Noten</div>
        )}
      </div>
    </div>
  );
}

function TimelineWidget() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Calendar className="size-5" />Heute · {WEEKDAYS_DE[new Date().getDay()]}</h3>
        <Link to="/stundenplan" className="text-sm text-theme-deep font-semibold hover:underline">Stundenplan</Link>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <TodayTimeline />
      </div>
    </div>
  );
}

function TasksTodayWidget() {
  const { subjects, tasks } = useStore();
  const todayTasks = useMemo(() =>
    tasks.filter(t => !t.done && t.dueDate && daysUntil(t.dueDate) <= 1),
    [tasks]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Heute fällig</h3>
        <Link to="/aufgaben" className="text-sm text-theme-deep font-semibold hover:underline">Alle</Link>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {todayTasks.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500">Nichts dringend. 🌿</div>
        ) : (
          <ul className="divide-y divide-white/50 -mx-1">
            {todayTasks.map(t => {
              const subj = subjects.find(s => s.id === t.subjectId);
              return (
                <li key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                  <button onClick={() => useStore.getState().toggleTask(t.id)} className="text-ink-400 hover:text-emerald-500 flex-shrink-0">
                    {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-800 truncate">{t.title}</div>
                    <div className="text-xs text-ink-500 flex items-center gap-2">
                      {subj && <span className="size-2 rounded-full flex-shrink-0" style={{ background: subj.color }} />}
                      <span className="truncate">{subj?.name ?? 'Ohne Fach'}</span>
                      {t.dueDate && <span className="flex-shrink-0">· {relativeDate(t.dueDate)}</span>}
                    </div>
                  </div>
                  <span className={cn('chip text-[10px] flex-shrink-0',
                    t.priority === 3 ? 'bg-rose-100 text-rose-600 border-rose-200' :
                    t.priority === 2 ? 'bg-amber-100 text-amber-700 border-amber-200' : '')}>
                    {t.priority === 3 ? 'Hoch' : t.priority === 2 ? 'Normal' : 'Niedrig'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecentGradesWidget({ onEditGrade }: { onEditGrade: (g: Grade) => void }) {
  const { subjects, grades } = useStore();
  const recentGrades = useMemo(() =>
    [...grades].filter(g => !g.isPending).sort((a, b) => b.date - a.date).slice(0, 6),
    [grades]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Letzte Noten</h3>
        <Link to="/noten" className="text-sm text-theme-deep font-semibold hover:underline">Alle</Link>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {recentGrades.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500">Noch keine Noten.</div>
        ) : (
          <ul className="divide-y divide-white/50 -mx-1">
            {recentGrades.map(g => {
              const subj = subjects.find(s => s.id === g.subjectId);
              if (!subj) return null;
              return (
                <li key={g.id}>
                  <button
                    onClick={() => onEditGrade(g)}
                    className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-white/40 rounded-xl transition text-left"
                  >
                    <GradeBadge value={g.value} system={subj.system} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-800 truncate">{subj.name}</div>
                      <div className="text-xs text-ink-500 truncate">{g.title ?? g.kind} · {relativeDate(g.date)}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingGradesWidget({ onEditGrade }: { onEditGrade: (g: Grade) => void }) {
  const { subjects, grades } = useStore();
  const pendingGrades = useMemo(() =>
    grades.filter(g => g.isPending).sort((a, b) => a.date - b.date).slice(0, 5),
    [grades]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Ausstehende Noten</h3>
        <span className="chip">{pendingGrades.length}</span>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {pendingGrades.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500">Keine Termine notiert.</div>
        ) : (
          <ul className="divide-y divide-white/50 -mx-1">
            {pendingGrades.map(g => {
              const subj = subjects.find(s => s.id === g.subjectId);
              if (!subj) return null;
              const d = daysUntil(g.date);
              return (
                <li key={g.id}>
                  <button
                    onClick={() => onEditGrade(g)}
                    className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-white/40 rounded-xl transition text-left"
                  >
                    <div className="size-9 rounded-xl grid place-items-center text-white font-bold text-xs flex-shrink-0" style={{ background: subj.color }}>{subj.short}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-800 truncate">{g.title ?? subj.name}</div>
                      <div className="text-xs text-ink-500">{subj.name}</div>
                    </div>
                    <span className={cn('chip text-[10px] flex-shrink-0',
                      d <= 3 ? 'bg-rose-100 text-rose-600 border-rose-200' :
                      d <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200' : '')}>
                      {relativeDate(g.date)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function GradeDistributionWidget() {
  const { grades, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const system = settings?.system ?? 'bayern';
  const systemMeta = getSystemMeta(system, config);

  const pieData = useMemo(() => {
    const realGrades = grades.filter(g => !g.isPending);
    const counts = new Map<number, number>();
    realGrades.forEach(g => counts.set(g.value, (counts.get(g.value) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        name: systemMeta.formatValue(value).replace(' P', ''),
        rawValue: value,
        value: count,
        fill: gradeColor(value, system, config),
      }))
      .sort((a, b) => systemMeta.goodIsLow ? a.rawValue - b.rawValue : b.rawValue - a.rawValue);
  }, [grades, system, config, systemMeta]);

  return (
    <div className="h-full flex flex-col">
      <h3 className="h3 mb-2 flex-shrink-0">Notenverteilung</h3>
      <div className="flex-1 min-h-0">
        {pieData.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500">Noch keine Noten.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="48%"
                outerRadius="65%"
                label={({ name, percent }: { name?: string; percent?: number }) => (percent ?? 0) > 0.05 ? `${name} (${Math.round((percent ?? 0) * 100)}%)` : ''}
                labelLine={false}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }}
                formatter={(v: unknown, name: unknown) => [`${v}×`, `Note ${name}`]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SubjectsWidget() {
  const { subjects, grades, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Fächer</h3>
        <Link to="/noten" className="text-sm text-theme-deep font-semibold hover:underline">Alle Noten</Link>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {subjects.map(s => {
            const avg = subjectAverage(grades, s, config);
            return (
              <Link key={s.id} to={`/noten/${s.id}`}
                className="relative rounded-2xl overflow-hidden p-3 text-white shadow-soft transition hover:-translate-y-0.5">
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` }} />
                <div className="relative">
                  <div className="text-[10px] opacity-80">{s.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'}</div>
                  <div className="font-display font-bold text-sm mt-0.5 truncate">{s.name}</div>
                  <div className="mt-1 text-xl font-display font-extrabold">{formatAverage(avg, s.system, settings?.averageDigits ?? 2)}</div>
                </div>
              </Link>
            );
          })}
          {subjects.length === 0 && (
            <Link to="/einstellungen"
              className="col-span-2 rounded-2xl border-2 border-dashed border-ink-200 grid place-items-center p-4 text-ink-500 hover:text-ink-700">
              <span className="flex items-center gap-2"><Plus className="size-4" /> Fach anlegen</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Widget router ─────────────────────────────────────────────────────────────

function WidgetRouter({
  type, onEditGrade, onOpenTask,
}: {
  type: WidgetType;
  onEditGrade: (g: Grade) => void;
  onOpenTask: (kind?: TaskKind) => void;
}) {
  switch (type) {
    case 'grade-overview':     return <GradeOverviewWidget />;
    case 'grade-trend':        return <GradeTrendWidget />;
    case 'timeline':           return <TimelineWidget />;
    case 'tasks-today':        return <TasksTodayWidget />;
    case 'recent-grades':      return <RecentGradesWidget onEditGrade={onEditGrade} />;
    case 'pending-grades':     return <PendingGradesWidget onEditGrade={onEditGrade} />;
    case 'grade-distribution': return <GradeDistributionWidget />;
    case 'subjects':           return <SubjectsWidget />;
  }
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const parsed = JSON.parse(raw); if (parsed?.length) return parsed as T; }
  } catch { /* ignore */ }
  return fallback;
}

export function Dashboard() {
  const { settings, grades, subjects, tasks } = useStore();

  const [editMode, setEditMode] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; kind?: TaskKind }>({ open: false });
  const [gradeDialog, setGradeDialog] = useState<{ open: boolean; initial?: Grade }>({ open: false });

  const [widgets, setWidgets] = useState<WidgetInstance[]>(() =>
    loadFromStorage(WIDGETS_KEY, DEFAULT_WIDGETS));

  const [layout, setLayout] = useState<LayoutItem[]>(() =>
    loadFromStorage(LAYOUT_KEY, DEFAULT_LAYOUT));

  const { width, containerRef } = useContainerWidth();

  const handleLayoutChange = useCallback((newLayout: readonly LayoutItem[]) => {
    const arr = [...newLayout];
    setLayout(arr);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(arr));
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets(w => { const n = w.filter(x => x.id !== id); localStorage.setItem(WIDGETS_KEY, JSON.stringify(n)); return n; });
    setLayout(l => { const n = l.filter(x => x.i !== id); localStorage.setItem(LAYOUT_KEY, JSON.stringify(n)); return n; });
  }, []);

  const addWidget = useCallback((type: WidgetType) => {
    const id = `w-${type}-${Date.now()}`;
    const { w, h } = WIDGET_META[type].defaultSize;
    const maxY = layout.length ? Math.max(...layout.map(l => l.y + l.h)) : 0;
    const newItem: LayoutItem = { i: id, x: 0, y: maxY, w, h, minW: 3, minH: 4 };
    const nextW = [...widgets, { id, type }];
    const nextL = [...layout, newItem];
    setWidgets(nextW); setLayout(nextL);
    localStorage.setItem(WIDGETS_KEY, JSON.stringify(nextW));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(nextL));
  }, [widgets, layout]);

  const resetLayout = useCallback(() => {
    setWidgets([...DEFAULT_WIDGETS]);
    setLayout([...DEFAULT_LAYOUT]);
    localStorage.setItem(WIDGETS_KEY, JSON.stringify(DEFAULT_WIDGETS));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(DEFAULT_LAYOUT));
  }, []);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const style = settings?.dashboardGreetingStyle ?? 'casual';
    if (style === 'formal') return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    if (style === 'fun') return h < 11 ? 'Aufstehen' : h < 13 ? 'Mittag' : h < 18 ? 'Yo' : 'Feierabend';
    return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  }, [settings?.dashboardGreetingStyle]);

  const quickButtons = settings?.quickButtons ?? ['todo', 'hausaufgabe', 'test'];
  const activeTypes = new Set(widgets.map(w => w.type));
  const availableToAdd = (Object.keys(WIDGET_META) as WidgetType[]).filter(t => !activeTypes.has(t));

  const handleEditGrade = useCallback((g: Grade) => setGradeDialog({ open: true, initial: g }), []);
  const handleOpenTask = useCallback((kind?: TaskKind) => setTaskDialog({ open: true, kind }), []);

  return (
    <PageShell
      title={`${greeting}${settings?.name ? `, ${settings.name}` : ''} 👋`}
      subtitle={
        subjects.length
          ? `${subjects.length} Fächer · ${grades.filter(g => !g.isPending).length} Noten · ${tasks.filter(t => !t.done).length} offene Aufgaben`
          : 'Lege dein erstes Fach an um loszulegen.'
      }
      actions={
        <>
          {!editMode && quickButtons.map(k => QUICK_BUTTON_META[k] && (
            <button key={k} className="btn-ghost" onClick={() => setTaskDialog({ open: true, kind: k })}>
              {QUICK_BUTTON_META[k].icon}
              <span className="hidden sm:inline">{QUICK_BUTTON_META[k].label}</span>
            </button>
          ))}
          <button
            className={editMode ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setEditMode(e => !e)}
          >
            <Pencil className="size-4" />
            <span className="hidden sm:inline">{editMode ? 'Fertig' : 'Bearbeiten'}</span>
          </button>
          {!editMode && (
            <button className="btn-primary" onClick={() => setGradeDialog({ open: true })}>
              <Plus className="size-4" />Note
            </button>
          )}
        </>
      }
    >
      <div ref={containerRef}>
        <GridLayout
          width={width ?? 800}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          gridConfig={{ cols: 12, rowHeight: 52, margin: [8, 8] }}
          dragConfig={{ enabled: editMode, handle: '.drag-handle' }}
          resizeConfig={{ enabled: editMode, handles: ['se'] }}
          autoSize
        >
          {widgets.map(w => (
            <div key={w.id}>
              <WidgetShell
                editMode={editMode}
                onRemove={() => removeWidget(w.id)}
                title={WIDGET_META[w.type].label}
              >
                <WidgetRouter
                  type={w.type}
                  onEditGrade={handleEditGrade}
                  onOpenTask={handleOpenTask}
                />
              </WidgetShell>
            </div>
          ))}
        </GridLayout>
      </div>

      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="mt-2 rounded-2xl border border-ink-100 bg-white/70 backdrop-blur p-4 shadow-soft"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="h3">Widget hinzufügen</h3>
              <button onClick={resetLayout} className="text-xs text-ink-400 hover:text-ink-700 underline">
                Layout zurücksetzen
              </button>
            </div>
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-1">Alle Widgets sind aktiv.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableToAdd.map(type => {
                  const Icon = WIDGET_META[type].icon;
                  return (
                    <button key={type} onClick={() => addWidget(type)}
                      className="btn btn-ghost flex items-center gap-2 text-sm">
                      <Icon className="size-4" />
                      {WIDGET_META[type].label}
                      <Plus className="size-3.5 text-ink-400" />
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TaskDialog open={taskDialog.open} onClose={() => setTaskDialog({ open: false })} defaultKind={taskDialog.kind} />
      <GradeDialog open={gradeDialog.open} onClose={() => setGradeDialog({ open: false })} initial={gradeDialog.initial} />
    </PageShell>
  );
}
