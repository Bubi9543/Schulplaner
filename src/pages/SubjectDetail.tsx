import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, MapPin, User, Target, TrendingUp, TrendingDown, Calendar, Calculator, RotateCcw, Sparkles, Trash2, FileText, Lightbulb } from 'lucide-react';
import { TaskKindIcon } from '@/components/TaskKindIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { GradeBadge } from '@/components/GradeBadge';
import { SubjectIcon } from '@/components/SubjectIcon';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { GradeDetailDialog } from '@/components/dialogs/GradeDetailDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { average, formatAverage, getSystemMeta, gradeTrend, gradeWeight, gradeColor, getKindLabel, subjectAverage, halfYearPoints, isLargeAssessmentKind, BUILTIN_KIND_LABEL, CATEGORY_LABEL } from '@/lib/grading';
import { formatDate, relativeDate } from '@/lib/utils';
import { chartTooltipProps } from '@/lib/chartTheme';
import { DEFAULT_GRADING_CONFIG, oberstufeTermsFor } from '@/types';
import type { Grade, AppTask, GradeKind, Subject } from '@/types';
import { BUILTIN_GRADE_KINDS } from '@/types';

export function SubjectDetailPage() {
  const { subjectId } = useParams();
  const nav = useNavigate();
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const allYearGrades = useStore(s => s.allYearGrades);
  const activeTerm = useStore(s => s.activeTerm);
  const setActiveTerm = useStore(s => s.setActiveTerm);
  const schoolYears = useStore(s => s.schoolYears);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const tasks = useStore(s => s.tasks);
  const lessons = useStore(s => s.lessons);
  const settings = useStore(s => s.settings);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const digits = settings?.averageDigits ?? 2;

  const subject = subjects.find(s => s.id === subjectId);
  const [gradeDialog, setGradeDialog] = useState<{ open: boolean; grade?: Grade }>({ open: false });
  const [gradeDetail, setGradeDetail] = useState<{ open: boolean; grade?: Grade }>({ open: false });
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Partial<AppTask> }>({ open: false });
  const [taskDetail, setTaskDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [subjectDialog, setSubjectDialog] = useState(false);

  const subjectGrades = useMemo(() => subject ? grades.filter(g => g.subjectId === subject.id).sort((a, b) => a.date - b.date) : [], [grades, subject]);
  const realGrades = subjectGrades.filter(g => !g.isPending);
  const pendingGrades = subjectGrades.filter(g => g.isPending);
  const avg = subject ? subjectAverage(grades, subject, config) : null;
  const trend = useMemo(() => gradeTrend(subjectGrades, () => subject, config, settings?.trendThreshold ?? 0.2), [subjectGrades, subject, config, settings?.trendThreshold]);
  const meta = subject ? getSystemMeta(subject.system, config) : null;

  const byKind = useMemo(() => {
    if (!subject) return [];
    const m: Record<string, Grade[]> = {};
    for (const g of realGrades) (m[g.kind] ??= []).push(g);
    return Object.entries(m).map(([kind, gs]) => ({
      kind,
      count: gs.length,
      avg: average(gs, () => subject, config),
      weight: 1,
    }));
  }, [realGrades, subject, config]);

  const lineData = useMemo(() => {
    if (!subject) return [];
    let sum = 0, w = 0;
    return realGrades.map(g => {
      const ww = gradeWeight(g);
      sum += g.value * ww;
      w += ww;
      return { date: formatDate(g.date, { day: '2-digit', month: '2-digit' }), value: g.value, avg: +(sum / w).toFixed(2) };
    });
  }, [realGrades, subject]);

  const lessonCount = subject ? lessons.filter(l => l.subjectId === subject.id).length : 0;
  const openTasks = subject ? tasks.filter(t => t.subjectId === subject.id && !t.done) : [];

  // Oberstufe: Halbjahresleistung je Ausbildungsabschnitt (aus allen Halbjahren).
  const isOberstufe = subject?.system === 'oberstufe';
  const oberstufeJahrgaenge = schoolYears.find(y => y.id === activeSchoolYearId)?.oberstufeJahrgaenge;
  const halfYears = useMemo(() => {
    if (!subject || !isOberstufe) return [];
    return oberstufeTermsFor(oberstufeJahrgaenge).map(t => {
      const termGrades = allYearGrades.filter(g => g.subjectId === subject.id && (g.term ?? 1) === t.term);
      return {
        term: t.term,
        label: t.label,
        points: halfYearPoints(termGrades.filter(g => !g.isPending), subject, config),
        count: termGrades.filter(g => !g.isPending).length,
      };
    });
  }, [subject, isOberstufe, allYearGrades, config, oberstufeJahrgaenge]);

  if (!subject) {
    return (
      <PageShell title="Fach nicht gefunden">
        <Card>
          <Empty icon={Target} title="Dieses Fach existiert nicht" action={<Link to="/noten" className="btn-primary"><ArrowLeft className="size-4" />Zurück</Link>} />
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title={subject.name} subtitle={`${subject.system === 'oberstufe' ? (subject.leistungsfach ? 'Leistungsfach' : 'Kurs') : CATEGORY_LABEL[subject.category]} · ${realGrades.length} Noten · ${lessonCount} Stunden/Woche`}
      actions={
        <>
          <button onClick={() => nav('/noten')} className="btn-ghost"><ArrowLeft className="size-4" />Zurück</button>
          <button onClick={() => setSubjectDialog(true)} className="btn-ghost"><Pencil className="size-4" />Bearbeiten</button>
          <button onClick={() => setGradeDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Note</button>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        {isOberstufe && (
          <Card delay={0} className="col-span-12">
            <div className="flex items-center justify-between mb-3">
              <h3 className="h3">Halbjahresleistungen</h3>
              <span className="chip">Klick = Halbjahr wechseln</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {halfYears.map(h => {
                const isActive = h.term === activeTerm;
                return (
                  <button
                    key={h.term}
                    onClick={() => { if (!isActive) void setActiveTerm(h.term); }}
                    className={`rounded-2xl p-3 text-left transition border-2 ${isActive ? 'border-theme bg-theme-soft/40' : 'border-transparent bg-white/60 hover:bg-white'}`}
                  >
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Halbjahr {h.label}</div>
                    <div className="flex items-end gap-1.5 mt-1">
                      <span className="font-display font-extrabold text-3xl" style={{ color: h.points !== null ? gradeColor(h.points, 'oberstufe', config) : 'rgb(var(--ink-400))' }}>
                        {h.points !== null ? h.points : '–'}
                      </span>
                      {h.points !== null && <span className="text-xs text-ink-500 mb-1">P</span>}
                    </div>
                    <div className="text-[11px] text-ink-400">{h.count} {h.count === 1 ? 'Note' : 'Noten'}</div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
        <Card delay={0} className="col-span-12 md:col-span-5 lg:col-span-4 !p-6 text-white border-0 relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}cc)` }} />
          <div className="absolute -top-12 -right-12 size-48 rounded-full bg-white/10 blur-2xl animate-blob" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="size-16 rounded-3xl bg-white/20 grid place-items-center"><SubjectIcon subject={subject} className="size-8" /></div>
              <div>
                <div className="text-xs opacity-80 uppercase tracking-wider">{meta?.label}</div>
                <div className="font-display font-bold text-xl">{subject.name}</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-xs opacity-80">Aktueller Schnitt</div>
              <div className="font-display font-extrabold text-5xl mt-1">{formatAverage(avg, subject.system, digits)}</div>
              <div className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                {trend === 'up' ? <><TrendingUp className="size-4" />Trend: besser</> : trend === 'down' ? <><TrendingDown className="size-4" />Trend: schlechter</> : 'Stabil'}
              </div>
            </div>
            {(subject.teacher || subject.room || subject.targetAverage) && (
              <div className="mt-6 grid grid-cols-1 gap-1.5 text-sm">
                {subject.teacher && <div className="flex items-center gap-2 opacity-90"><User className="size-3.5" />{subject.teacher}</div>}
                {subject.room && <div className="flex items-center gap-2 opacity-90"><MapPin className="size-3.5" />Raum {subject.room}</div>}
                {subject.targetAverage && <div className="flex items-center gap-2 opacity-90"><Target className="size-3.5" />Ziel {formatAverage(subject.targetAverage, subject.system, digits)}</div>}
              </div>
            )}
          </div>
        </Card>

        <Card delay={0.05} className="col-span-12 md:col-span-7 lg:col-span-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Verlauf & Schnitt</h3>
            {subject.targetAverage && <span className="chip">Zielnote: {formatAverage(subject.targetAverage, subject.system, digits)}</span>}
          </div>
          <div className="h-64">
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis reversed={meta?.goodIsLow} domain={meta ? [meta.min, meta.max] : [1, 6]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip {...chartTooltipProps} />
                  {subject.targetAverage && <ReferenceLine y={subject.targetAverage} stroke="var(--theme-secondary)" strokeDasharray="4 4" label={{ value: 'Ziel', fill: 'var(--theme-secondary)', fontSize: 10 }} />}
                  <Line type="monotone" dataKey="value" stroke={subject.color} strokeWidth={1.5} dot={{ r: 3 }} strokeOpacity={0.6} />
                  <Line type="monotone" dataKey="avg" stroke={subject.color} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-ink-400">Noch keine Noten</div>
            )}
          </div>
        </Card>

        <Card delay={0.1} className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-2">Nach Art</h3>
          {byKind.length === 0 ? (
            <div className="text-sm text-ink-500 py-4 text-center">Noch keine Noten</div>
          ) : (
            <ul className="space-y-2">
              {byKind.map(b => (
                <li key={b.kind} className="flex items-center gap-3 rounded-2xl p-2 bg-white/60">
                  <div className="flex-1">
                    <div className="font-semibold text-ink-800">{getKindLabel(b.kind, config)}</div>
                    <div className="text-xs text-ink-500">{b.count} Noten · Gewicht {b.weight}</div>
                  </div>
                  <GradeBadge value={b.avg ?? 0} system={subject.system} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card delay={0.15} className="col-span-12 md:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3 flex items-center gap-2"><Calendar className="size-5" />Ausstehende & Aufgaben</h3>
          </div>
          {pendingGrades.length === 0 && openTasks.length === 0 ? (
            <div className="text-sm text-ink-500 py-4 text-center">Nichts geplant.</div>
          ) : (
            <ul className="space-y-2">
              {pendingGrades.map(g => (
                <li key={g.id}>
                  <button
                    onClick={() => setGradeDetail({ open: true, grade: g })}
                    className="w-full flex items-center gap-3 rounded-2xl p-2 bg-white/60 hover:bg-white text-left transition"
                  >
                    <GradeBadge value={0} system={subject.system} size="sm" pending />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-800 truncate">{g.title ?? 'Ausstehende Note'}</div>
                      <div className="text-xs text-ink-500">{getKindLabel(g.kind, config)} · {relativeDate(g.date)}</div>
                    </div>
                  </button>
                </li>
              ))}
              {openTasks.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setTaskDetail({ open: true, task: t })}
                    className="w-full flex items-center gap-3 rounded-2xl p-2 bg-white/60 hover:bg-white text-left transition"
                  >
                    <div className="size-9 rounded-xl grid place-items-center bg-ink-100 text-ink-500"><TaskKindIcon kind={t.kind} className="size-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-800 truncate">{t.title}</div>
                      <div className="text-xs text-ink-500">{t.dueDate ? relativeDate(t.dueDate) : 'Ohne Datum'}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card delay={0.2} className="col-span-12">
          <h3 className="h3 mb-3">Alle Noten</h3>
          {realGrades.length === 0 ? (
            <Empty icon={Plus} title="Noch keine Noten" description="Trage deine erste Note ein." action={<button onClick={() => setGradeDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Note hinzufügen</button>} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...realGrades].reverse().map(g => (
                <button key={g.id} onClick={() => setGradeDetail({ open: true, grade: g })}
                  className="rounded-2xl bg-white/70 hover:bg-white p-3 text-left transition shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <GradeBadge value={g.value} system={subject.system} size="sm" tendency={g.tendency} />
                    <span className="chip">{getKindLabel(g.kind, config)}</span>
                  </div>
                  <div className="font-semibold text-sm text-ink-800 truncate">{g.title ?? 'Note'}</div>
                  <div className="text-xs text-ink-500">{formatDate(g.date)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card delay={0.25} className="col-span-12">
          <WhatIfCalculator subject={subject} realGrades={realGrades} pendingGrades={pendingGrades} />
        </Card>
      </div>

      <GradeDialog open={gradeDialog.open} initial={gradeDialog.grade} defaultSubjectId={subject.id} onClose={() => setGradeDialog({ open: false })} />
      <GradeDetailDialog
        open={gradeDetail.open}
        grade={gradeDetail.grade}
        onClose={() => setGradeDetail({ open: false })}
        onEdit={g => {
          setGradeDetail({ open: false });
          setGradeDialog({ open: true, grade: g });
        }}
      />
      <TaskDetailDialog
        open={taskDetail.open}
        task={taskDetail.task}
        onClose={() => setTaskDetail({ open: false })}
        onEdit={t => {
          setTaskDetail({ open: false });
          setTaskDialog({ open: true, task: t });
        }}
      />
      <TaskDialog
        open={taskDialog.open}
        initial={taskDialog.task}
        onClose={() => setTaskDialog({ open: false })}
      />
      <SubjectDialog open={subjectDialog} initial={subject} onClose={() => setSubjectDialog(false)} />
    </PageShell>
  );
}

/* ─── Was-wäre-wenn-Rechner ──────────────────────────────────────────── */

interface HypotheticalRow {
  /** Stabile ID für React-Key. */
  id: string;
  /**
   * Quelle:
   * - 'pending'  → eine bestehende ausstehende Note vorbelegt
   * - 'custom'   → frei hinzugefügter hypothetischer Eintrag
   */
  source: 'pending' | 'custom';
  /** Bei source='pending': verweist auf die echte Pending-Grade-ID. */
  pendingGradeId?: string;
  label: string;
  kind: GradeKind;
  value: number;
  /** Per-Note-Gewichts-Multiplikator (analog zu Grade.weightMultiplier). */
  weightMultiplier: number;
}

function WhatIfCalculator({
  subject,
  realGrades,
  pendingGrades,
}: {
  subject: Subject;
  realGrades: Grade[];
  pendingGrades: Grade[];
}) {
  const settings = useStore(s => s.settings);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const digits = settings?.averageDigits ?? 2;
  const meta = getSystemMeta(subject.system, config);

  const customKinds = config.customKinds ?? [];
  const allKinds: GradeKind[] = [...BUILTIN_GRADE_KINDS, ...customKinds.map(c => c.id)];

  function makeRowFromPending(g: Grade): HypotheticalRow {
    return {
      id: `pending-${g.id}`,
      source: 'pending',
      pendingGradeId: g.id,
      label: g.title || (BUILTIN_KIND_LABEL[g.kind] ?? g.kind),
      kind: g.kind,
      value: meta.defaultValue,
      weightMultiplier: g.weightMultiplier ?? 1,
    };
  }

  // Default: alle Pending-Noten als Zeilen vorbelegt mit Default-Wert.
  const [rows, setRows] = useState<HypotheticalRow[]>(() => pendingGrades.map(makeRowFromPending));
  // Wenn neue Pending-Grades dazukommen, ergänze sie. (Reload bei Wechsel)
  const [lastPendingIds, setLastPendingIds] = useState<string>(() => pendingGrades.map(g => g.id).sort().join(','));
  const currentPendingIds = pendingGrades.map(g => g.id).sort().join(',');
  if (currentPendingIds !== lastPendingIds) {
    // Behalte bestehende User-Edits, ergänze neue Pendings.
    const knownIds = new Set(rows.filter(r => r.source === 'pending').map(r => r.pendingGradeId));
    const newOnes = pendingGrades.filter(g => !knownIds.has(g.id)).map(makeRowFromPending);
    setRows(prev => [
      ...prev.filter(r => r.source === 'custom' || pendingGrades.some(g => g.id === r.pendingGradeId)),
      ...newOnes,
    ]);
    setLastPendingIds(currentPendingIds);
  }

  function updateRow(id: string, patch: Partial<HypotheticalRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addCustom() {
    setRows(prev => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'custom',
        label: 'Neue Note',
        kind: 'muendlich',
        value: meta.defaultValue,
        weightMultiplier: 1,
      },
    ]);
  }

  function reset() {
    setRows(pendingGrades.map(makeRowFromPending));
  }

  // ─── Berechnung ────────────────────────────────────────────────────────
  // currentAvg = nur echte (nicht-pending) Noten
  // hypotheticalAvg = echte + alle Zeilen als finale Noten
  const currentAvg = useMemo(() => subjectAverage(realGrades, subject, config), [realGrades, subject, config]);

  const hypotheticalAvg = useMemo(() => {
    const virtual: Grade[] = rows.map(r => ({
      id: r.id,
      subjectId: subject.id,
      value: r.value,
      kind: r.kind,
      date: Date.now(),
      weight: 1,
      weightMultiplier: r.weightMultiplier,
      isPending: false,
      schoolYearId: subject.schoolYearId,
    }));
    return subjectAverage([...realGrades, ...virtual], subject, config);
  }, [rows, realGrades, subject, config]);

  const delta = currentAvg !== null && hypotheticalAvg !== null
    ? +(hypotheticalAvg - currentAvg).toFixed(3)
    : null;

  // Richtungssensitiv: in goodIsLow-Systemen ist negativer delta gut (besser).
  const deltaGood = delta === null ? null
    : meta.goodIsLow ? delta < -0.005
    : delta > 0.005;
  const deltaBad = delta === null ? null
    : meta.goodIsLow ? delta > 0.005
    : delta < -0.005;

  // Verfügbare Werte für den Stepper – richtig sortiert (gut zuerst beim Slider links).
  // Bei goodIsLow lassen wir den Standard-Range, der User sieht z.B. 1..6.

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="h3 flex items-center gap-2">
          <Calculator className="size-5 text-theme" />
          Was-wäre-wenn-Rechner
        </h3>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-ghost text-xs" title="Auf Default-Werte zurücksetzen">
            <RotateCcw className="size-3.5" />Zurücksetzen
          </button>
          <button onClick={addCustom} className="btn-primary text-xs">
            <Plus className="size-3.5" />Hypothetische Note
          </button>
        </div>
      </div>
      <p className="subtle mb-4">
        Probier durch, wie sich ausstehende Noten oder neue Wertungen auf deinen Schnitt auswirken.
        Schulaufgaben/Klausuren werden{' '}
        {subject.system === 'oberstufe' || subject.category === 'hauptfach-1zu1' ? <><strong>1:1</strong></>
          : subject.category === 'hauptfach' ? <><strong>doppelt</strong></>
          : <strong>gleich</strong>}
        {' '}wie der Rest verrechnet.
      </p>

      {/* Schnitt-Vergleich */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-white/60 p-4 text-center">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Aktuell</div>
          <div className="font-display font-extrabold text-3xl mt-1 text-ink-900">
            {formatAverage(currentAvg, subject.system, digits)}
          </div>
        </div>
        <div className="rounded-2xl p-4 text-center text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${hypotheticalAvg !== null ? gradeColor(hypotheticalAvg, subject.system, config) : '#64748b'}, ${hypotheticalAvg !== null ? gradeColor(hypotheticalAvg, subject.system, config) : '#64748b'}cc)` }}
        >
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-90">
            <Sparkles className="size-3 inline -mt-0.5 mr-1" />Hypothetisch
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={hypotheticalAvg !== null ? hypotheticalAvg.toFixed(2) : 'none'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="font-display font-extrabold text-3xl mt-1"
            >
              {formatAverage(hypotheticalAvg, subject.system, digits)}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className={`rounded-2xl p-4 text-center transition-colors ${
          deltaGood ? 'bg-emerald-50 text-emerald-800'
          : deltaBad ? 'bg-rose-50 text-rose-800'
          : 'bg-white/60 text-ink-700'
        }`}>
          <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Veränderung</div>
          <div className="font-display font-extrabold text-3xl mt-1 flex items-center justify-center gap-1">
            {deltaGood && <TrendingUp className="size-5" />}
            {deltaBad && <TrendingDown className="size-5" />}
            {delta === null || delta === 0 ? '–'
              : (delta > 0 ? '+' : '') + delta.toFixed(2).replace('.', ',')}
          </div>
        </div>
      </div>

      {/* Eingabe-Liste */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
          <Sparkles className="size-5 text-theme mx-auto mb-2" />
          Keine hypothetischen Noten – füg eine hinzu oder leg eine ausstehende Note an.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <HypotheticalRowEditor
              key={r.id}
              row={r}
              subject={subject}
              meta={meta}
              allKinds={allKinds}
              onChange={patch => updateRow(r.id, patch)}
              onRemove={() => removeRow(r.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 text-[11px] text-ink-400 leading-relaxed flex gap-1.5">
        <Lightbulb className="size-3.5 shrink-0 mt-px" />
        <span>Das hier ändert nichts an deinen echten Noten – nur Simulation. Sobald die Note real ist,
        einfach in der Notenliste auf die ausstehende Note klicken und den Wert eintragen.</span>
      </div>
    </>
  );
}

function HypotheticalRowEditor({
  row, subject, meta, allKinds, onChange, onRemove,
}: {
  row: HypotheticalRow;
  subject: Subject;
  meta: ReturnType<typeof getSystemMeta>;
  allKinds: GradeKind[];
  onChange: (patch: Partial<HypotheticalRow>) => void;
  onRemove: () => void;
}) {
  const settings = useStore(s => s.settings);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;
  const isLarge = isLargeAssessmentKind(row.kind, config);
  const showCategoryHint = subject.system === 'oberstufe' || subject.category !== 'nebenfach';
  // Multiplikator-Optionen analog zum GradeDialog.
  const weightOptions = [0.5, 1, 1.5, 2];

  return (
    <li className="rounded-2xl bg-white/70 border border-white/60 p-3 sm:p-4">
      <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
        {/* Label */}
        <div className="flex-1 min-w-0">
          <input
            value={row.label}
            onChange={e => onChange({ label: e.target.value })}
            className="w-full bg-transparent font-semibold text-sm text-ink-800 outline-none border-b border-transparent focus:border-ink-300 transition"
            placeholder="Bezeichnung"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {allKinds.map(k => (
              <button
                key={k}
                onClick={() => onChange({ kind: k })}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  row.kind === k
                    ? 'bg-ink-900 text-ink-50 border-ink-900'
                    : 'bg-white/60 text-ink-600 border-white/70 hover:bg-white'
                }`}
              >
                {getKindLabel(k, config)}
              </button>
            ))}
          </div>
          {showCategoryHint && (
            <div className="text-[11px] text-ink-500 mt-2 flex items-center gap-1.5">
              {isLarge ? <FileText className="size-3.5 shrink-0" /> : <Pencil className="size-3.5 shrink-0" />}
              <span>{isLarge
                ? `Zählt als ${subject.category === 'hauptfach' && subject.system !== 'oberstufe' ? 'doppelte' : '1:1'} große Leistung.`
                : 'Zählt als kleine Leistung (Rest-Block).'}</span>
            </div>
          )}
        </div>

        {/* Wert */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <GradeBadge value={row.value} system={subject.system} size="md" />
          <select
            value={row.value}
            onChange={e => onChange({ value: parseFloat(e.target.value) })}
            className="chip bg-white/80 cursor-pointer text-xs"
          >
            {meta.valueOptions.map(v => (
              <option key={v} value={v}>{meta.formatValue(v)}</option>
            ))}
          </select>
        </div>

        {/* Gewicht */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <select
            value={weightOptions.includes(row.weightMultiplier) ? row.weightMultiplier : 'custom'}
            onChange={e => {
              if (e.target.value === 'custom') return;
              onChange({ weightMultiplier: parseFloat(e.target.value) });
            }}
            className="chip bg-white/80 cursor-pointer text-xs"
            title="Per-Note-Gewicht"
          >
            {weightOptions.map(w => (
              <option key={w} value={w}>×{w.toString().replace('.', ',')}</option>
            ))}
          </select>
          <button
            onClick={onRemove}
            className="size-7 grid place-items-center rounded-full text-ink-400 hover:text-rose-500 hover:bg-rose-50 transition"
            title={row.source === 'pending' ? 'Aus Rechner entfernen' : 'Löschen'}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

