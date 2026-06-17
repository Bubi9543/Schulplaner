import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, MapPin, User, Target, TrendingUp, TrendingDown, Calendar,
  Calculator, RotateCcw, Sparkles, Trash2, FileText, Lightbulb, Flame, Info, NotebookPen, X,
} from 'lucide-react';
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
import {
  formatAverage, getSystemMeta, gradeTrend, gradeColor, getKindLabel, subjectAverage,
  halfYearPoints, isLargeAssessmentKind, writtenOralSplit, BUILTIN_KIND_LABEL, CATEGORY_LABEL,
  type SystemMeta,
} from '@/lib/grading';
import { gradeWeight } from '@/lib/grading';
import { formatDate, relativeDate } from '@/lib/utils';
import { chartTooltipProps } from '@/lib/chartTheme';
import { FocusGoalEditor } from '@/components/FocusGoalEditor';
import { DAY, DEFAULT_GOAL_MINUTES, DEFAULT_GOAL_DAYS, toDateInput, endOfDay } from '@/lib/focusGoals';
import { DEFAULT_GRADING_CONFIG, oberstufeTermsFor } from '@/types';
import type { Grade, AppTask, GradeKind, Subject, GradingSystem, FocusSession } from '@/types';
import { BUILTIN_GRADE_KINDS } from '@/types';

/* ─── kleine Helfer ───────────────────────────────────────────────────────── */

/** Qualitatives Notenwort (nur Bayern/Österreich), sonst null. */
function gradeWord(value: number, system: GradingSystem): string | null {
  const v = Math.round(value);
  if (system === 'bayern') return ['', 'sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'][v] ?? null;
  if (system === 'austria') return ['', 'sehr gut', 'gut', 'befriedigend', 'genügend', 'nicht genügend'][v] ?? null;
  return null;
}

/**
 * Schlechteste Note in der nächsten großen Leistung, mit der das Ziel noch erreicht wird.
 * Probiert die Werte von „schlecht" nach „gut" und nimmt den ersten, der das Ziel erfüllt.
 */
