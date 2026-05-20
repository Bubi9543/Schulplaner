import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Plus, ListTodo, GraduationCap, NotebookPen, CheckCircle2, Circle, TrendingUp, TrendingDown, Sparkles, ArrowRight, Briefcase, FileText, Calendar } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { GradeBadge } from '@/components/GradeBadge';
import { AverageRing } from '@/components/AverageRing';
import { TodayTimeline } from '@/components/TodayTimeline';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { useStore } from '@/store/useStore';
import { effectiveWeight, formatAverage, gradeTrend, overallAverage, subjectAverage, getSystemMeta } from '@/lib/grading';
import { daysUntil, relativeDate, WEEKDAYS_DE } from '@/lib/utils';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { TaskKind } from '@/types';

const QUICK_BUTTON_META: Record<TaskKind, { label: string; icon: React.ReactNode }> = {
  todo: { label: 'Todo', icon: <ListTodo className="size-4" /> },
  hausaufgabe: { label: 'Hausaufgabe', icon: <NotebookPen className="size-4" /> },
  test: { label: 'Test', icon: <GraduationCap className="size-4" /> },
  schulaufgabe: { label: 'Schulaufgabe', icon: <FileText className="size-4" /> },
  projekt: { label: 'Projekt', icon: <Briefcase className="size-4" /> },
};

