import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import type { LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import {
  Plus, ListTodo, GraduationCap, NotebookPen, CheckCircle2, Circle,
  TrendingUp, TrendingDown, Sparkles, ArrowRight, Briefcase, FileText,
  Calendar, GripHorizontal, X, Award, Clock, BookOpen, BarChart2, Pencil,
  Target, Trophy, Layers, AlertTriangle, Palmtree, Loader2, Flame, Zap, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageShell } from '@/components/PageShell';
import { GradeBadge } from '@/components/GradeBadge';
import { SubjectIcon } from '@/components/SubjectIcon';
import { TodayTimeline } from '@/components/TodayTimeline';
import { StudyLeaderboard } from '@/components/StudyLeaderboard';
import { startOfISOWeek } from '@/lib/studyShare';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { GradeDetailDialog } from '@/components/dialogs/GradeDetailDialog';
import { useStore } from '@/store/useStore';
import {
  effectiveWeight, formatAverage, gradeTrend, overallAverage,
  subjectAverage, getSystemMeta, gradeColor, CATEGORY_LABEL, getTaskKindLabel, getKindLabel,
} from '@/lib/grading';
import { cn, daysUntil, relativeDate, WEEKDAYS_DE } from '@/lib/utils';
import { chartTooltipProps } from '@/lib/chartTheme';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { Grade, TaskKind, AppTask } from '@/types';


// ─── Widget system ─────────────────────────────────────────────────────────────

type WidgetType =
  | 'grade-overview'
  | 'grade-trend'
  | 'timeline'
  | 'tasks-today'
  | 'recent-grades'
  | 'pending-grades'
  | 'grade-distribution'
  | 'subjects'
  | 'upcoming-exams'
  | 'subject-leaderboard'
  | 'weekly-progress'
  | 'group-averages'
  | 'next-holiday'
  | 'focus-stats'
  | 'study-leaderboard';

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
  'upcoming-exams':     { label: 'Anstehende Klausuren', icon: Target,      defaultSize: { w: 6, h: 7 } },
  'subject-leaderboard':{ label: 'Top & Flop Fächer',    icon: Trophy,      defaultSize: { w: 6, h: 7 } },
  'weekly-progress':    { label: 'Wochenfortschritt',    icon: CheckCircle2, defaultSize: { w: 5, h: 6 } },
  'group-averages':     { label: 'Schnitt pro Gruppe',   icon: Layers,      defaultSize: { w: 6, h: 6 } },
  'next-holiday':       { label: 'Nächste Ferien',       icon: Palmtree,    defaultSize: { w: 5, h: 5 } },
  'focus-stats':        { label: 'Lernzeit',             icon: Flame,       defaultSize: { w: 5, h: 5 } },
  'study-leaderboard':  { label: 'Lern-Rangliste',       icon: Users,       defaultSize: { w: 5, h: 7 } },
};