function neededForTarget(
  realGrades: Grade[], subject: Subject, config: typeof DEFAULT_GRADING_CONFIG, meta: SystemMeta, target: number,
): { value: number | null; reachable: boolean } {
  const isNeben = subject.category === 'nebenfach' && subject.system !== 'oberstufe';
  const vKind: GradeKind = subject.system === 'oberstufe' ? 'klausur' : isNeben ? 'muendlich' : 'schulaufgabe';
  // „schlecht → gut": goodIsLow ⇒ absteigend (6,5,…), sonst aufsteigend (0,1,…).
  const order = [...meta.valueOptions].sort((a, b) => meta.goodIsLow ? b - a : a - b);
  for (const v of order) {
    const virtual: Grade = {
      id: '__needed__', subjectId: subject.id, value: v, kind: vKind,
      date: Date.now(), weight: 1, isPending: false, schoolYearId: subject.schoolYearId,
    };
    const e = subjectAverage([...realGrades, virtual], subject, config);
    if (e === null) continue;
    if (meta.goodIsLow ? e <= target + 1e-9 : e >= target - 1e-9) return { value: v, reachable: true };
  }
  return { value: null, reachable: false };
}

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
  const focusSessions = useStore(s => s.focusSessions);
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
  const realGrades = useMemo(() => subjectGrades.filter(g => !g.isPending), [subjectGrades]);
  const pendingGrades = useMemo(() => subjectGrades.filter(g => g.isPending), [subjectGrades]);
  const avg = subject ? subjectAverage(grades, subject, config) : null;
  const trend = useMemo(() => gradeTrend(subjectGrades, () => subject, config, settings?.trendThreshold ?? 0.2), [subjectGrades, subject, config, settings?.trendThreshold]);
  const meta = subject ? getSystemMeta(subject.system, config) : null;

  // Schriftlich / Mündlich-Aufteilung für den Segment-Balken.
  const split = useMemo(() => subject ? writtenOralSplit(realGrades, subject, config) : null, [realGrades, subject, config]);

  // Notenziel: nötige Mindestnote in der nächsten großen Leistung.
  const needed = useMemo(() => {
    if (!subject || !meta || subject.targetAverage === undefined) return null;
    return neededForTarget(realGrades, subject, config, meta, subject.targetAverage);
  }, [subject, meta, realGrades, config]);

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

  // Tests-Timeline: anstehend (Zukunft) → ausstehend (Wert fehlt) → vergangen (mit Note).
  const timeline = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const t0 = todayStart.getTime();
    const items = [
      ...realGrades.map(g => ({ grade: g, status: 'vergangen' as const })),
      ...pendingGrades.map(g => ({
        grade: g,
        status: (g.date && g.date >= t0 ? 'anstehend' : 'ausstehend') as 'anstehend' | 'ausstehend',
      })),
    ];
    const rank = { anstehend: 0, ausstehend: 1, vergangen: 2 };
    return items.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      // anstehend: bald zuerst (aufsteigend); sonst neueste zuerst (absteigend)
      return a.status === 'anstehend' ? (a.grade.date ?? 0) - (b.grade.date ?? 0) : (b.grade.date ?? 0) - (a.grade.date ?? 0);
    });
  }, [realGrades, pendingGrades]);

  const lessonCount = subject ? lessons.filter(l => l.subjectId === subject.id).length : 0;
  const openTasks = useMemo(() => subject ? tasks.filter(t => t.subjectId === subject.id && !t.done).sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)) : [], [tasks, subject]);

  // Oberstufe: Halbjahresleistung je Ausbildungsabschnitt.
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

  if (!subject || !meta) {
    return (
      <PageShell title="Fach nicht gefunden">
        <Card>
          <Empty icon={Target} title="Dieses Fach existiert nicht" action={<Link to="/noten" className="btn-primary"><ArrowLeft className="size-4" />Zurück</Link>} />
        </Card>
      </PageShell>
    );
  }

  const subtitleParts = `${subject.system === 'oberstufe' ? (subject.leistungsfach ? 'Leistungsfach' : 'Kurs') : CATEGORY_LABEL[subject.category]} · ${realGrades.length} Noten · ${lessonCount} Stunden/Woche`;

  return (
    <PageShell title={subject.name} subtitle={subtitleParts}
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

        {/* ─── Hero ─── */}
        <Card delay={0} className="col-span-12 md:col-span-5 lg:col-span-4 !p-6 text-white border-0 relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}cc)` }} />
          <div className="absolute -top-12 -right-12 size-48 rounded-full bg-white/10 blur-2xl animate-blob" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="size-16 rounded-3xl bg-white/20 grid place-items-center"><SubjectIcon subject={subject} className="size-8" /></div>
              <div>
                <div className="text-xs opacity-80 uppercase tracking-wider">{meta.label}</div>
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

        {/* ─── Schnitt-Kasten: Segment-Balken ─── */}
        <Card delay={0.05} className="col-span-12 md:col-span-7 lg:col-span-5">
          <SchnittBox subject={subject} avg={avg} split={split} meta={meta} digits={digits} />
        </Card>

        {/* ─── Notenziel ─── */}
        <Card delay={0.1} className="col-span-12 lg:col-span-3 flex flex-col">
          <NotenzielBox
            subject={subject} avg={avg} meta={meta} needed={needed} digits={digits}
            onEditTarget={() => setSubjectDialog(true)}
          />
        </Card>

        {/* ─── Verlauf ─── */}
        <Card delay={0.12} className="col-span-12 md:col-span-7">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Verlauf &amp; Schnitt</h3>
            {subject.targetAverage && <span className="chip">Zielnote: {formatAverage(subject.targetAverage, subject.system, digits)}</span>}
          </div>
          <div className="h-56">
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgb(var(--ink-200) / 0.6)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis reversed={meta.goodIsLow} domain={[meta.min, meta.max]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={28} />
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

        {/* ─── Fokus-Ziel mit Frist ─── */}
        <Card delay={0.15} className="col-span-12 md:col-span-5">
          <SubjectFocusGoal subject={subject} subjectGrades={subjectGrades} focusSessions={focusSessions} config={config} />
        </Card>

        {/* ─── Tests-Timeline ─── */}
        <Card delay={0.18} className="col-span-12 md:col-span-7">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="h3 flex items-center gap-2"><Calendar className="size-5 text-theme" />Alle Tests</h3>
            <div className="flex gap-2 text-[10.5px] font-semibold">
              <span className="inline-flex items-center gap-1 text-amber-600"><span className="size-2 rounded-full bg-amber-500" />ausstehend</span>
              <span className="inline-flex items-center gap-1 text-theme"><span className="size-2 rounded-full bg-theme" />anstehend</span>
              <span className="inline-flex items-center gap-1 text-ink-500"><span className="size-2 rounded-full bg-slate-400" />vergangen</span>
            </div>
          </div>
          {timeline.length === 0 ? (
            <Empty icon={Plus} title="Noch keine Tests" description="Trage deine erste Note oder eine geplante Prüfung ein." action={<button onClick={() => setGradeDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Note hinzufügen</button>} />
          ) : (
            <div className="flex flex-col">
              {timeline.map((item, i) => (
                <TimelineRow
                  key={item.grade.id}
                  item={item}
                  subject={subject}
                  meta={meta}
                  config={config}
                  needed={needed}
                  last={i === timeline.length - 1}
                  onOpen={() => setGradeDetail({ open: true, grade: item.grade })}
                />
              ))}
            </div>
          )}
        </Card>

        {/* ─── Ausstehende Hausaufgaben ─── */}
        <Card delay={0.2} className="col-span-12 md:col-span-5">
          <h3 className="h3 mb-4 flex items-center gap-2"><NotebookPen className="size-5 text-theme" />Ausstehende Hausaufgaben</h3>
          {openTasks.length === 0 ? (
            <div className="text-sm text-ink-500 py-6 text-center">Keine offenen Aufgaben – stark!</div>
          ) : (
            <ul className="space-y-2.5">
              {openTasks.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setTaskDetail({ open: true, task: t })}
                    className="w-full flex items-center gap-3 rounded-2xl p-3 bg-white/60 hover:bg-white text-left transition border border-white/65"
                  >
                    <div className="size-9 rounded-xl grid place-items-center bg-ink-100 text-ink-500 flex-shrink-0"><TaskKindIcon kind={t.kind} className="size-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-800 truncate">{t.title}</div>
                      <div className="text-xs text-ink-500">{t.dueDate ? formatDate(t.dueDate, { weekday: 'short', day: '2-digit', month: 'short' }) : 'Ohne Datum'}</div>
                    </div>
                    {t.dueDate && <div className="text-xs font-bold text-theme flex-shrink-0">{relativeDate(t.dueDate)}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ─── Was-wäre-wenn-Rechner ─── */}
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

/* ─── Schnitt-Kasten (Segment-Balken) ────────────────────────────────────── */

function SchnittBox({
  subject, avg, split, meta, digits,
}: {
  subject: Subject;
  avg: number | null;
  split: ReturnType<typeof writtenOralSplit> | null;
  meta: SystemMeta;
  digits: number;
}) {
  const hasWritten = split && split.written !== null;
  const hasOral = split && split.oral !== null;
  const isHaupt = subject.category === 'hauptfach' && subject.system !== 'oberstufe';
  // Gewicht der schriftlichen Segmente (für Balkenbreite).
  const writtenFlex = isHaupt ? 2 : 1;
  const word = avg !== null ? gradeWord(avg, subject.system) : null;

  // Formelzeile passend zur Kategorie (nur wenn beide Gruppen vorhanden).
  let formula: string | null = null;
  if (hasWritten && hasOral) {
    if (isHaupt) formula = '(Schriftlich × 2 + Mündlich) ÷ 3';
    else if (subject.category === 'nebenfach') formula = 'Gewichteter Mittelwert aller Noten';
    else formula = '(Schriftlich + Mündlich) ÷ 2';
  }

  const SCHR = '#22c55e', MUEND = '#f59e0b';

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="h3">So entsteht dein Schnitt</h3>
        <span className="chip">{subject.system === 'oberstufe' ? 'Oberstufe' : CATEGORY_LABEL[subject.category]}</span>
      </div>

      <div className="flex items-baseline gap-2.5 mb-4">
        <span className="font-display font-extrabold text-4xl leading-none" style={{ color: avg !== null ? gradeColor(avg, subject.system, undefined) : 'rgb(var(--ink-400))' }}>
          {formatAverage(avg, subject.system, digits)}
        </span>
        <span className="text-sm text-ink-500">Endschnitt{word ? ` · ${word}` : ''}</span>
      </div>

      {!hasWritten && !hasOral ? (
        <div className="text-sm text-ink-500 py-4 text-center">Noch keine Noten – sobald du welche einträgst, siehst du hier die Aufteilung.</div>
      ) : (
        <>
          <div className="flex gap-1.5 h-10 mb-3">
            {hasWritten && (
              <div className="rounded-l-xl flex flex-col items-center justify-center text-white leading-tight" style={{ flex: writtenFlex, borderRadius: hasOral ? '12px 6px 6px 12px' : 12, background: `linear-gradient(135deg, ${SCHR}, #16a34a)` }}>
                <span className="font-display font-extrabold text-base">{formatAverage(split!.written, subject.system, digits)}</span>
                <span className="text-[9.5px] opacity-90 font-semibold">Schriftlich</span>
              </div>
            )}
            {hasOral && (
              <div className="flex flex-col items-center justify-center text-white leading-tight" style={{ flex: 1, borderRadius: hasWritten ? '6px 12px 12px 6px' : 12, background: `linear-gradient(135deg, #fbbf24, ${MUEND})` }}>
                <span className="font-display font-extrabold text-base">{formatAverage(split!.oral, subject.system, digits)}</span>
                <span className="text-[9.5px] opacity-90 font-semibold">Mündlich</span>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-[11.5px] text-ink-500 gap-2 flex-wrap">
            {hasWritten && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SCHR }} />Schriftlich · {split!.writtenCount} {split!.writtenCount === 1 ? 'Note' : 'Noten'}{isHaupt ? ' · ×2' : ''}</span>}
            {hasOral && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: MUEND }} />Mündlich · {split!.oralCount} {split!.oralCount === 1 ? 'Note' : 'Noten'}{isHaupt ? ' · ×1' : ''}</span>}
          </div>

          {formula && (
            <div className="mt-3.5 pt-3.5 border-t border-dashed border-ink-200 text-xs text-ink-500 flex items-center gap-2">
              <Info className="size-3.5 text-ink-400 flex-shrink-0" />
              <span>{formula} = <strong className="text-ink-700">{formatAverage(avg, subject.system, digits)}</strong></span>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ─── Notenziel ───────────────────────────────────────────────────────────── */

function NotenzielBox({
  subject, avg, meta, needed, digits, onEditTarget,
}: {
  subject: Subject;
  avg: number | null;
  meta: SystemMeta;
  needed: { value: number | null; reachable: boolean } | null;
  digits: number;
  onEditTarget: () => void;
}) {
  const target = subject.targetAverage;

  if (target === undefined) {
    return (
      <>
        <h3 className="h3 mb-1 flex items-center gap-2"><Target className="size-4 text-theme" />Notenziel</h3>
        <p className="subtle mb-4 flex-1">Setz dir ein Notenziel, dann zeig ich dir, welche Note du dafür brauchst.</p>
        <button onClick={onEditTarget} className="btn-primary w-full justify-center"><Target className="size-4" />Ziel setzen</button>
      </>
    );
  }

  const msg = needed?.reachable
    ? `Für dein Ziel ${formatAverage(target, subject.system, digits)} brauchst du in der ${subject.category === 'nebenfach' && subject.system !== 'oberstufe' ? 'nächsten Note' : 'nächsten großen Leistung'} mindestens ${meta.formatValue(needed.value!)}.`
    : avg === null
      ? `Trag erst ein paar Noten ein, dann rechne ich dir aus, was du fürs Ziel ${formatAverage(target, subject.system, digits)} brauchst.`
      : `Dein Ziel ${formatAverage(target, subject.system, digits)} ist mit der nächsten Leistung allein nicht mehr drin — bleib dran!`;

  // Fortschrittsbalken aktuell → Ziel (0–100 %).
  const pct = (() => {
    if (avg === null) return 0;
    const span = meta.max - meta.min;
    if (span === 0) return 100;
    const norm = (v: number) => meta.goodIsLow ? 1 - (v - meta.min) / span : (v - meta.min) / span;
    return Math.max(0, Math.min(100, Math.round((norm(avg) / Math.max(0.0001, norm(target))) * 100)));
  })();

  return (
    <>
      <h3 className="h3 mb-1 flex items-center gap-2"><Target className="size-4 text-theme" />Notenziel</h3>
      <p className="subtle mb-4 flex-1 leading-relaxed">{msg}</p>
      <div className="flex items-center gap-3.5">
        <div className="flex-shrink-0 size-16 rounded-2xl grid place-items-center text-white font-display font-extrabold text-3xl"
          style={{ background: needed?.value != null ? `linear-gradient(135deg, ${gradeColor(needed.value, subject.system, undefined)}, ${gradeColor(needed.value, subject.system, undefined)}cc)` : 'rgb(var(--ink-300))' }}>
          {needed?.value != null ? meta.formatValue(needed.value).replace(' P', '') : '–'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[11.5px] text-ink-500 mb-1.5"><span>Ziel</span><span className="font-bold text-ink-700">{formatAverage(target, subject.system, digits)}</span></div>
          <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
            <div className="h-full rounded-full theme-gradient" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-ink-400 mt-1.5">aktuell {formatAverage(avg, subject.system, digits)}</div>
        </div>
      </div>
    </>
  );
}

/* ─── Tests-Timeline-Zeile ──────────────────────────────────────────────── */

function TimelineRow({
  item, subject, meta, config, needed, last, onOpen,
}: {
  item: { grade: Grade; status: 'anstehend' | 'ausstehend' | 'vergangen' };
  subject: Subject;
  meta: SystemMeta;
  config: typeof DEFAULT_GRADING_CONFIG;
  needed: { value: number | null; reachable: boolean } | null;
  last: boolean;
  onOpen: () => void;
}) {
  const { grade: g, status } = item;
  const statusMeta = {
    ausstehend: { label: 'ausstehend', dot: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-50' },
    anstehend: { label: 'anstehend', dot: 'var(--theme-primary)', text: 'text-theme', bg: 'bg-theme-soft/50' },
    vergangen: { label: 'vergangen', dot: '#94a3b8', text: 'text-ink-500', bg: 'bg-ink-100' },
  }[status];
  const dotColor = status === 'vergangen' ? gradeColor(g.value, subject.system, config) : statusMeta.dot;
  const showNeeded = status === 'anstehend' && isLargeAssessmentKind(g.kind, config) && subject.targetAverage !== undefined && needed?.value != null;

  return (
    <div className="flex gap-3.5 items-stretch">
      <div className="w-16 flex-shrink-0 text-right text-[11px] text-ink-400 pt-3.5 leading-tight">
        {g.date ? formatDate(g.date, { day: '2-digit', month: 'short' }) : '—'}
      </div>
      <div className="relative w-3.5 flex-shrink-0 flex justify-center">
        {!last && <div className="absolute top-0 bottom-0 w-0.5 bg-ink-200/70" />}
        <div className="relative mt-3.5 size-3 rounded-full border-2 border-white" style={{ background: dotColor, boxShadow: `0 0 0 3px ${dotColor}22` }} />
      </div>
      <div className="flex-1 min-w-0 pb-2.5">
        <button onClick={onOpen} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/60 hover:bg-white border border-white/65 transition text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-ink-800 truncate">{g.title || getKindLabel(g.kind, config)}</span>
              <span className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusMeta.text} ${statusMeta.bg}`}>{statusMeta.label}</span>
            </div>
            <div className="text-xs text-ink-500 mt-0.5">{getKindLabel(g.kind, config)}{g.date ? ` · ${relativeDate(g.date)}` : ''}</div>
          </div>
          {status === 'vergangen' && <GradeBadge value={g.value} system={subject.system} size="md" tendency={g.tendency} />}
          {status === 'ausstehend' && (
            <div className="flex-shrink-0 size-10 rounded-xl grid place-items-center border-2 border-dashed border-ink-300 text-ink-300 font-display font-extrabold text-lg">?</div>
          )}
          {status === 'anstehend' && (
            <div className="text-right flex-shrink-0">
              {g.date && <div className="text-xs font-bold text-theme">{relativeDate(g.date)}</div>}
              {showNeeded && <div className="mt-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Ziel: {meta.formatValue(needed!.value!)} o. besser</div>}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Fokus-Ziel mit Frist (Fach- oder Test-Bindung) ─────────────────────── */

function SubjectFocusGoal({
  subject, subjectGrades, focusSessions, config,
}: {
  subject: Subject;
  subjectGrades: Grade[];
  focusSessions: FocusSession[];
  config: typeof DEFAULT_GRADING_CONFIG;
}) {
  const updateSubject = useStore(s => s.updateSubject);
  const updateGrade = useStore(s => s.updateGrade);
  const now = Date.now();

  const recHasGoal = (x: { focusGoalMinutes?: number; focusDeadline?: number }) =>
    typeof x.focusGoalMinutes === 'number' && typeof x.focusDeadline === 'number';

  // Nur AKTIVE Ziele dieses Fachs: ganzes Fach + Tests, die ein Ziel haben.
  const activeBindings = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    if (recHasGoal(subject)) list.push({ id: 'subject', label: 'Ganzes Fach' });
    for (const g of subjectGrades) if (recHasGoal(g)) list.push({ id: g.id, label: g.title || getKindLabel(g.kind, config) });
    return list;
  }, [subject, subjectGrades, config]);

  // Mögliche Ziele zum Anlegen: Fach (falls noch keins) + Tests ohne Ziel.
  const createTargets = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    if (!recHasGoal(subject)) list.push({ id: 'subject', label: 'Ganzes Fach' });
    for (const g of subjectGrades) if (!recHasGoal(g)) list.push({ id: g.id, label: g.title || getKindLabel(g.kind, config) });
    return list;
  }, [subject, subjectGrades, config]);

  const [binding, setBinding] = useState<string>('subject');
  const [creating, setCreating] = useState(false);

  // Effektiv ausgewähltes aktives Ziel (fällt auf das erste aktive zurück).
  const effective = activeBindings.some(b => b.id === binding) ? binding : (activeBindings[0]?.id ?? 'subject');
  const grade = effective !== 'subject' ? subjectGrades.find(g => g.id === effective) : undefined;
  const target: { focusGoalMinutes?: number; focusDeadline?: number; focusGoalStart?: number } = grade ?? subject;
  const goalMin = target.focusGoalMinutes;
  const deadline = target.focusDeadline;
  const start = target.focusGoalStart ?? (grade ? now : subject.createdAt);
  const match = grade ? (f: FocusSession) => f.gradeId === grade.id : (f: FocusSession) => f.subjectId === subject.id;

  const saveTo = (bindId: string, patch: Partial<Subject> & Partial<Grade>) => {
    const p = { ...patch, updatedAt: Date.now() };
    if (bindId !== 'subject') void updateGrade(bindId, p); else void updateSubject(subject.id, p);
  };
  const save = (patch: Partial<Subject> & Partial<Grade>) => saveTo(effective, patch);
  const clearGoal = () => save({ focusGoalMinutes: undefined, focusDeadline: undefined, focusGoalStart: undefined });
  const createGoal = (bindId: string) => {
    const g = bindId !== 'subject' ? subjectGrades.find(x => x.id === bindId) : undefined;
    const defDeadline = g?.date && g.date > now ? g.date : now + DEFAULT_GOAL_DAYS * DAY;
    saveTo(bindId, { focusGoalMinutes: DEFAULT_GOAL_MINUTES, focusDeadline: endOfDay(toDateInput(defDeadline)), focusGoalStart: now });
    setBinding(bindId);
    setCreating(false);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="h3 flex items-center gap-2"><Flame className="size-5 text-orange-500" />Fokus-Ziel</h3>
        {!creating && activeBindings.length > 0 && createTargets.length > 0 && (
          <button onClick={() => setCreating(true)} className="btn-ghost text-xs"><Plus className="size-3.5" />Erstellen</button>
        )}
      </div>

      {creating ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-500">Wofür ein Ziel?</span>
            {activeBindings.length > 0 && <button onClick={() => setCreating(false)} className="text-ink-400 hover:text-ink-700 transition"><X className="size-4" /></button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {createTargets.map(t => (
              <button key={t.id} onClick={() => createGoal(t.id)} className="inline-flex items-center gap-1.5 text-[11.5px] px-3 py-1.5 rounded-full border font-semibold bg-white/60 text-ink-700 border-white/70 hover:bg-white transition">
                <Plus className="size-3" />{t.label}
              </button>
            ))}
          </div>
        </div>
      ) : activeBindings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 p-5 text-center">
          <p className="subtle mb-4">Noch kein Lernziel für dieses Fach – leg eins fürs ganze Fach oder einen einzelnen Test an.</p>
          <button onClick={() => setCreating(true)} className="btn-primary w-full justify-center"><Flame className="size-4" />Lernziel erstellen</button>
        </div>
      ) : (
        <>
          {activeBindings.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {activeBindings.map(b => (
                <FocusBindingChip key={b.id} active={effective === b.id} onClick={() => setBinding(b.id)}>{b.label}</FocusBindingChip>
              ))}
            </div>
          )}
          <FocusGoalEditor
            sessions={focusSessions}
            match={match}
            start={start}
            goalMinutes={goalMin!}
            deadline={deadline!}
            onSetMinutes={m => save({ focusGoalMinutes: m })}
            onSetDeadline={ms => save({ focusDeadline: ms })}
            onClear={clearGoal}
          />
        </>
      )}
    </>
  );
}

function FocusBindingChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[11.5px] px-3 py-1 rounded-full border font-semibold transition ${
        active ? 'bg-ink-900 text-ink-50 border-ink-900' : 'bg-white/60 text-ink-600 border-white/70 hover:bg-white'
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Was-wäre-wenn-Rechner ──────────────────────────────────────────────── */

interface HypotheticalRow {
  id: string;
  source: 'pending' | 'custom';
  pendingGradeId?: string;
  label: string;
  kind: GradeKind;
  value: number;
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

  const [rows, setRows] = useState<HypotheticalRow[]>(() => pendingGrades.map(makeRowFromPending));
  const [lastPendingIds, setLastPendingIds] = useState<string>(() => pendingGrades.map(g => g.id).sort().join(','));
  const currentPendingIds = pendingGrades.map(g => g.id).sort().join(',');
  if (currentPendingIds !== lastPendingIds) {
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
  const deltaGood = delta === null ? null : meta.goodIsLow ? delta < -0.005 : delta > 0.005;
  const deltaBad = delta === null ? null : meta.goodIsLow ? delta > 0.005 : delta < -0.005;

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
        <div className="space-y-3">
          {rows.map(r => (
            <HypotheticalRowEditor
              key={r.id}
              row={r}
              subject={subject}
              meta={meta}
              config={config}
              allKinds={allKinds}
              onChange={patch => updateRow(r.id, patch)}
              onRemove={() => removeRow(r.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-4 text-[11px] text-ink-400 leading-relaxed flex gap-1.5">
        <Lightbulb className="size-3.5 shrink-0 mt-px" />
        <span>Das hier ändert nichts an deinen echten Noten – nur Simulation. Sobald die Note real ist,
        einfach in der Timeline auf die ausstehende Note klicken und den Wert eintragen.</span>
      </div>
    </>
  );
}

function HypotheticalRowEditor({
  row, subject, meta, config, allKinds, onChange, onRemove,
}: {
  row: HypotheticalRow;
  subject: Subject;
  meta: SystemMeta;
  config: typeof DEFAULT_GRADING_CONFIG;
  allKinds: GradeKind[];
  onChange: (patch: Partial<HypotheticalRow>) => void;
  onRemove: () => void;
}) {
  const isLarge = isLargeAssessmentKind(row.kind, config);
  const showCategoryHint = subject.system === 'oberstufe' || subject.category !== 'nebenfach';
  const weightLabel = isLarge
    ? `Große Leistung · zählt ${subject.category === 'hauptfach' && subject.system !== 'oberstufe' ? '×2' : '1:1'}`
    : 'Kleine Leistung · zählt ×1';

  return (
    <div className="rounded-2xl bg-white/70 border border-white/65 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0"><GradeBadge value={row.value} system={subject.system} size="md" /></div>
        <div className="flex-1 min-w-0">
          <input
            value={row.label}
            onChange={e => onChange({ label: e.target.value })}
            className="w-full bg-transparent font-semibold text-sm text-ink-800 outline-none border-b border-transparent focus:border-ink-300 transition"
            placeholder="Bezeichnung"
          />
          {showCategoryHint && (
            <div className="text-[11.5px] text-ink-500 mt-0.5 flex items-center gap-1.5">
              {isLarge ? <FileText className="size-3.5 shrink-0" /> : <Pencil className="size-3.5 shrink-0" />}
              <span>{weightLabel}</span>
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 size-8 grid place-items-center rounded-full text-ink-400 hover:text-rose-500 hover:bg-rose-50 transition"
          title={row.source === 'pending' ? 'Aus Rechner entfernen' : 'Löschen'}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Notenart */}
      <div className="text-[10.5px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Notenart</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {allKinds.map(k => (
          <button
            key={k}
            onClick={() => onChange({ kind: k })}
            className={`text-[11.5px] px-3 py-1 rounded-full border font-semibold transition ${
              row.kind === k
                ? 'bg-ink-900 text-ink-50 border-ink-900'
                : 'bg-white/60 text-ink-600 border-white/70 hover:bg-white'
            }`}
          >
            {getKindLabel(k, config)}
          </button>
        ))}
      </div>

      {/* Note */}
      <div className="text-[10.5px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Note</div>
      <div className="flex flex-wrap gap-1.5">
        {meta.valueOptions.map(v => {
          const sel = row.value === v;
          const c = gradeColor(v, subject.system, config);
          return (
            <button
              key={v}
              onClick={() => onChange({ value: v })}
              className="flex-1 min-w-[2.25rem] h-11 rounded-xl font-display font-extrabold transition"
              style={sel
                ? { color: '#fff', border: 'none', background: `linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow: `0 7px 16px -7px ${c}`, transform: 'translateY(-1px)' }
                : { color: 'rgb(var(--ink-700))', border: '1px solid rgb(var(--ink-200))', background: 'rgb(var(--surface-rgb))' }}
            >
              {meta.formatValue(v).replace(' P', '')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