export function Dashboard() {
  const { settings, subjects, grades, tasks } = useStore();
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; kind?: TaskKind }>({ open: false });
  const [gradeDialog, setGradeDialog] = useState(false);

  const system = settings?.system ?? 'bayern';
  const systemMeta = getSystemMeta(system, config);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const style = settings?.dashboardGreetingStyle ?? 'casual';
    if (style === 'formal') {
      if (h < 11) return 'Guten Morgen';
      if (h < 18) return 'Guten Tag';
      return 'Guten Abend';
    }
    if (style === 'fun') {
      if (h < 11) return 'Aufstehen';
      if (h < 13) return 'Mittag';
      if (h < 18) return 'Yo';
      return 'Feierabend';
    }
    if (h < 11) return 'Guten Morgen';
    if (h < 18) return 'Hallo';
    return 'Guten Abend';
  }, [settings?.dashboardGreetingStyle]);

  const subjFor = (gid: string) => subjects.find(s => s.id === gid);
  const overall = useMemo(() => overallAverage(grades, subjects, config), [grades, subjects, config]);
  const trend = useMemo(() => gradeTrend(grades, g => subjFor(g.subjectId), config, settings?.trendThreshold ?? 0.2), [grades, subjects, config, settings?.trendThreshold]);

  const recentGrades = useMemo(() => [...grades].filter(g => !g.isPending).sort((a, b) => b.date - a.date).slice(0, 5), [grades]);
  const pendingGrades = useMemo(() => grades.filter(g => g.isPending).sort((a, b) => a.date - b.date).slice(0, 4), [grades]);

  const openTasks = useMemo(() => tasks.filter(t => !t.done).slice(0, 6), [tasks]);
  const todayTasks = useMemo(() => openTasks.filter(t => t.dueDate && daysUntil(t.dueDate) <= 1), [openTasks]);

  const chartData = useMemo(() => {
    const sorted = [...grades].filter(g => !g.isPending).sort((a, b) => a.date - b.date);
    if (!sorted.length) return [];
    let runSum = 0; let runW = 0;
    return sorted.map(g => {
      const w = effectiveWeight(g, subjFor(g.subjectId), config);
      runSum += g.value * w;
      runW += w;
      const d = new Date(g.date);
      const key = `${d.getDate()}.${d.getMonth() + 1}.`;
      return { date: key, avg: runSum / runW };
    });
  }, [grades, subjects, config]);

  const accent = settings?.accent ?? 'indigo';
  const quickButtons = settings?.quickButtons ?? ['todo', 'hausaufgabe', 'test'];

  return (
    <PageShell
      accent="blue"
      title={`${greeting}${settings?.name ? `, ${settings.name}` : ''} 👋`}
      subtitle={subjects.length ? `${subjects.length} Fächer · ${grades.filter(g => !g.isPending).length} Noten · ${tasks.filter(t => !t.done).length} offene Aufgaben` : 'Lege dein erstes Fach an um loszulegen.'}
      actions={
        <>
          {quickButtons.map(k => QUICK_BUTTON_META[k] && (
            <button key={k} className="btn-ghost" onClick={() => setTaskDialog({ open: true, kind: k })}>
              {QUICK_BUTTON_META[k].icon}
              <span className="hidden sm:inline">{QUICK_BUTTON_META[k].label}</span>
            </button>
          ))}
          <button className="btn-primary" onClick={() => setGradeDialog(true)}><Plus className="size-4" />Note</button>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card delay={0} className="col-span-12 md:col-span-5 lg:col-span-4 !p-6 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white border-0">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-white/80">Gesamtschnitt</div>
            <span className={`chip ${trend === 'up' ? 'bg-emerald-400/30 text-white border-emerald-200/40' : trend === 'down' ? 'bg-rose-400/30 text-white border-rose-200/40' : 'bg-white/15 text-white border-white/20'}`}>
              {trend === 'up' ? <TrendingUp className="size-3.5" /> : trend === 'down' ? <TrendingDown className="size-3.5" /> : <Sparkles className="size-3.5" />}
              {trend === 'up' ? 'Trend besser' : trend === 'down' ? 'Trend schlechter' : 'Stabil'}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="bg-white/15 rounded-3xl p-3">
              <AverageRing value={overall} system={system} size={120} />
            </div>
            <div className="text-sm">
              <div className="text-white/80">über alle Fächer</div>
              <div className="font-display font-bold text-2xl mt-1">{formatAverage(overall, system, settings?.averageDigits ?? 2)}</div>
              <Link to="/noten" className="mt-3 inline-flex items-center gap-1 text-white/95 hover:text-white text-sm font-semibold">
                Detail ansehen <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        <Card delay={0.05} className="col-span-12 md:col-span-7 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="h3">Notenverlauf</h3>
            <span className="chip">Laufender Schnitt</span>
          </div>
          <div className="h-44 mt-2 -mx-2">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis reversed={systemMeta.goodIsLow} domain={[systemMeta.min, systemMeta.max]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }} formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v))} labelFormatter={l => `${l}`} />
                  <Area type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} fill="url(#dashGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-ink-400 text-sm">Noch zu wenige Noten – füge welche hinzu!</div>
            )}
          </div>
        </Card>

        <Card delay={0.1} className="col-span-12 md:col-span-7">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3 flex items-center gap-2"><Calendar className="size-5" />Heute · {WEEKDAYS_DE[new Date().getDay()]}</h3>
            <Link to="/stundenplan" className="text-sm text-indigo-600 font-semibold hover:underline">Stundenplan</Link>
          </div>
          <TodayTimeline />
        </Card>

        <Card delay={0.15} className="col-span-12 md:col-span-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Heute fällig</h3>
            <Link to="/aufgaben" className="text-sm text-indigo-600 font-semibold hover:underline">Alle</Link>
          </div>
          {todayTasks.length === 0 ? (
            <div className="text-center py-5 text-sm text-ink-500">Nichts dringend. 🌿</div>
          ) : (
            <ul className="divide-y divide-white/50 -mx-1">
              {todayTasks.map(t => {
                const subj = subjects.find(s => s.id === t.subjectId);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                    <button onClick={() => useStore.getState().toggleTask(t.id)} className="text-ink-400 hover:text-emerald-500">
                      {t.done ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-800 truncate">{t.title}</div>
                      <div className="text-xs text-ink-500 flex items-center gap-2">
                        {subj && <span className="size-2 rounded-full" style={{ background: subj.color }} />}
                        {subj?.name ?? 'Ohne Fach'}
                        {t.dueDate && <span>· {relativeDate(t.dueDate)}</span>}
                      </div>
                    </div>
                    <span className={`chip text-[10px] ${t.priority === 3 ? 'bg-rose-100 text-rose-600 border-rose-200' : t.priority === 2 ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}`}>
                      {t.priority === 3 ? 'Hoch' : t.priority === 2 ? 'Normal' : 'Niedrig'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.2} className="col-span-12 md:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Letzte Noten</h3>
            <Link to="/noten" className="text-sm text-indigo-600 font-semibold hover:underline">Alle</Link>
          </div>
          {recentGrades.length === 0 ? (
            <div className="text-center py-5 text-sm text-ink-500">Noch keine Noten eingetragen.</div>
          ) : (
            <ul className="divide-y divide-white/50 -mx-1">
              {recentGrades.map(g => {
                const subj = subjects.find(s => s.id === g.subjectId);
                if (!subj) return null;
                return (
                  <li key={g.id} className="flex items-center gap-3 px-1 py-2.5">
                    <GradeBadge value={g.value} system={subj.system} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-800 truncate">{subj.name}</div>
                      <div className="text-xs text-ink-500 truncate">{g.title ?? g.kind} · {relativeDate(g.date)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.25} className="col-span-12 md:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Ausstehende Noten</h3>
            <span className="chip">{pendingGrades.length}</span>
          </div>
          {pendingGrades.length === 0 ? (
            <div className="text-center py-5 text-sm text-ink-500">Keine Termine notiert.</div>
          ) : (
            <ul className="divide-y divide-white/50 -mx-1">
              {pendingGrades.map(g => {
                const subj = subjects.find(s => s.id === g.subjectId);
                if (!subj) return null;
                const d = daysUntil(g.date);
                return (
                  <li key={g.id} className="flex items-center gap-3 px-1 py-2.5">
                    <div className="size-9 rounded-xl grid place-items-center text-white font-bold text-xs" style={{ background: subj.color }}>{subj.short}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink-800 truncate">{g.title ?? subj.name}</div>
                      <div className="text-xs text-ink-500">{subj.name}</div>
                    </div>
                    <span className={`chip text-[10px] ${d <= 3 ? 'bg-rose-100 text-rose-600 border-rose-200' : d <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}`}>
                      {relativeDate(g.date)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.3} className="col-span-12">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Fächer im Überblick</h3>
            <Link to="/noten" className="text-sm text-indigo-600 font-semibold hover:underline">Alle Noten</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {subjects.map(s => {
              const avg = subjectAverage(grades, s, config);
              return (
                <Link key={s.id} to={`/noten/${s.id}`} className="group relative rounded-2xl overflow-hidden p-3 text-white shadow-soft transition hover:-translate-y-0.5">
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` }} />
                  <div className="relative">
                    <div className="text-[10px] opacity-80">{s.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'}</div>
                    <div className="font-display font-bold text-base mt-0.5 truncate">{s.name}</div>
                    <div className="mt-2 text-2xl font-display font-extrabold">{formatAverage(avg, s.system, settings?.averageDigits ?? 2)}</div>
                  </div>
                </Link>
              );
            })}
            {subjects.length === 0 && (
              <Link to="/einstellungen" className="rounded-2xl border-2 border-dashed border-ink-200 grid place-items-center p-6 text-ink-500 hover:text-ink-700">
                <span className="flex items-center gap-2"><Plus className="size-4" /> Fach anlegen</span>
              </Link>
            )}
          </div>
        </Card>
      </div>

      <TaskDialog open={taskDialog.open} onClose={() => setTaskDialog({ open: false })} defaultKind={taskDialog.kind} />
      <GradeDialog open={gradeDialog} onClose={() => setGradeDialog(false)} />
      {/* avoid lint warnings */}
      <div className="hidden" aria-hidden>{accent}</div>
    </PageShell>
  );
}
