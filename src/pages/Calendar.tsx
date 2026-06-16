import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ChevronLeft, ChevronRight, Palmtree, Check, X,
  NotebookPen, ClipboardCheck, CheckCircle2, SlidersHorizontal,
  LayoutGrid, Columns3, List, GraduationCap,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { GradeDetailDialog } from '@/components/dialogs/GradeDetailDialog';
import { SubjectIcon } from '@/components/SubjectIcon';
import { TaskKindIcon } from '@/components/TaskKindIcon';
import { useStore } from '@/store/useStore';
import { addDays, isSameDay, startOfWeek } from '@/lib/utils';
import { getTaskKindLabel, getKindLabel, gradeLabel } from '@/lib/grading';
import { fetchUpcomingHolidays, isoLocal } from '@/lib/holidays';
import type { AppTask, TaskKind, SchoolHoliday, Grade } from '@/types';
import { BUILTIN_TASK_KINDS } from '@/types';

/** Prefix für Kalender-Pseudo-Aufgaben, die aus anstehenden Tests/Klausuren (pending Grades) stammen. */
const EXAM_ID_PREFIX = 'exam:';

/* ───────────────────────────────────────────────────────────────────────────
   Kalender · „Studio" Redesign
   Features: Ferien-Integration · Hover-Plus pro Tag (Test/Hausaufgabe/Todo)
   · mehrstufiger Filter (Art → Test-Art → Fächer) · Wochenend-Toggle
   · Monat/Woche/Liste · aktueller Tag hervorgehoben.
   ─────────────────────────────────────────────────────────────────────────── */

type ViewMode = 'month' | 'week' | 'list';
/** Oberste Filter-Ebene (die „filter"-Spalte der Skizze). */
type KindGroup = 'all' | 'exam' | 'hausaufgabe' | 'todo';

const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Eine Aufgaben-Art zählt als „Test/Prüfung", wenn sie keine Hausaufgabe und kein Todo ist. */
function isExamKind(kind: TaskKind) {
  return kind !== 'hausaufgabe' && kind !== 'todo';
}
function inGroup(kind: TaskKind, group: KindGroup) {
  if (group === 'all') return true;
  if (group === 'hausaufgabe') return kind === 'hausaufgabe';
  if (group === 'todo') return kind === 'todo';
  return isExamKind(kind);
}