const QUICK_BUTTON_META: Record<string, { label: string; icon: React.ReactNode }> = {
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
      <div className="flex-1 overflow-hidden widget-content">
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
  const gradeCount = grades.filter(g => !g.isPending).length;

  const delta = useMemo(() => {
    const sorted = [...grades].filter(g => !g.isPending).sort((a, b) => a.date - b.date);
    if (sorted.length < 2) return null;
    const half = Math.floor(sorted.length / 2) || 1;
    const olderAvg = overallAverage(sorted.slice(0, half), subjects, config);
    const newerAvg = overallAverage(sorted.slice(half), subjects, config);
    if (olderAvg == null || newerAvg == null) return null;
    return newerAvg - olderAvg;
  }, [grades, subjects, config]);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Sparkles;
  const DeltaIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : ArrowRight;

  return (
    <div className="h-full w-full flex flex-col theme-gradient text-white widget-pad relative overflow-hidden">
      <div className="absolute -top-16 -right-16 size-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-10 size-40 rounded-full bg-black/15 blur-3xl pointer-events-none" />
      {/* Header row */}
      <div className="flex items-center justify-between flex-shrink-0 relative">
        <div className="text-[clamp(0.625rem,3.5cqi,0.75rem)] uppercase tracking-[0.12em] font-semibold text-white/80">Gesamtschnitt</div>
        <span className={cn('chip',
          trend === 'up' ? 'bg-emerald-400/30 text-white border-emerald-200/40' :
          trend === 'down' ? 'bg-rose-400/30 text-white border-rose-200/40' :
          'bg-white/20 text-white border-white/25')}>
          <TrendIcon className="size-3.5" />
          {trend === 'up' ? 'Besser' : trend === 'down' ? 'Schlechter' : 'Stabil'}
        </span>
      </div>
      {/* Big number + delta */}
      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
        {overall != null ? (
          <>
            <div className="font-display font-extrabold leading-none text-[clamp(2.75rem,16cqi,4.5rem)] drop-shadow-sm">
              {formatAverage(overall, system)}
            </div>
            {delta != null && (
              <div className="flex items-center gap-1 mt-1.5 text-white/75 text-[clamp(0.625rem,3.5cqi,0.875rem)] font-semibold">
                <DeltaIcon className="size-3.5" />
                <span>{formatAverage(Math.abs(delta), system, 2)}</span>
                <span className="text-white/50 font-normal">seit Halbjahr</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-white/50 text-[clamp(0.75rem,4cqi,1rem)] text-center px-2">Noch keine Noten</div>
        )}
      </div>
      {/* Footer row */}
      <div className="flex items-center justify-between flex-shrink-0 relative">
        <div className="text-white/70 text-[clamp(0.6rem,3cqi,0.8rem)]">
          {subjects.length} {subjects.length === 1 ? 'Fach' : 'Fächer'} · {gradeCount} {gradeCount === 1 ? 'Note' : 'Noten'}
        </div>
        <Link to="/noten" className="inline-flex items-center gap-1 text-white/95 hover:text-white text-[clamp(0.625rem,2.8cqi,0.875rem)] font-semibold border-b border-white/40 hover:border-white/80 pb-0.5">
          Details <ArrowRight className="size-3.5" />
        </Link>
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
    <div className="h-full flex flex-col widget-pad">
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
                {...chartTooltipProps}
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
    <div className="h-full flex flex-col widget-pad">
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

function TasksTodayWidget({ onSelectTask }: { onSelectTask: (t: AppTask) => void }) {
  const { subjects, tasks } = useStore();
  const todayTasks = useMemo(() =>
    // Nur heute oder morgen fällig – Überfällige bewusst NICHT, damit das
    // Dashboard aufgeräumt bleibt. Die landen in der Aufgaben-Liste unter
    // "Überfällig".
    tasks.filter(t => {
      if (t.done || !t.dueDate) return false;
      const d = daysUntil(t.dueDate);
      return d >= 0 && d <= 1;
    }),
    [tasks]);

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3">Heute fällig</h3>
        <Link to="/aufgaben" className="text-sm text-theme-deep font-semibold hover:underline">Alle</Link>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {todayTasks.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500"><span className="inline-flex items-center gap-1.5"><Palmtree className="size-4 text-ink-400" />Nichts dringend.</span></div>
        ) : (
          <ul className="divide-y divide-white/50 -mx-1">
            {todayTasks.map(t => {
              const subj = subjects.find(s => s.id === t.subjectId);
              return (
                <li key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); useStore.getState().toggleTask(t.id); }}
                    className="text-ink-400 hover:text-emerald-500 flex-shrink-0"
                  >
                    {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
                  </button>
                  <button onClick={() => onSelectTask(t)} className="flex-1 min-w-0 text-left">
                    <div className="font-medium text-ink-800 truncate">{t.title}</div>
                    <div className="text-xs text-ink-500 flex items-center gap-2">
                      {subj && <span className="size-2 rounded-full flex-shrink-0" style={{ background: subj.color }} />}
                      <span className="truncate">{subj?.name ?? 'Ohne Fach'}</span>
                      {t.dueDate && <span className="flex-shrink-0">· {relativeDate(t.dueDate)}</span>}
                    </div>
                  </button>
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

function RecentGradesWidget({ onSelectGrade }: { onSelectGrade: (g: Grade) => void }) {
  const { subjects, grades } = useStore();
  const recentGrades = useMemo(() =>
    [...grades].filter(g => !g.isPending).sort((a, b) => b.date - a.date).slice(0, 6),
    [grades]);

  return (
    <div className="h-full flex flex-col widget-pad">
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
                    onClick={() => onSelectGrade(g)}
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

function PendingGradesWidget({ onSelectGrade }: { onSelectGrade: (g: Grade) => void }) {
  const { subjects, grades } = useStore();
  const pendingGrades = useMemo(() =>
    grades.filter(g => g.isPending).sort((a, b) => a.date - b.date).slice(0, 5),
    [grades]);

  return (
    <div className="h-full flex flex-col widget-pad">
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
                    onClick={() => onSelectGrade(g)}
                    className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-white/40 rounded-xl transition text-left"
                  >
                    <div className="size-9 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: subj.color }}><SubjectIcon subject={subj} className="size-4" /></div>
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
    <div className="h-full flex flex-col widget-pad">
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
                {...chartTooltipProps}
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
    <div className="h-full flex flex-col widget-pad">
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
                  <div className="text-[10px] opacity-80">{CATEGORY_LABEL[s.category]}</div>
                  <div className="font-display font-bold text-sm mt-0.5 truncate">{s.name}</div>
                  <div className="mt-1 text-xl font-display font-extrabold">{formatAverage(avg, s.system, settings?.averageDigits ?? 2)}</div>
                </div>
              </Link>
            );
          })}
          {subjects.length === 0 && (
            <Link to="/einstellungen?section=subjects"
              className="col-span-2 rounded-2xl border-2 border-dashed border-ink-200 grid place-items-center p-4 text-ink-500 hover:text-ink-700">
              <span className="flex items-center gap-2"><Plus className="size-4" /> Fach anlegen</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Neue Widgets ──────────────────────────────────────────────────────────

/**
 * Anstehende Klausuren/Tests-Countdown. Sammelt:
 * - alle ausstehenden (pending) Noten – Schulaufgabe, Klausur, Stegreif/Test
 *   und eigene Notenarten (= geplante benotete Prüfungen)
 * - Tasks vom Typ test/schulaufgabe mit dueDate
 * Sortiert nach Datum, zeigt alle (scrollbar) mit „in X Tagen"-Pille.
 */
function UpcomingExamsWidget({
  onSelectGrade, onSelectTask,
}: {
  onSelectGrade: (g: Grade) => void;
  onSelectTask: (t: AppTask) => void;
}) {
  const { subjects, grades, tasks, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;

  const items = useMemo(() => {
    const out: Array<{ kind: 'grade' | 'task'; date: number; title: string; subjectId?: string; raw: Grade | AppTask }> = [];
    const now = Date.now();
    for (const g of grades) {
      // Jede geplante (ausstehende) Note ist eine anstehende Prüfung – egal ob
      // Schulaufgabe, Klausur, Stegreif/Test oder eigene Notenart.
      if (g.isPending && g.date >= now - 86400000) {
        out.push({ kind: 'grade', date: g.date, title: g.title ?? getKindLabel(g.kind, config), subjectId: g.subjectId, raw: g });
      }
    }
    for (const t of tasks) {
      if (!t.done && (t.kind === 'test' || t.kind === 'schulaufgabe') && t.dueDate && t.dueDate >= now - 86400000) {
        out.push({ kind: 'task', date: t.dueDate, title: t.title, subjectId: t.subjectId, raw: t });
      }
    }
    return out.sort((a, b) => a.date - b.date);
  }, [grades, tasks, config]);

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Target className="size-5 text-rose-500" />Anstehende Klausuren</h3>
        <span className="chip">{items.length}</span>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {items.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500 text-center px-4">
            <div>
              <Palmtree className="size-5 mx-auto mb-1.5 text-ink-400" />
              Nichts in Sicht.
              <span className="block text-xs text-ink-400 mt-1">Trag geplante Klausuren als „ausstehende Note" ein.</span>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map(item => {
              const subj = subjects.find(s => s.id === item.subjectId);
              const d = daysUntil(item.date);
              const urgent = d <= 3;
              const tone = d <= 3 ? 'bg-rose-100 text-rose-700 border-rose-200'
                : d <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-emerald-100 text-emerald-700 border-emerald-200';
              return (
                <li key={`${item.kind}-${item.raw.id}`}>
                  <button
                    onClick={() => item.kind === 'grade' ? onSelectGrade(item.raw as Grade) : onSelectTask(item.raw as AppTask)}
                    className="w-full text-left rounded-2xl bg-white/70 hover:bg-white p-3 flex items-center gap-3 transition"
                  >
                    {urgent && d >= 0 && d <= 1 ? (
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="size-10 rounded-xl bg-rose-500 text-white grid place-items-center flex-shrink-0"
                      >
                        <AlertTriangle className="size-5" />
                      </motion.div>
                    ) : (
                      <div className="size-10 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: subj?.color ?? '#64748b' }}>
                        <SubjectIcon subject={subj ?? {}} className="size-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-ink-800 truncate">{item.title}</div>
                      <div className="text-xs text-ink-500 truncate">
                        {subj?.name ?? 'Ohne Fach'} · {item.kind === 'grade'
                          ? getKindLabel((item.raw as Grade).kind, config)
                          : getTaskKindLabel((item.raw as AppTask).kind, config)}
                      </div>
                    </div>
                    <span className={cn('chip text-[10px] flex-shrink-0', tone)}>
                      {d === 0 ? 'heute' : d === 1 ? 'morgen' : d < 0 ? `vor ${-d}d` : `in ${d}d`}
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

/** Top 3 + Flop 3 Fächer nach Schnitt. Springt zu Fach-Detail bei Klick. */
function SubjectLeaderboardWidget() {
  const { subjects, grades, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const digits = settings?.averageDigits ?? 2;

  const ranked = useMemo(() => {
    const withAvg = subjects
      .map(s => ({ subject: s, avg: subjectAverage(grades, s, config) }))
      .filter(x => x.avg !== null) as Array<{ subject: typeof subjects[number]; avg: number }>;
    if (withAvg.length === 0) return { top: [], flop: [] };

    // System bestimmt Sortier-Richtung: bei goodIsLow ist niedriger besser
    const firstMeta = getSystemMeta(withAvg[0].subject.system, config);
    const sorted = [...withAvg].sort((a, b) => firstMeta.goodIsLow ? a.avg - b.avg : b.avg - a.avg);
    const half = Math.min(3, Math.floor(sorted.length / 2));
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const flop = sorted.length > 3 ? sorted.slice(-Math.min(3, half || 1)).reverse() : [];
    return { top, flop };
  }, [subjects, grades, config]);

  function row(item: { subject: typeof subjects[number]; avg: number }, idx: number, kind: 'top' | 'flop') {
    return (
      <Link
        key={item.subject.id}
        to={`/noten/${item.subject.id}`}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/70 transition"
      >
        <div className={`size-6 rounded-full grid place-items-center text-[11px] font-extrabold flex-shrink-0 ${
          kind === 'top' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {idx + 1}
        </div>
        <div className="size-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: item.subject.color }}>
          <SubjectIcon subject={item.subject} className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0 text-sm font-medium text-ink-800 truncate">{item.subject.name}</div>
        <GradeBadge value={item.avg} system={item.subject.system} size="sm" />
      </Link>
    );
  }

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Trophy className="size-5 text-amber-500" />Top & Flop</h3>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {ranked.top.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500 text-center px-4">
            Noch keine Noten erfasst.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-700 mb-1 pl-1">Beste</div>
              <div className="space-y-0.5">{ranked.top.map((x, i) => row(x, i, 'top'))}</div>
            </div>
            {ranked.flop.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-rose-600 mb-1 pl-1">Brauchen Aufmerksamkeit</div>
                <div className="space-y-0.5">{ranked.flop.map((x, i) => row(x, i, 'flop'))}</div>
              </div>
            )}
            <div className="text-[10px] text-ink-400 text-center pt-1">
              Schnitt mit {digits} Nachkommastellen · Klick öffnet Fach-Detail
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Wochenfortschritt – wieviele Tasks diese Woche erledigt vs. fällig. */
function WeeklyProgressWidget() {
  const { tasks } = useStore();

  const stats = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = Mo
    const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - dow);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);

    let dueThisWeek = 0;
    let doneThisWeek = 0;
    let overdueOpen = 0;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const isInWeek = t.dueDate >= weekStart.getTime() && t.dueDate < weekEnd.getTime();
      if (isInWeek) {
        dueThisWeek++;
        if (t.done) doneThisWeek++;
      }
      if (!t.done && t.dueDate < weekStart.getTime()) overdueOpen++;
    }
    const pct = dueThisWeek > 0 ? Math.round((doneThisWeek / dueThisWeek) * 100) : 0;
    return { dueThisWeek, doneThisWeek, overdueOpen, pct };
  }, [tasks]);

  // Ring-Berechnung
  const r = 42;
  const C = 2 * Math.PI * r;
  const dash = (stats.pct / 100) * C;

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-500" />Diese Woche</h3>
        {stats.overdueOpen > 0 && (
          <span className="chip bg-rose-100 text-rose-700 border-rose-200">
            <AlertTriangle className="size-3" />{stats.overdueOpen} überfällig
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center">
        {stats.dueThisWeek === 0 ? (
          <div className="text-sm text-ink-500 text-center">
            <span className="inline-flex items-center gap-1.5"><Palmtree className="size-4 text-ink-400" />Diese Woche keine Aufgaben fällig</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
                <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(15,18,32,0.08)" strokeWidth="10" />
                <motion.circle
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${C}`}
                  className="text-emerald-500"
                  initial={{ strokeDasharray: `0 ${C}` }}
                  animate={{ strokeDasharray: `${dash} ${C}` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-display font-extrabold text-2xl text-ink-900">{stats.pct}%</div>
                <div className="text-[10px] text-ink-500 uppercase tracking-wider font-semibold">erledigt</div>
              </div>
            </div>
            <div className="text-sm text-ink-600 text-center">
              <span className="font-bold text-ink-900">{stats.doneThisWeek}</span> von <span className="font-bold text-ink-900">{stats.dueThisWeek}</span> erledigt
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Schnitt pro Fächergruppe als Bar-Chart. Wenn keine Gruppen definiert:
 * freundlicher Hinweis mit Link zu Settings.
 */
function GroupAveragesWidget() {
  const { subjects, grades, settings } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const groups = settings?.subjectGroups ?? [];
  const digits = settings?.averageDigits ?? 2;
  const system = subjects[0]?.system ?? 'bayern';
  const systemMeta = getSystemMeta(system, config);

  const data = useMemo(() => {
    if (groups.length === 0) return [];
    return groups
      .map(g => {
        const groupSubjects = subjects.filter(s => s.groupId === g.id);
        const avgs = groupSubjects.map(s => subjectAverage(grades, s, config)).filter(a => a !== null) as number[];
        if (avgs.length === 0) return null;
        const avg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
        return {
          name: g.label,
          avg: +avg.toFixed(3),
          color: gradeColor(avg, system, config),
          count: groupSubjects.length,
        };
      })
      .filter((x): x is { name: string; avg: number; color: string; count: number } => x !== null);
  }, [subjects, grades, config, groups, system]);

  if (groups.length === 0) {
    return (
      <div className="h-full flex flex-col widget-pad">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="h3 flex items-center gap-2"><Layers className="size-5 text-violet-500" />Schnitt pro Gruppe</h3>
        </div>
        <div className="flex-1 grid place-items-center text-center text-sm text-ink-500 px-4">
          Du hast noch keine Fächergruppen.<br />
          <Link to="/einstellungen?section=subjects" className="inline-flex items-center gap-1 mt-2 text-theme-deep font-semibold hover:underline">
            Anlegen in Einstellungen <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Layers className="size-5 text-violet-500" />Schnitt pro Gruppe</h3>
      </div>
      <div className="flex-1 min-h-0">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-500">Noch keine Noten in deinen Gruppen.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(15,18,32,0.06)" horizontal={false} />
              <XAxis
                type="number"
                domain={systemMeta.goodIsLow ? [systemMeta.min, systemMeta.max] : [systemMeta.min, systemMeta.max]}
                reversed={systemMeta.goodIsLow}
                stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11}
              />
              <YAxis
                type="category" dataKey="name"
                stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} width={110}
              />
              <Tooltip
                {...chartTooltipProps}
                formatter={(v: unknown) => typeof v === 'number' ? formatAverage(v, system, digits) : String(v)}
              />
              <Bar dataKey="avg" radius={[6, 6, 6, 6]}>
                {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Countdown bis zu den nächsten Ferien (oder aktive Ferien). */
function fmtCountdown(d: number): string {
  if (d === 0) return 'heute';
  if (d < 7) return `${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  const weeks = Math.floor(d / 7);
  const rem = d % 7;
  const wStr = `${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
  return rem > 0 ? `${wStr} ${rem} ${rem === 1 ? 'Tag' : 'Tage'}` : wStr;
}

/**
 * Effektiver Ferienstart: immer zurück zum vorherigen Samstag, wenn die
 * Ferien am So, Mo oder Di beginnen (So/Mo = normaler Wochenend-Vorlauf;
 * Di = Ferien starten nach einem Feiertag-Montag wie Pfingstmontag).
 */
function effectiveHolidayStart(officialStart: Date): Date {
  const d = new Date(officialStart); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 2) d.setDate(d.getDate() - 3); // Dienstag → Samstag (nach Feiertag-Mo)
  else if (dow === 1) d.setDate(d.getDate() - 2); // Montag → Samstag
  else if (dow === 0) d.setDate(d.getDate() - 1); // Sonntag → Samstag
  return d;
}

/** Wenn Ferien am Freitag oder Samstag enden → Sonntag danach dazu. */
function effectiveHolidayEnd(officialEnd: Date): Date {
  const d = new Date(officialEnd); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (dow === 5) d.setDate(d.getDate() + 2); // Freitag → Sonntag
  else if (dow === 6) d.setDate(d.getDate() + 1); // Samstag → Sonntag
  return d;
}

function NextHolidayWidget() {
  const region = useStore(s => s.settings?.region);
  const tasks = useStore(s => s.tasks);
  const config = useStore(s => s.settings?.gradingConfig);
  const [holiday, setHoliday] = useState<import('@/types').SchoolHoliday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const mod = await import('@/lib/holidays');
      if (!region) { if (!cancelled) { setHoliday(null); setLoading(false); } return; }
      try {
        const all = await mod.fetchUpcomingHolidays(region);
        if (cancelled) return;
        setHoliday(mod.getNextHoliday(all));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [region?.country, region?.subdivision]);

  if (!region || (!region.subdivision && region.country === 'DE')) {
    return (
      <div className="h-full flex flex-col widget-pad">
        <h3 className="h3 mb-2 flex-shrink-0 flex items-center gap-2"><Palmtree className="size-5 text-amber-500" />Nächste Ferien</h3>
        <div className="flex-1 grid place-items-center text-sm text-ink-500 text-center px-4">
          Wähle dein Bundesland in den Einstellungen → Profil.
          <Link to="/einstellungen?section=profile" className="block mt-2 text-theme-deep font-semibold hover:underline">
            Jetzt einrichten →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full grid place-items-center widget-pad">
        <Loader2 className="size-5 animate-spin text-theme" />
      </div>
    );
  }

  if (!holiday) {
    return (
      <div className="h-full flex flex-col widget-pad">
        <h3 className="h3 mb-2 flex-shrink-0 flex items-center gap-2"><Palmtree className="size-5 text-amber-500" />Nächste Ferien</h3>
        <div className="flex-1 grid place-items-center text-sm text-ink-500 text-center">
          Keine kommenden Ferien gefunden.
        </div>
      </div>
    );
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const officialStart = new Date(holiday.startDate); officialStart.setHours(0, 0, 0, 0);
  const officialEnd = new Date(holiday.endDate); officialEnd.setHours(0, 0, 0, 0);

  // Wochenende davor (So/Mo → Samstag) und danach (Fr/Sa → Sonntag) einbeziehen
  const effectiveStart = effectiveHolidayStart(officialStart);
  const effectiveEnd = effectiveHolidayEnd(officialEnd);

  const isActive = today >= effectiveStart && today <= effectiveEnd;
  const days = Math.round(
    (isActive ? effectiveEnd.getTime() - today.getTime() : effectiveStart.getTime() - today.getTime()) / 86_400_000
  );
  const totalDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 86_400_000) + 1;

  // Progressbar: aktiv = wie weit durch die Ferien; davor = wie nah wir rankommen (6-Wochen-Fenster)
  const COUNTDOWN_WINDOW = 42;
  const progress = isActive
    ? Math.min(1, (today.getTime() - effectiveStart.getTime()) / (effectiveEnd.getTime() - effectiveStart.getTime()))
    : Math.max(0, 1 - days / COUNTDOWN_WINDOW);

  const fmtDate = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

  // Anstehende Tests/Schulaufgaben bis Ferienstart
  const upcomingExams = !isActive
    ? tasks.filter(t =>
        !t.done &&
        t.dueDate != null &&
        t.dueDate < effectiveStart.getTime() &&
        !['hausaufgabe', 'todo'].includes(t.kind ?? '')
      )
    : [];

  const examsByKind = upcomingExams.reduce<Record<string, number>>((acc, t) => {
    const k = t.kind ?? 'sonstiges';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const examKinds = Object.entries(examsByKind).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className="h-full flex flex-col widget-pad text-white relative overflow-hidden"
      style={{ background: isActive
        ? 'linear-gradient(135deg, #10b981, #06b6d4)'
        : 'linear-gradient(135deg, #f59e0b, #ec4899)'
      }}
    >
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-10 size-32 rounded-full bg-white/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center gap-2 mb-3">
        <Palmtree className="size-4 flex-shrink-0" />
        <h3 className="font-display font-bold text-sm leading-tight">
          {isActive ? 'Ferien laufen!' : 'Nächste Ferien'}
        </h3>
      </div>

      {/* Name + Countdown */}
      <div className="relative flex-1 flex flex-col justify-center gap-1 min-h-0">
        <div className="text-[10px] uppercase tracking-widest opacity-75 font-bold">{holiday.name}</div>
        <div className="font-display font-extrabold leading-none" style={{ fontSize: 'clamp(1.6rem, 9cqi, 2.8rem)' }}>
          {isActive ? 'noch ' : ''}{fmtCountdown(days)}
        </div>
        <div className="text-xs opacity-80">
          {isActive
            ? (days === 0 ? 'Ferien enden heute' : 'bis Ferienende')
            : (days === 0 ? 'starten heute' : 'bis Ferienstart')}
        </div>

        {/* Progressbar */}
        <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="text-[10px] opacity-60 -mt-0.5">
          {isActive
            ? `${Math.round(progress * 100)} % der Ferien vorbei`
            : `${Math.round(progress * 100)} % der Wartezeit vorbei`}
        </div>

        {/* Anstehende Prüfungen */}
        {examKinds.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/20 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider opacity-75 font-bold mb-1">Bis dahin</div>
            {examKinds.map(([kind, count]) => (
              <div key={kind} className="flex items-center justify-between text-xs">
                <span className="opacity-90">{getTaskKindLabel(kind, config)}</span>
                <span className="font-bold tabular-nums">{count}</span>
              </div>
            ))}
            {examKinds.length > 1 && (
              <div className="flex items-center justify-between text-xs border-t border-white/15 pt-1 mt-1 font-semibold">
                <span className="opacity-90">Gesamt</span>
                <span className="tabular-nums">{upcomingExams.length}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Datum + Dauer */}
      <div className="relative text-[10px] opacity-70 mt-2 flex items-center justify-between">
        <span>{fmtDate(effectiveStart)} – {fmtDate(effectiveEnd)}</span>
        <span>{totalDays} {totalDays === 1 ? 'Tag' : 'Tage'}</span>
      </div>
    </div>
  );
}

/** Lernzeit-Dauer kompakt: „2 h 15 min", „45 min", „0 min". */
function fmtFocusDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const DAY_MS = 86_400_000;

/**
 * Lernzeit-Widget: Streak · Zeit · Sessions nebeneinander.
 * - Streak: Tage in Folge mit mind. einer Session (heute oder gestern als Anker).
 * - Zeit/Sessions: kumuliert für die laufende Woche (ISO, Mo–So).
 */
function FocusStatsWidget() {
  const focusSessions = useStore(s => s.focusSessions);
  const flashcards = useStore(s => s.flashcards);

  const { streak, weekMs, weekCount } = useMemo(() => {
    const now = Date.now();
    const weekStart = startOfISOWeek(now);
    let weekMs = 0, weekCount = 0;
    const daysWithSession = new Set<number>();
    const addDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); daysWithSession.add(d.getTime()); };
    for (const f of focusSessions) {
      addDay(f.startedAt);
      if (f.startedAt >= weekStart) { weekMs += f.focusedMs; weekCount++; }
    }
    // Karteikarten-Lernen zählt ebenfalls für die Streak.
    for (const c of flashcards) if (c.reviewedAt) addDay(c.reviewedAt);
    // Streak ab heute zurückzählen; wenn heute noch nichts war, gestern als Anker.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let cursor = today.getTime();
    if (!daysWithSession.has(cursor)) cursor -= DAY_MS;
    let streak = 0;
    while (daysWithSession.has(cursor)) { streak++; cursor -= DAY_MS; }
    return { streak, weekMs, weekCount };
  }, [focusSessions, flashcards]);

  const hasData = focusSessions.length > 0 || flashcards.some(c => c.reviewedAt);

  const tiles = [
    {
      icon: Flame,
      value: String(streak),
      label: streak === 1 ? 'Tag Streak' : 'Tage Streak',
      badge: 'bg-amber-500/15 text-amber-500',
    },
    {
      icon: Clock,
      value: fmtFocusDuration(weekMs),
      label: 'Diese Woche',
      badge: 'bg-sky-500/15 text-sky-500',
    },
    {
      icon: Zap,
      value: String(weekCount),
      label: weekCount === 1 ? 'Session' : 'Sessions',
      badge: 'bg-emerald-500/15 text-emerald-500',
    },
  ];

  return (
    <div className="h-full flex flex-col widget-pad">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Flame className="size-5 text-amber-500" />Lernzeit</h3>
        <Link to="/fokus" className="text-sm text-theme-deep font-semibold hover:underline">Fokus</Link>
      </div>
      {!hasData ? (
        <div className="flex-1 grid place-items-center text-center text-sm text-ink-500 px-4">
          <div>
            <Flame className="size-6 mx-auto mb-1.5 text-ink-300" />
            Noch keine Lern-Sessions.
            <Link to="/fokus" className="block mt-2 text-theme-deep font-semibold hover:underline">
              Jetzt fokussieren →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-2">
          {tiles.map(({ icon: Icon, value, label, badge }) => (
            <div key={label} className="flex flex-col items-center justify-center text-center gap-1.5 rounded-2xl p-2 bg-[rgb(var(--ink-100))]">
              <div className={cn('size-9 rounded-xl grid place-items-center flex-shrink-0', badge)}>
                <Icon className="size-[18px]" />
              </div>
              <div className="font-display font-extrabold text-ink-900 leading-none text-[clamp(0.9rem,5.5cqi,1.35rem)] tabular-nums">
                {value}
              </div>
              <div className="text-[clamp(0.6rem,3cqi,0.7rem)] text-ink-500 font-medium leading-tight">
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Wöchentliche Lern-Rangliste mit Freunden – nutzt die geteilte Komponente. */
function StudyLeaderboardWidget() {
  const focusSessions = useStore(s => s.focusSessions);
  const { weekStart, weekTotalMs } = useMemo(() => {
    const weekStart = startOfISOWeek(Date.now());
    let weekTotalMs = 0;
    for (const f of focusSessions) if (f.startedAt >= weekStart) weekTotalMs += f.focusedMs;
    return { weekStart, weekTotalMs };
  }, [focusSessions]);

  return <StudyLeaderboard weekTotalMs={weekTotalMs} weekStart={weekStart} bare delay={0} />;
}

// ─── Widget router ─────────────────────────────────────────────────────────────

function WidgetRouter({
  type, onSelectGrade, onSelectTask, onOpenTask,
}: {
  type: WidgetType;
  onSelectGrade: (g: Grade) => void;
  onSelectTask: (t: AppTask) => void;
  onOpenTask: (kind?: TaskKind) => void;
}) {
  void onOpenTask;
  switch (type) {
    case 'grade-overview':     return <GradeOverviewWidget />;
    case 'grade-trend':        return <GradeTrendWidget />;
    case 'timeline':           return <TimelineWidget />;
    case 'tasks-today':        return <TasksTodayWidget onSelectTask={onSelectTask} />;
    case 'recent-grades':      return <RecentGradesWidget onSelectGrade={onSelectGrade} />;
    case 'pending-grades':     return <PendingGradesWidget onSelectGrade={onSelectGrade} />;
    case 'grade-distribution': return <GradeDistributionWidget />;
    case 'subjects':           return <SubjectsWidget />;
    case 'upcoming-exams':     return <UpcomingExamsWidget onSelectGrade={onSelectGrade} onSelectTask={onSelectTask} />;
    case 'subject-leaderboard':return <SubjectLeaderboardWidget />;
    case 'weekly-progress':    return <WeeklyProgressWidget />;
    case 'group-averages':     return <GroupAveragesWidget />;
    case 'next-holiday':       return <NextHolidayWidget />;
    case 'focus-stats':        return <FocusStatsWidget />;
    case 'study-leaderboard':  return <StudyLeaderboardWidget />;
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
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; kind?: TaskKind; initial?: Partial<AppTask> }>({ open: false });
  const [gradeDialog, setGradeDialog] = useState<{ open: boolean; initial?: Grade }>({ open: false });
  const [taskDetail, setTaskDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [gradeDetail, setGradeDetail] = useState<{ open: boolean; grade?: Grade }>({ open: false });

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

  const handleSelectGrade = useCallback((g: Grade) => setGradeDetail({ open: true, grade: g }), []);
  const handleSelectTask = useCallback((t: AppTask) => setTaskDetail({ open: true, task: t }), []);
  const handleOpenTask = useCallback((kind?: TaskKind) => setTaskDialog({ open: true, kind }), []);

  return (
    <PageShell
      title={`${greeting}${settings?.name ? `, ${settings.name}` : ''}`}
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
                  onSelectGrade={handleSelectGrade}
                  onSelectTask={handleSelectTask}
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

      <TaskDialog
        open={taskDialog.open}
        onClose={() => setTaskDialog({ open: false })}
        defaultKind={taskDialog.kind}
        initial={taskDialog.initial}
      />
      <GradeDialog open={gradeDialog.open} onClose={() => setGradeDialog({ open: false })} initial={gradeDialog.initial} />

      {/* Detail-Anzeigen (View-Mode) - öffnen sich beim Klick auf Aufgabe/Note */}
      <TaskDetailDialog
        open={taskDetail.open}
        task={taskDetail.task}
        onClose={() => setTaskDetail({ open: false })}
        onEdit={t => {
          setTaskDetail({ open: false });
          setTaskDialog({ open: true, initial: t });
        }}
      />
      <GradeDetailDialog
        open={gradeDetail.open}
        grade={gradeDetail.grade}
        onClose={() => setGradeDetail({ open: false })}
        onEdit={g => {
          setGradeDetail({ open: false });
          setGradeDialog({ open: true, initial: g });
        }}
      />
    </PageShell>
  );
}
