import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, TrendingUp, TrendingDown, AlertTriangle, Sparkles, FileText, Loader2, Check, ChevronDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { GradeBadge } from '@/components/GradeBadge';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { effectiveWeight, formatAverage, getSystemMeta, gradeColor, gradeTrend, needsAttention, overallAverage, subjectAverage, CATEGORY_LABEL } from '@/lib/grading';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { Subject, SubjectGroup } from '@/types';

export function GradesPage() {
  const { subjects, grades, settings } = useStore();
  const schoolYears = useStore(s => s.schoolYears);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const [gradeDialog, setGradeDialog] = useState(false);
  const [subjectDialog, setSubjectDialog] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadReport() {
    if (!settings) return;
    setPdfBusy(true);
    try {
      const mod = await import('@/lib/pdfReport');
      const year = schoolYears.find(y => y.id === activeSchoolYearId) ?? null;
      await mod.generateReportPdf({ subjects, grades, settings, schoolYear: year });
    } catch (e) {
      alert('PDF-Erstellung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPdfBusy(false);
    }
  }
  const system = settings?.system ?? 'bayern';
  const meta = getSystemMeta(system, config);
  const digits = settings?.averageDigits ?? 2;

  const subjFor = (gid: string) => subjects.find(s => s.id === gid);
  const overall = useMemo(() => overallAverage(grades, subjects, config), [grades, subjects, config]);
  const trend = useMemo(() => gradeTrend(grades, g => subjFor(g.subjectId), config, settings?.trendThreshold ?? 0.2), [grades, subjects, config, settings?.trendThreshold]);

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
  const trendArrow = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';

  const attentionSubjects = useMemo(() => subjects.filter(s => needsAttention(grades, s, config)), [subjects, grades, config]);

  const rankedSubjects = useMemo(() =>
    [...subjects]
      .map(s => ({ subject: s, avg: subjectAverage(grades, s, config) }))
      .sort((a, b) => {
        if (a.avg == null && b.avg == null) return 0;
        if (a.avg == null) return 1;
        if (b.avg == null) return -1;
        return meta.goodIsLow ? a.avg - b.avg : b.avg - a.avg;
      }),
  [subjects, grades, config, meta]);

  // deselected = hidden; new subjects auto-visible
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [showOverall, setShowOverall] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  function toggleSubject(id: string) {
    setDeselectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const distribution = useMemo(() => {
    const validGrades = grades.filter(g => !g.isPending);
    if (system === 'bayern' || system === 'austria') {
      return meta.valueOptions.map(n => ({ name: n.toString(), count: validGrades.filter(g => Math.round(g.value) === n && subjFor(g.subjectId)?.system === system).length, color: gradeColor(n, system, config) }));
    }
    if (system === 'oberstufe') {
      const buckets = [
        { name: '0-3', min: 0, max: 3, count: 0, color: '#ef4444' },
        { name: '4-6', min: 4, max: 6, count: 0, color: '#f97316' },
        { name: '7-9', min: 7, max: 9, count: 0, color: '#f59e0b' },
        { name: '10-12', min: 10, max: 12, count: 0, color: '#22c55e' },
        { name: '13-15', min: 13, max: 15, count: 0, color: '#10b981' },
      ];
      for (const g of validGrades) {
        if (subjFor(g.subjectId)?.system !== 'oberstufe') continue;
        const b = buckets.find(b => g.value >= b.min && g.value <= b.max);
        if (b) b.count++;
      }
      return buckets;
    }
    const c = config.custom;
    const bins = 5;
    const step = (c.max - c.min) / bins;
    const buckets = Array.from({ length: bins }, (_, i) => ({
      name: `${(c.min + step * i).toFixed(1)}–${(c.min + step * (i + 1)).toFixed(1)}`,
      count: 0,
      color: gradeColor(c.min + step * (i + 0.5), 'custom', config),
    }));
    for (const g of validGrades) {
      if (subjFor(g.subjectId)?.system !== 'custom') continue;
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((g.value - c.min) / step)));
      buckets[idx].count++;
    }
    return buckets;
  }, [grades, system, meta, config, subjects]);

  const chartData = useMemo(() => {
    const entries = new Map<number, Record<string, number | string>>();
    const running = new Map<string, { sum: number; w: number }>();
    const allSorted = grades.filter(g => !g.isPending).sort((a, b) => a.date - b.date);
    for (const g of allSorted) {
      const s = subjects.find(sub => sub.id === g.subjectId);
      if (!s) continue;
      const ww = effectiveWeight(g, s, config);
      const st = running.get(s.id) ?? { sum: 0, w: 0 };
      st.sum += g.value * ww; st.w += ww;
      running.set(s.id, st);
      const d = new Date(g.date);
      let entry = entries.get(g.date);
      if (!entry) { entry = { date: `${d.getDate()}.${d.getMonth() + 1}.`, ts: g.date }; entries.set(g.date, entry); }
      for (const [sid, r] of running) {
        const subj = subjects.find(sub => sub.id === sid);
        if (subj && r.w > 0) entry[subj.short] = +(r.sum / r.w).toFixed(2);
      }
      const avgs = [...running.values()].filter(r => r.w > 0).map(r => r.sum / r.w);
      if (avgs.length) entry['_overall'] = +(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2);
    }
    return [...entries.values()].sort((a, b) => (a.ts as number) - (b.ts as number));
  }, [grades, subjects, config]);

  if (!subjects.length) {
    return (
      <PageShell title="Noten">
        <Card>
          <Empty icon={Sparkles} title="Noch keine Fächer angelegt"
            description="Lege dein erstes Fach an, um Noten zu erfassen."
            action={<button onClick={() => setSubjectDialog(true)} className="btn-primary"><Plus className="size-4" />Fach anlegen</button>}
          />
        </Card>
        <SubjectDialog open={subjectDialog} onClose={() => setSubjectDialog(false)} />
      </PageShell>
    );
  }

  return (
    <PageShell title="Noten" subtitle={`${grades.filter(g => !g.isPending).length} Noten in ${subjects.length} Fächern`}
      actions={
        <>
          <button className="btn-ghost" onClick={downloadReport} disabled={pdfBusy} title="Zeugnis als PDF herunterladen">
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            <span className="hidden sm:inline">Zeugnis</span>
          </button>
          <button className="btn-ghost" onClick={() => setSubjectDialog(true)}><Plus className="size-4" />Fach</button>
          <button className="btn-primary" onClick={() => setGradeDialog(true)}><Plus className="size-4" />Note</button>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card delay={0} className="col-span-12 md:col-span-4 lg:col-span-3 theme-gradient !text-white border-0 flex flex-col items-center justify-center py-6 gap-1">
          <div className="text-xs uppercase tracking-widest opacity-80 font-semibold">Gesamtschnitt</div>
          <div className="font-display font-extrabold text-6xl leading-none mt-2 drop-shadow-sm">
            {overall != null ? formatAverage(overall, system) : '–'}
          </div>
          {delta != null && (
            <div className="flex items-center gap-1 mt-1 text-white/70 text-sm font-semibold">
              <span>{trendArrow}</span>
              <span>{formatAverage(Math.abs(delta), system, 2)}</span>
              <span className="text-white/50 font-normal">seit Halbjahr</span>
            </div>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
            <TrendIcon className="size-4" />
            {trend === 'up' ? 'Besser' : trend === 'down' ? 'Schlechter' : 'Stabil'}
          </div>
        </Card>

        <Card delay={0.05} className="col-span-12 md:col-span-8 lg:col-span-9">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Notenverlauf</h3>
            <span className="chip">{chartData.length} Punkte</span>
          </div>
          <div className="h-64">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis reversed={meta.goodIsLow} domain={[meta.min, meta.max]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={30} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }} />
                  {subjects.filter(s => !deselectedIds.has(s.id)).map(s => (
                    <Line key={s.id} type="monotone" dataKey={s.short} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls />
                  ))}
                  {showOverall && (
                    <Line type="monotone" dataKey="_overall" stroke="#64748b" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} connectNulls name="Gesamtschnitt" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-ink-400">Noch zu wenige Noten</div>
            )}
          </div>

          {/* Collapsible filter panel */}
          <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'rgb(var(--ink-200) / 0.5)' }}>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium transition-colors"
              style={{ color: 'rgb(var(--ink-500))' }}
            >
              <ChevronDown className={`size-3.5 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
              Fächer ein-/ausblenden
            </button>
            {filtersOpen && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {/* Gesamtschnitt toggle */}
                <button
                  onClick={() => setShowOverall(v => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border-2 transition-all"
                  style={showOverall
                    ? { background: '#64748b', borderColor: '#64748b', color: 'white' }
                    : { background: 'transparent', borderColor: '#94a3b8', color: '#64748b' }}
                >
                  {showOverall && <Check className="size-3 flex-shrink-0" />}
                  Gesamtschnitt
                </button>
                {subjects.map(s => {
                  const selected = !deselectedIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSubject(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border-2 transition-all"
                      style={selected
                        ? { background: s.color, borderColor: s.color, color: 'white' }
                        : { background: 'transparent', borderColor: s.color, color: s.color }}
                    >
                      {selected && <Check className="size-3 flex-shrink-0" />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card delay={0.1} className="col-span-12 md:col-span-7">
          <h3 className="h3 mb-2">Notenaufteilung</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={24} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }} />
                <Bar dataKey="count" radius={[12, 12, 4, 4]}>
                  {distribution.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card delay={0.15} className="col-span-12 md:col-span-5">
          <h3 className="h3 mb-2 flex items-center gap-2">{attentionSubjects.length > 0 ? <AlertTriangle className="size-5 text-rose-500" /> : <Sparkles className="size-5 text-emerald-500" />} Handlungsbedarf</h3>
          {attentionSubjects.length === 0 ? (
            <div className="text-center py-5 text-sm text-ink-500">Alles im grünen Bereich 🌱</div>
          ) : (
            <ul className="space-y-2">
              {attentionSubjects.map(s => {
                const avg = subjectAverage(grades, s, config);
                return (
                  <li key={s.id}>
                    <Link to={`/noten/${s.id}`} className="flex items-center gap-3 rounded-2xl p-2 bg-white/70 hover:bg-white transition">
                      <div className="size-10 rounded-xl grid place-items-center text-white font-display font-bold" style={{ background: s.color }}>{s.short}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-ink-800 truncate">{s.name}</div>
                        <div className="text-xs text-rose-600">Ziel: {s.targetAverage ? formatAverage(s.targetAverage, s.system, digits) : (s.system === 'bayern' ? '3,5' : '5')} · aktuell {formatAverage(avg, s.system, digits)}</div>
                      </div>
                      <GradeBadge value={avg ?? 0} system={s.system} size="sm" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.2} className="col-span-12">
          <h3 className="h3 mb-3">Fächer-Ranking</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rankedSubjects.map(({ subject, avg }, idx) => (
              <Link key={subject.id} to={`/noten/${subject.id}`}
                className="flex items-center gap-3 rounded-2xl p-2.5 bg-white/70 hover:bg-white transition">
                <div className="text-xs font-bold w-5 text-center flex-shrink-0" style={{ color: 'rgb(var(--ink-400))' }}>
                  {avg != null ? idx + 1 : '–'}
                </div>
                <div className="size-9 rounded-xl grid place-items-center text-white font-display font-bold text-sm flex-shrink-0"
                  style={{ background: subject.color }}>
                  {subject.short}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: 'rgb(var(--ink-800))' }}>{subject.name}</div>
                  <div className="text-xs" style={{ color: 'rgb(var(--ink-500))' }}>{CATEGORY_LABEL[subject.category]}</div>
                </div>
                {avg != null
                  ? <GradeBadge value={avg} system={subject.system} size="sm" />
                  : <span className="text-xs" style={{ color: 'rgb(var(--ink-400))' }}>Keine Noten</span>
                }
              </Link>
            ))}
          </div>
        </Card>

        <Card delay={0.25} className="col-span-12">
          <h3 className="h3 mb-3">Alle Fächer</h3>
          <SubjectsGrouped subjects={subjects} groups={settings?.subjectGroups ?? []} />
        </Card>
      </div>

      <GradeDialog open={gradeDialog} onClose={() => setGradeDialog(false)} />
      <SubjectDialog open={subjectDialog} onClose={() => setSubjectDialog(false)} />
    </PageShell>
  );
}

function SubjectsGrouped({ subjects, groups }: { subjects: Subject[]; groups: SubjectGroup[] }) {
  // Wenn keine Gruppen definiert: einfach alles in einem Grid
  if (groups.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subjects.map(s => <SubjectRow key={s.id} subject={s} />)}
      </div>
    );
  }

  const sortedGroups = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const byGroup = new Map<string | null, Subject[]>();
  for (const s of subjects) {
    const k = s.groupId && groups.find(g => g.id === s.groupId) ? s.groupId : null;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(s);
  }

  const blocks: Array<{ title: string | null; items: Subject[] }> = sortedGroups.map(g => ({
    title: g.label,
    items: byGroup.get(g.id) ?? [],
  }));
  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length) blocks.push({ title: 'Ohne Kategorie', items: ungrouped });

  return (
    <div className="space-y-5">
      {blocks.filter(b => b.items.length > 0).map(b => (
        <div key={b.title ?? 'none'}>
          <h4 className="text-xs uppercase tracking-wider font-semibold text-ink-500 mb-2 pl-1">
            {b.title} <span className="text-ink-400">· {b.items.length}</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {b.items.map(s => <SubjectRow key={s.id} subject={s} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubjectRow({ subject }: { subject: Subject }) {
  const grades = useStore(s => s.grades);
  const settings = useStore(s => s.settings);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const digits = settings?.averageDigits ?? 2;
  const avg = subjectAverage(grades, subject, config);
  const subjectGrades = grades.filter(g => g.subjectId === subject.id);

  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of subjectGrades) {
      if (g.isPending) continue;
      const k = (subject.system === 'bayern' || subject.system === 'austria') ? Math.round(g.value).toString() : g.value.toString();
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return Object.entries(counts).map(([k, v]) => ({ name: k, value: v, color: gradeColor(parseFloat(k), subject.system, config) }));
  }, [subjectGrades, subject, config]);

  return (
    <Link to={`/noten/${subject.id}`} className="group relative rounded-3xl overflow-hidden p-4 text-white shadow-soft transition hover:-translate-y-0.5">
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}cc)` }} />
      <div className="absolute -right-6 -top-6 size-32 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">{CATEGORY_LABEL[subject.category]}</div>
          <div className="font-display font-extrabold text-xl mt-0.5">{subject.name}</div>
          <div className="text-xs opacity-80">{subjectGrades.filter(g => !g.isPending).length} Noten · Schnitt {formatAverage(avg, subject.system, digits)}</div>
        </div>
        <div className="size-16 relative">
          {distribution.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribution} dataKey="value" innerRadius={18} outerRadius={28} paddingAngle={2} stroke="none">
                  {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Link>
  );
}