export function CalendarPage() {
  const tasks = useStore(s => s.tasks);
  const grades = useStore(s => s.grades);
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const region = settings?.region;
  const gradingConfig = settings?.gradingConfig;
  const customKinds = settings?.gradingConfig.customKinds ?? [];

  // ── Anstehende Tests/Klausuren = geplante (pending) Noten mit Datum ─────────
  // In dieser App werden angekündigte Prüfungen als „ausstehende Note" angelegt.
  // Sie leben in `grades` (nicht in `tasks`), darum hier als Kalender-Einträge
  // einmischen, damit sie – wie vom User erwartet – im Kalender auftauchen.
  // Tests im Kalender = Noten mit Datum. Ausstehende (noch ohne Note) UND bereits
  // benotete werden gezeigt – benotete erscheinen ausgegraut/abgehakt mit der Note.
  const examGrades = useMemo(() => grades.filter(g => !!g.date), [grades]);
  const examById = useMemo(() => new Map(examGrades.map(g => [EXAM_ID_PREFIX + g.id, g])), [examGrades]);
  const examItems = useMemo<AppTask[]>(() => examGrades.map(g => {
    const base = g.title?.trim() || getKindLabel(g.kind, gradingConfig);
    const graded = !g.isPending;
    const sys = subjects.find(s => s.id === g.subjectId)?.system ?? settings?.system ?? 'bayern';
    return {
      id: EXAM_ID_PREFIX + g.id,
      title: graded ? `${base} · ${gradeLabel(g.value, sys)}${g.tendency ?? ''}` : base,
      kind: g.kind,
      subjectId: g.subjectId,
      dueDate: g.date,
      done: graded,
      priority: 3,
      createdAt: g.date,
      schoolYearId: g.schoolYearId,
    };
  }), [examGrades, gradingConfig, subjects, settings]);

  // ── Ferien laden (unverändert aus der bestehenden Seite) ──────────────────
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!region) { setHolidays([]); return; }
    if (region.country === 'DE' && !region.subdivision) { setHolidays([]); return; }
    fetchUpcomingHolidays(region).then(h => { if (!cancelled) setHolidays(h); });
    return () => { cancelled = true; };
  }, [region?.country, region?.subdivision]);

  // Alle Aufgaben-Arten (Built-ins + User-Custom), wie auf der alten Seite.
  const allKinds = useMemo<Array<{ id: TaskKind; label: string }>>(() => [
    ...BUILTIN_TASK_KINDS.map(id => ({ id, label: getTaskKindLabel(id) })),
    ...customKinds.map(c => ({ id: c.id, label: c.label })),
  ], [customKinds]);
  // Sub-Filter unter „Tests": alle Prüfungs-Arten – aus Aufgaben-Arten (Test,
  // Schulaufgabe, Projekt + Custom) UND den tatsächlich vorhandenen Noten-Arten
  // der anstehenden Tests (Schulaufgabe, Klausur, Stegreif, Referat, …).
  const examKinds = useMemo(() => {
    const ids = new Set<string>();
    for (const k of allKinds) if (isExamKind(k.id)) ids.add(k.id);
    for (const g of examGrades) ids.add(g.kind);
    return [...ids].map(id => {
      const taskLabel = getTaskKindLabel(id, gradingConfig);
      return { id, label: taskLabel !== id ? taskLabel : getKindLabel(id, gradingConfig) };
    });
  }, [allKinds, examGrades, gradingConfig]);

  // ── View / Navigation ─────────────────────────────────────────────────────
  const weekStartsOn = 1 as 0 | 1; // Woche beginnt fest am Montag (deutscher Standard)
  const [view, setView] = useState<ViewMode>('month');
  const [showWeekends, setShowWeekends] = useState(true);
  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  const navigate = (dir: -1 | 1) => setAnchor(a => {
    const d = new Date(a);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    return d;
  });
  const goToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); };

  // ── Filter ──────────────────────────────────────────────────────────────────
  const [group, setGroup] = useState<KindGroup>('all');
  const [subKind, setSubKind] = useState<TaskKind | null>(null);
  const [subjectSel, setSubjectSel] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);

  const setGroupSafe = (g: KindGroup) => { setGroup(g); if (g !== 'exam') setSubKind(null); };
  const toggleSubject = (id: string) => setSubjectSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const activeFilters = (group !== 'all' ? 1 : 0) + (subKind ? 1 : 0) + subjectSel.size + (showDone ? 1 : 0);
  const resetFilter = () => { setGroup('all'); setSubKind(null); setSubjectSel(new Set()); setShowDone(false); };

  const filtered = useMemo(() => [...tasks, ...examItems].filter(t => {
    // Benotete Tests bleiben immer sichtbar – der „Erledigte"-Schalter betrifft nur Aufgaben/Todos.
    const isExam = t.id.startsWith(EXAM_ID_PREFIX);
    if (!showDone && t.done && !isExam) return false;
    if (!inGroup(t.kind, group)) return false;
    if (group === 'exam' && subKind && t.kind !== subKind) return false;
    if (subjectSel.size && (!t.subjectId || !subjectSel.has(t.subjectId))) return false;
    return true;
  }), [tasks, examItems, group, subKind, subjectSel, showDone]);

  // ── Dialoge ────────────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [editor, setEditor] = useState<{ open: boolean; task?: Partial<AppTask>; defaultKind?: TaskKind }>({ open: false });
  const [examDetail, setExamDetail] = useState<{ open: boolean; grade?: Grade }>({ open: false });
  const [examEditor, setExamEditor] = useState<{ open: boolean; grade?: Partial<Grade> }>({ open: false });
  const openNew = (d?: Date, kind?: TaskKind) => setEditor({ open: true, task: d ? { dueDate: d.getTime() } : undefined, defaultKind: kind });
  // Neue Note über den Kopf-Button (normale Note) bzw. neuer „Test" über das Tages-Menü
  // (angekündigte Note = isPending, mit dem Datum des angeklickten Tages).
  const openNewGrade = () => setExamEditor({ open: true });
  const openNewExam = (d: Date) => setExamEditor({ open: true, grade: { isPending: true, date: d.getTime() } });

  // Klick auf einen Eintrag: anstehende Tests öffnen den Noten-Dialog, sonst den Aufgaben-Dialog.
  const openItem = (t: AppTask) => {
    const exam = examById.get(t.id);
    if (exam) setExamDetail({ open: true, grade: exam });
    else setDetail({ open: true, task: t });
  };

  const subjMap = useMemo(() => Object.fromEntries(subjects.map(s => [s.id, s])), [subjects]);

  return (
    <PageShell title="Kalender" subtitle="Alle Aufgaben, Tests & Ferien auf einen Blick." hideHeader>
      {/* ── Gradient-Headerband ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl mb-4 theme-gradient px-6 py-5 shadow-glow">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(at 85% 20%, rgba(255,255,255,.5), transparent 55%)' }} />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-white/70 text-[11px] font-bold uppercase tracking-widest mb-1">Schulplaner</div>
            <h1 className="font-display text-3xl font-extrabold text-white tracking-tight">Kalender</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn bg-white/20 text-white hover:bg-white/30 border border-white/40" onClick={openNewGrade}>
              <GraduationCap className="size-4" strokeWidth={2.4} />Note
            </button>
            <button className="btn bg-white/95 text-theme-deep hover:bg-white" onClick={() => openNew()}>
              <Plus className="size-4" strokeWidth={2.6} />Neu
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter-Pill (mehrstufig) ────────────────────────────────────────── */}
      <div className="rounded-3xl glass-strong shadow-soft p-2.5 mb-4 flex items-center gap-2 flex-wrap">
        <GroupChip active={group === 'all'} onClick={() => setGroupSafe('all')} dark icon={<SlidersHorizontal className="size-3.5" />}>Alle</GroupChip>
        <GroupChip active={group === 'exam'} onClick={() => setGroupSafe(group === 'exam' ? 'all' : 'exam')} icon={<ClipboardCheck className="size-3.5" />}>Tests</GroupChip>
        <GroupChip active={group === 'hausaufgabe'} onClick={() => setGroupSafe(group === 'hausaufgabe' ? 'all' : 'hausaufgabe')} icon={<NotebookPen className="size-3.5" />}>Hausaufgaben</GroupChip>
        <GroupChip active={group === 'todo'} onClick={() => setGroupSafe(group === 'todo' ? 'all' : 'todo')} icon={<CheckCircle2 className="size-3.5" />}>Todos</GroupChip>

        {/* Test-Art — nur sichtbar, wenn „Tests" gewählt ist (Skizze) */}
        <AnimatePresence>
          {group === 'exam' && (
            <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }}
              className="flex items-center gap-1.5 flex-wrap">
              <span className="w-px self-stretch bg-ink-200/70 mx-1" />
              <ExamChip active={!subKind} onClick={() => setSubKind(null)}>Alle Tests</ExamChip>
              {examKinds.map(k => (
                <ExamChip key={k.id} active={subKind === k.id} onClick={() => setSubKind(subKind === k.id ? null : k.id)}>
                  <TaskKindIcon kind={k.id} className="size-3.5" />{k.label}
                </ExamChip>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <span className="w-px self-stretch bg-ink-200/70 mx-1" />
        {/* Fächer als farbige Punkte */}
        <div className="flex flex-wrap items-center gap-1.5">
          {subjects.map(s => {
            const on = subjectSel.has(s.id); const any = subjectSel.size > 0;
            return (
              <button key={s.id} onClick={() => toggleSubject(s.id)} title={s.name}
                className={`size-7 rounded-full grid place-items-center transition border-2 ${on || !any ? '' : 'opacity-35 grayscale'}`}
                style={{ background: s.color, borderColor: on ? '#fff' : 'transparent', boxShadow: on ? `0 0 0 2px ${s.color}` : 'none' }}>
                <SubjectIcon subject={s} className="size-3.5 text-white" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 ml-auto pl-2">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-600 select-none cursor-pointer">
            <span>Erledigte</span><Toggle checked={showDone} onChange={setShowDone} />
          </label>
          {activeFilters > 0 && <button onClick={resetFilter} className="chip hover:bg-white text-ink-500"><X className="size-3" />Reset</button>}
        </div>
      </div>

      {/* ── Kalender-Karte ──────────────────────────────────────────────────── */}
      <Card>
        <Toolbar view={view} setView={setView} anchor={anchor} navigate={navigate} goToday={goToday}
          showWeekends={showWeekends} setShowWeekends={setShowWeekends} weekStartsOn={weekStartsOn} />

        <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {view === 'month' && <MonthView anchor={anchor} tasks={filtered} holidays={holidays} subjMap={subjMap}
            showWeekends={showWeekends} weekStartsOn={weekStartsOn} onSelect={openItem} onNew={openNew} onNewExam={openNewExam} />}
          {view === 'week' && <WeekView anchor={anchor} tasks={filtered} holidays={holidays} subjMap={subjMap}
            showWeekends={showWeekends} weekStartsOn={weekStartsOn} onSelect={openItem} onNew={openNew} onNewExam={openNewExam} />}
          {view === 'list' && <ListView anchor={anchor} tasks={filtered} holidays={holidays} subjMap={subjMap}
            onSelect={openItem} onNew={openNew} onNewExam={openNewExam} />}
        </motion.div>

        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
          <Palmtree className="size-3.5 cal-hol-icon" /><span>Schulferien werden automatisch markiert · Über einen Tag fahren ⇒ „+" zum Hinzufügen</span>
        </div>
      </Card>

      <TaskDetailDialog open={detail.open} task={detail.task} onClose={() => setDetail({ open: false })}
        onEdit={t => { setDetail({ open: false }); setEditor({ open: true, task: t }); }} />
      <TaskDialog open={editor.open} initial={editor.task} defaultKind={editor.defaultKind} onClose={() => setEditor({ open: false })} />

      {/* Anstehende Tests/Klausuren (pending Noten) öffnen den Noten-Dialog */}
      <GradeDetailDialog open={examDetail.open} grade={examDetail.grade} onClose={() => setExamDetail({ open: false })}
        onEdit={g => { setExamDetail({ open: false }); setExamEditor({ open: true, grade: g }); }} />
      <GradeDialog open={examEditor.open} initial={examEditor.grade} onClose={() => setExamEditor({ open: false })} />
    </PageShell>
  );
}

/* ── Toolbar: Monats-Navigation · Wochenende · Ansicht ──────────────────────── */
function Toolbar({ view, setView, anchor, navigate, goToday, showWeekends, setShowWeekends, weekStartsOn }: {
  view: ViewMode; setView: (v: ViewMode) => void; anchor: Date; navigate: (d: -1 | 1) => void; goToday: () => void;
  showWeekends: boolean; setShowWeekends: (b: boolean) => void; weekStartsOn: 0 | 1;
}) {
  let label: string;
  if (view === 'week') {
    const ws = startOfWeek(anchor, weekStartsOn); const we = addDays(ws, showWeekends ? 6 : 4);
    const sameMonth = ws.getMonth() === we.getMonth();
    label = `${ws.getDate()}.${sameMonth ? '' : ' ' + ws.toLocaleDateString('de-DE', { month: 'short' })} – ${we.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else label = anchor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const views: Array<{ id: ViewMode; label: string; Icon: typeof LayoutGrid }> = [
    { id: 'month', label: 'Monat', Icon: LayoutGrid },
    { id: 'week', label: 'Woche', Icon: Columns3 },
    { id: 'list', label: 'Liste', Icon: List },
  ];
  return (
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <button className="size-9 grid place-items-center rounded-full hover:bg-white/80 text-ink-600" onClick={() => navigate(-1)}><ChevronLeft className="size-[18px]" /></button>
        <div className="font-display font-bold text-xl min-w-[160px] text-center capitalize text-ink-900">{label}</div>
        <button className="size-9 grid place-items-center rounded-full hover:bg-white/80 text-ink-600" onClick={() => navigate(1)}><ChevronRight className="size-[18px]" /></button>
        <button onClick={goToday} className="chip ml-1 hover:bg-white">Heute</button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-[13px] font-medium text-ink-600 select-none cursor-pointer">
          <span>Wochenende</span><Toggle checked={showWeekends} onChange={setShowWeekends} />
        </label>
        <div className="flex items-center gap-0.5 p-1 rounded-2xl bg-white/55 border border-white/60">
          {views.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold transition ${view === id ? 'theme-gradient text-white shadow-glow' : 'text-ink-600 hover:bg-white/70'}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Hilfs-Hook: gruppiere gefilterte Aufgaben pro Tag ──────────────────────── */
function useTasksByDay(tasks: AppTask[]) {
  return useMemo(() => {
    const m = new Map<string, AppTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const k = isoLocal(new Date(t.dueDate));
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority);
    return m;
  }, [tasks]);
}
function useHolidayMap(holidays: SchoolHoliday[]) {
  return useMemo(() => {
    const m = new Map<string, { holiday: SchoolHoliday; isStart: boolean }>();
    for (const h of holidays) {
      const start = new Date(h.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(h.endDate); end.setHours(0, 0, 0, 0);
      for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        const key = isoLocal(cur);
        if (!m.has(key)) m.set(key, { holiday: h, isStart: cur.getTime() === start.getTime() });
      }
    }
    return m;
  }, [holidays]);
}

type ViewProps = {
  anchor: Date; tasks: AppTask[]; holidays: SchoolHoliday[]; subjMap: Record<string, any>;
  showWeekends?: boolean; weekStartsOn?: 0 | 1; onSelect: (t: AppTask) => void; onNew: (d: Date, kind?: TaskKind) => void;
  onNewExam: (d: Date) => void;
};

/* ── MONAT ──────────────────────────────────────────────────────────────────── */
function MonthView({ anchor, tasks, holidays, subjMap, showWeekends = true, weekStartsOn = 1, onSelect, onNew, onNewExam }: ViewProps) {
  const byDay = useTasksByDay(tasks); const holMap = useHolidayMap(holidays);
  const monthStart = new Date(anchor); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const visible = showWeekends ? cells : cells.filter((_, i) => i % 7 < 5);
  const cols = showWeekends ? 7 : 5;
  const rows = visible.length / cols;
  const wd = showWeekends ? WD_SHORT : WD_SHORT.slice(0, 5);

  return (
    <div>
      <div className="grid gap-1 text-center text-[11px] font-bold text-ink-400 mb-1 uppercase tracking-wide" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
        {wd.map((d, i) => <div key={d} className={i >= 5 ? 'text-theme/60' : ''}>{d}</div>)}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridAutoRows: `minmax(${rows > 5 ? 88 : 104}px,1fr)` }}>
        {visible.map((d, i) => (
          <DayCell key={i} date={d} inMonth={d.getMonth() === monthStart.getMonth()}
            tasks={byDay.get(isoLocal(d)) ?? []} holiday={holMap.get(isoLocal(d))} subjMap={subjMap} onSelect={onSelect} onNew={onNew} onNewExam={onNewExam} max={3} />
        ))}
      </div>
    </div>
  );
}

function DayCell({ date, inMonth, tasks, holiday, subjMap, onSelect, onNew, onNewExam, max }: {
  date: Date; inMonth: boolean; tasks: AppTask[]; holiday?: { holiday: SchoolHoliday; isStart: boolean };
  subjMap: Record<string, any>; onSelect: (t: AppTask) => void; onNew: (d: Date, kind?: TaskKind) => void; onNewExam: (d: Date) => void; max: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isToday = isSameDay(date, new Date());
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  let cls = 'bg-white/55 border-white/60 hover:bg-white/85';
  if (!inMonth) cls = 'bg-white/15 border-transparent';
  if (holiday) cls = inMonth ? 'cal-hol' : 'cal-hol-faded';
  if (isToday) cls = 'cal-today border-transparent';

  return (
    <div className={`group relative rounded-xl p-1.5 border transition ${cls} ${menuOpen ? 'z-40' : ''}`} style={{ minWidth: 0 }}>
      <div className="flex items-center justify-between gap-1">
        <div className={`grid place-items-center text-[11.5px] font-bold ${isToday ? 'size-[22px] rounded-full theme-gradient text-white shadow-glow' : holiday && inMonth ? 'cal-hol-num' : inMonth ? 'text-ink-700' : 'text-ink-300'}`}>{date.getDate()}</div>
        <div className="flex items-center gap-0.5">
          {holiday && inMonth && <Palmtree className="size-3 cal-hol-icon" />}
          {inMonth && <AddMenu open={menuOpen} setOpen={setMenuOpen} date={date} onNew={onNew} onNewExam={onNewExam} anchor={weekend ? 'left' : 'right'} />}
        </div>
      </div>
      {holiday?.isStart && inMonth && <div className="mt-0.5 text-[8.5px] font-bold cal-hol-name uppercase tracking-wide truncate">{holiday.holiday.name}</div>}
      <div className="mt-1 flex flex-col gap-0.5">
        {tasks.slice(0, max).map(t => <TaskPill key={t.id} task={t} subject={t.subjectId ? subjMap[t.subjectId] : null} onClick={() => onSelect(t)} />)}
        {tasks.length > max && <div className="text-[10px] font-medium text-ink-400 px-1">+{tasks.length - max} mehr</div>}
      </div>
    </div>
  );
}

/* ── WOCHE ──────────────────────────────────────────────────────────────────── */
function WeekView({ anchor, tasks, holidays, subjMap, showWeekends = true, weekStartsOn = 1, onSelect, onNew, onNewExam }: ViewProps) {
  const byDay = useTasksByDay(tasks); const holMap = useHolidayMap(holidays);
  const ws = startOfWeek(anchor, weekStartsOn);
  const n = showWeekends ? 7 : 5;
  const days = Array.from({ length: n }, (_, i) => addDays(ws, i));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n},1fr)` }}>
      {days.map((d, i) => (
        <WeekDayColumn key={i} date={d} weekdayIdx={i} cols={n}
          tasks={byDay.get(isoLocal(d)) ?? []} holiday={holMap.get(isoLocal(d))} subjMap={subjMap} onSelect={onSelect} onNew={onNew} onNewExam={onNewExam} />
      ))}
    </div>
  );
}

function WeekDayColumn({ date, weekdayIdx, cols, tasks, holiday, subjMap, onSelect, onNew, onNewExam }: {
  date: Date; weekdayIdx: number; cols: number; tasks: AppTask[]; holiday?: { holiday: SchoolHoliday; isStart: boolean };
  subjMap: Record<string, any>; onSelect: (t: AppTask) => void; onNew: (d: Date, kind?: TaskKind) => void; onNewExam: (d: Date) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isToday = isSameDay(date, new Date());
  return (
    <div className={`group relative rounded-2xl border min-h-[360px] p-2 flex flex-col transition ${isToday ? 'cal-today border-transparent' : holiday ? 'cal-hol' : 'bg-white/45 border-white/55 hover:bg-white/70'} ${menuOpen ? 'z-40' : ''}`}>
      <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-white/60">
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-wide ${weekdayIdx >= 5 ? 'text-theme/70' : 'text-ink-400'}`}>{WD_SHORT[weekdayIdx]}</div>
          <div className={`font-display font-extrabold leading-none text-[22px] ${isToday ? 'text-theme-deep' : 'text-ink-800'}`}>{date.getDate()}</div>
        </div>
        <AddMenu open={menuOpen} setOpen={setMenuOpen} date={date} onNew={onNew} onNewExam={onNewExam} anchor={weekdayIdx >= cols - 2 ? 'left' : 'right'} />
      </div>
      {holiday && <div className="mb-1 flex items-center gap-1 text-[10px] font-bold cal-hol-name uppercase tracking-wide"><Palmtree className="size-3 cal-hol-icon" />{holiday.holiday.name}</div>}
      <div className="flex flex-col gap-1">
        {tasks.map(t => <TaskPill key={t.id} task={t} subject={t.subjectId ? subjMap[t.subjectId] : null} onClick={() => onSelect(t)} size="md" />)}
        {!tasks.length && !holiday && <div className="text-[11px] text-ink-300 px-1 py-2">—</div>}
      </div>
    </div>
  );
}

/* ── LISTE / Agenda ───────────────────────────────────────────────────────────── */
function ListView({ anchor, tasks, holidays, subjMap, onSelect, onNew, onNewExam }: ViewProps) {
  const byDay = useTasksByDay(tasks); const holMap = useHolidayMap(holidays);
  const y = anchor.getFullYear(), mo = anchor.getMonth();
  const rows = useMemo(() => {
    const inMonth = tasks.filter(t => { if (!t.dueDate) return false; const d = new Date(t.dueDate); return d.getFullYear() === y && d.getMonth() === mo; });
    const keys = [...new Set(inMonth.map(t => isoLocal(new Date(t.dueDate!))))].sort();
    return keys.map(k => ({ key: k, date: new Date(k + 'T00:00:00'), tasks: byDay.get(k) ?? [] }));
  }, [tasks, byDay, y, mo]);

  if (!rows.length) return (
    <div className="grid place-items-center py-16 text-center">
      <div className="font-display font-bold text-ink-700">Keine Aufgaben in diesem Monat</div>
      <div className="subtle mt-1">Passe die Filter an oder lege mit „Neu" etwas an.</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(({ key, date, tasks }) => (
        <ListDayRow key={key} date={date} tasks={tasks} holiday={holMap.get(key)} subjMap={subjMap} onSelect={onSelect} onNew={onNew} onNewExam={onNewExam} />
      ))}
    </div>
  );
}

function ListDayRow({ date, tasks, holiday, subjMap, onSelect, onNew, onNewExam }: {
  date: Date; tasks: AppTask[]; holiday?: { holiday: SchoolHoliday; isStart: boolean };
  subjMap: Record<string, any>; onSelect: (t: AppTask) => void; onNew: (d: Date, kind?: TaskKind) => void; onNewExam: (d: Date) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isToday = isSameDay(date, new Date());
  return (
    <div className={`group relative flex gap-4 rounded-2xl border p-3 transition ${isToday ? 'cal-today border-transparent' : 'bg-white/50 border-white/60 hover:bg-white/75'} ${menuOpen ? 'z-40' : ''}`}>
      <div className="w-16 flex-shrink-0 text-center pt-0.5">
        <div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-theme-deep' : 'text-ink-400'}`}>{WD_SHORT[(date.getDay() + 6) % 7]}</div>
        <div className={`font-display font-extrabold text-2xl leading-tight ${isToday ? 'text-theme-deep' : 'text-ink-800'}`}>{date.getDate()}</div>
        {isToday && <div className="text-[9px] font-bold text-theme-deep uppercase">Heute</div>}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {holiday && <div className="flex items-center gap-1.5 text-[12px] font-bold cal-hol-name"><Palmtree className="size-3.5 cal-hol-icon" />{holiday.holiday.name}</div>}
        {tasks.map(t => {
          const s = t.subjectId ? subjMap[t.subjectId] : null;
          return (
            <button key={t.id} onClick={() => onSelect(t)} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 bg-white/70 border border-white/70 hover:bg-white transition text-left ${t.done ? 'opacity-50' : ''}`}>
              <span className="size-7 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: s ? s.color : '#64748b' }}><TaskKindIcon kind={t.kind} className="size-3.5" /></span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] font-semibold text-ink-800 truncate ${t.done ? 'line-through' : ''}`}>{t.title}</span>
                <span className="block text-[11px] text-ink-400">{getTaskKindLabel(t.kind)}{s ? ' · ' + s.name : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
      <AddMenu open={menuOpen} setOpen={setMenuOpen} date={date} onNew={onNew} onNewExam={onNewExam} anchor="left" className="self-start" />
    </div>
  );
}

/* ── Aufgaben-Pille ───────────────────────────────────────────────────────────── */
function TaskPill({ task, subject, onClick, size = 'sm' }: { task: AppTask; subject: any; onClick: () => void; size?: 'sm' | 'md' }) {
  const color = subject?.color ?? '#64748b';
  const pad = size === 'sm' ? 'px-1.5 py-[3px] text-[10.5px]' : 'px-2 py-1 text-[12px]';
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={task.title}
      className={`flex items-center gap-1 w-full rounded-md font-medium text-white text-left transition ${pad} ${task.done ? 'opacity-45 line-through' : 'hover:brightness-110'}`}
      style={{ background: color }}>
      <TaskKindIcon kind={task.kind} className="size-3 flex-shrink-0 opacity-90" />
      <span className="truncate flex-1">{task.title}</span>
    </button>
  );
}

/* ── Hover-Plus → kleines Menü (Test / Hausaufgabe / Todo) → TaskDialog ────────── */
function AddMenu({ open, setOpen, date, onNew, onNewExam, anchor = 'right', className = '' }: { open: boolean; setOpen: (b: boolean) => void; date: Date; onNew: (d: Date, kind?: TaskKind) => void; onNewExam: (d: Date) => void; anchor?: 'left' | 'right'; className?: string }) {
  useEffect(() => {
    if (!open) return;
    let added = false;
    const close = () => setOpen(false);
    const t = setTimeout(() => { document.addEventListener('click', close, { once: true }); added = true; }, 0);
    return () => { clearTimeout(t); if (added) document.removeEventListener('click', close); };
  }, [open]);

  const items: Array<{ kind: TaskKind; label: string; Icon: typeof NotebookPen }> = [
    { kind: 'hausaufgabe', label: 'Hausaufgabe', Icon: NotebookPen },
    { kind: 'todo', label: 'Todo', Icon: CheckCircle2 },
  ];
  return (
    <div className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`grid place-items-center size-[18px] rounded-lg border shadow-sm transition ${open ? 'theme-gradient text-white border-transparent opacity-100' : 'bg-white/80 border-white/70 text-theme opacity-0 group-hover:opacity-100 hover:bg-theme hover:text-white hover:border-transparent'}`}>
        <Plus className="size-3.5" strokeWidth={2.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }}
            className={`absolute z-50 top-7 ${anchor === 'right' ? 'right-0' : 'left-0'} w-[150px] rounded-xl p-1 cal-pop`}>
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">Hinzufügen</div>
            <button onClick={() => { setOpen(false); onNewExam(date); }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12.5px] font-semibold text-ink-700 hover:bg-theme-soft/60 hover:text-theme-deep transition text-left">
              <ClipboardCheck className="size-4 text-theme" />Test
            </button>
            {items.map(({ kind, label, Icon }) => (
              <button key={kind} onClick={() => { setOpen(false); onNew(date, kind); }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[12.5px] font-semibold text-ink-700 hover:bg-theme-soft/60 hover:text-theme-deep transition text-left">
                <Icon className="size-4 text-theme" />{label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Chips & Toggle ──────────────────────────────────────────────────────────── */
function GroupChip({ active, onClick, icon, dark, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; dark?: boolean; children: React.ReactNode }) {
  const cls = active ? (dark ? 'bg-ink-900 text-ink-50 border-ink-900' : 'theme-gradient text-white border-transparent shadow-glow') : 'bg-white/65 border-white/70 text-ink-600 hover:bg-white';
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition ${cls}`}>{icon}{children}</button>;
}
function ExamChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition ${active ? 'bg-orange-500 text-white border-transparent shadow-sm' : 'bg-white/65 border-white/70 text-ink-600 hover:bg-white'}`}>{children}</button>;
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${checked ? 'theme-gradient' : 'bg-ink-200'}`}>
      <span className={`absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
    </button>
  );
}
