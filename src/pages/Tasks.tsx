import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Filter, SlidersHorizontal, CheckCircle2, Circle, AlertTriangle, Inbox,
  RefreshCw, Trash2, Pencil, Share2, Flame, ArrowRight, CalendarDays, Clock,
  Flag, AlarmClock, List, LayoutGrid, X, Check, ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { relativeDate, formatShortDate, daysUntil } from '@/lib/utils';
import { getTaskKindLabel } from '@/lib/grading';
import { sameHomework } from '@/lib/homeworkMatch';
import { TaskKindIcon } from '@/components/TaskKindIcon';
import type { AppTask, FriendTask, TaskKind, Subject, GradingSystemConfig } from '@/types';
import { BUILTIN_TASK_KINDS } from '@/types';

type Layout = 'liste' | 'kacheln';
type SubjMap = Record<string, Subject>;

type BucketKey = 'overdue' | 'heute' | 'morgen' | 'thisWeek' | 'nextWeek' | 'later' | 'noDate';

interface Bucket {
  key: BucketKey;
  label: string;
  hint?: string;
  tone: 'danger' | 'warn' | 'default' | 'muted';
  icon: LucideIcon;
  items: AppTask[];
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── Dringlichkeits-Ton (Farbe/Hintergrund/Text) je nach Restzeit. ───────────
interface Urgency { key: string; color: string; bg: string; text: string; }
function urgency(ts: number | undefined, done?: boolean): Urgency {
  if (done) return { key: 'done', color: '#10b981', bg: 'rgba(16,185,129,.12)', text: '#047857' };
  if (ts == null) return { key: 'none', color: '#94a3b8', bg: 'rgba(148,163,184,.14)', text: '#64748b' };
  const d = daysUntil(ts);
  if (d < 0)   return { key: 'overdue',  color: '#e11d48', bg: 'rgba(225,29,72,.12)',  text: '#be123c' };
  if (d === 0) return { key: 'today',    color: '#f97316', bg: 'rgba(249,115,22,.14)', text: '#c2410c' };
  if (d === 1) return { key: 'tomorrow', color: '#f59e0b', bg: 'rgba(245,158,11,.14)', text: '#b45309' };
  if (d <= 7)  return { key: 'soon',     color: '#6366f1', bg: 'rgba(99,102,241,.12)', text: '#4338ca' };
  return { key: 'later', color: '#64748b', bg: 'rgba(100,116,139,.10)', text: '#475569' };
}

// Mitschüler-Avatar-Farbe: deterministisch aus dem Namen (FriendTask hat keine).
const AVATAR_COLORS = ['#6366f1', '#db2777', '#0ea5e9', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#e11d48'];
function ownerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ════════════════════════════ PAGE ══════════════════════════════════════════

export function TasksPage() {
  const tasks = useStore(s => s.tasks);
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const toggleTask = useStore(s => s.toggleTask);
  const deleteTask = useStore(s => s.deleteTask);
  const friendTasks = useStore(s => s.friendTasks);
  const friendTasksLoading = useStore(s => s.friendTasksLoading);
  const dismissedFriendTaskIds = useStore(s => s.dismissedFriendTaskIds);
  const refreshFriendTasks = useStore(s => s.refreshFriendTasks);
  const dismissFriendTask = useStore(s => s.dismissFriendTask);
  const acceptFriendTask = useStore(s => s.acceptFriendTask);
  const friends = useStore(s => s.friends);

  const config = settings?.gradingConfig;
  const customKinds = config?.customKinds ?? [];

  const subjById = useMemo<SubjMap>(() => Object.fromEntries(subjects.map(s => [s.id, s])), [subjects]);

  const allKinds = useMemo<Array<{ id: TaskKind; label: string }>>(() => [
    ...BUILTIN_TASK_KINDS.map(id => ({ id: id as TaskKind, label: getTaskKindLabel(id) })),
    ...customKinds.map(c => ({ id: c.id, label: c.label })),
  ], [customKinds]);

  const [layout, setLayout] = useState<Layout>(() => {
    try { return (localStorage.getItem('aufgaben-layout') as Layout) || 'liste'; } catch { return 'liste'; }
  });
  const chooseLayout = (v: Layout) => { setLayout(v); try { localStorage.setItem('aufgaben-layout', v); } catch { /* ignore */ } };

  const [filterKind, setFilterKind] = useState<TaskKind | null>(null);
  const [subjectSel, setSubjectSel] = useState<Set<string>>(() => new Set());
  const [showDone, setShowDone] = useState(false);
  const [detail, setDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [editor, setEditor] = useState<{ open: boolean; task?: Partial<AppTask> }>({ open: false });

  const toggleSubject = (id: string) => setSubjectSel(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const resetFilter = () => { setFilterKind(null); setSubjectSel(new Set()); setShowDone(false); };
  const activeFilters = (filterKind ? 1 : 0) + subjectSel.size + (showDone ? 1 : 0);

  const filtered = useMemo(() => tasks.filter(t => {
    if (!showDone && t.done) return false;
    if (filterKind && t.kind !== filterKind) return false;
    if (subjectSel.size && (!t.subjectId || !subjectSel.has(t.subjectId))) return false;
    return true;
  }), [tasks, filterKind, subjectSel, showDone]);

  // Eingehende Hausaufgaben (Inbox) – im Store vorgefiltert, hier nur UI-Filter + abgelehnte raus.
  const inboxTasks = useMemo(() => {
    const selNames = [...subjectSel].map(id => subjById[id]?.name.toLowerCase()).filter(Boolean) as string[];
    return friendTasks.filter(ft => {
      if (dismissedFriendTaskIds.has(ft.id)) return false;
      if (filterKind && ft.kind !== filterKind) return false;
      if (selNames.length && (!ft.subjectName || !selNames.includes(ft.subjectName.toLowerCase()))) return false;
      return true;
    });
  }, [friendTasks, filterKind, subjectSel, subjById, dismissedFriendTaskIds]);

  const buckets = useMemo<Bucket[]>(() => computeBuckets(filtered), [filtered]);

  const openCount = tasks.filter(t => !t.done).length;
  const doneCount = tasks.filter(t => t.done).length;

  const onSelect = (t: AppTask) => setDetail({ open: true, task: t });
  const showInbox = friends.length > 0;

  return (
    <PageShell
      title="Aufgaben"
      subtitle={`${openCount} offen · ${doneCount} erledigt`}
      actions={
        <div className="flex items-center gap-2">
          <ViewToggle layout={layout} setLayout={chooseLayout} />
          <button className="btn-primary" onClick={() => setEditor({ open: true })}>
            <Plus className="size-4" strokeWidth={2.5} />Neu
          </button>
        </div>
      }
    >
      <FilterBar
        allKinds={allKinds} subjects={subjects}
        filterKind={filterKind} setFilterKind={setFilterKind}
        subjectSel={subjectSel} toggleSubject={toggleSubject}
        showDone={showDone} setShowDone={setShowDone}
        activeFilters={activeFilters} resetFilter={resetFilter}
      />

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* ── Eigene Aufgaben ── */}
        <div className="flex-1 min-w-0 w-full">
          {buckets.length === 0 ? (
            <EmptyState hasTasks={tasks.length > 0} onNew={() => setEditor({ open: true })} />
          ) : layout === 'liste' ? (
            <div className="flex flex-col gap-4">
              {buckets.map((b, idx) => (
                <motion.div key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                  <ListBucket bucket={b} subjById={subjById} config={config} onSelect={onSelect} onToggle={toggleTask} onDelete={deleteTask} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {buckets.map((b, idx) => (
                <motion.div key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                  <TileBucket bucket={b} subjById={subjById} config={config} onSelect={onSelect} onToggle={toggleTask} onDelete={deleteTask} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* ── Inbox: geteilte Hausaufgaben von Mitschülern ── */}
        {showInbox && (
          <aside className="order-first xl:order-none w-full xl:w-[340px] flex-shrink-0 xl:sticky xl:top-4">
            <InboxPanel
              items={inboxTasks} ownTasks={tasks} subjById={subjById}
              loading={friendTasksLoading} onRefresh={() => refreshFriendTasks()}
              onAccept={acceptFriendTask} onReject={dismissFriendTask}
            />
          </aside>
        )}
      </div>

      <TaskDetailDialog
        open={detail.open}
        task={detail.task}
        onClose={() => setDetail({ open: false })}
        onEdit={t => { setDetail({ open: false }); setEditor({ open: true, task: t }); }}
      />
      <TaskDialog open={editor.open} initial={editor.task} onClose={() => setEditor({ open: false })} />
    </PageShell>
  );
}

// ── Bucket-Berechnung (nur eigene Aufgaben). ─────────────────────────────────
function computeBuckets(own: AppTask[]): Bucket[] {
  const DAY = 86400000;
  const today = startOfDay(Date.now());
  const tomorrow = today + DAY, dayAfter = today + 2 * DAY;
  // „Diese Woche" = alle Tage bis einschließlich kommenden Sonntag (Kalenderwoche, Mo–So).
  const weekday = new Date(today).getDay();
  const sunThisWeek = startOfDay(today + ((7 - weekday) % 7) * DAY); // Beginn des kommenden Sonntags
  const sunNextWeek = startOfDay(sunThisWeek + 7 * DAY);             // Sonntag der nächsten Woche
  const B: Record<BucketKey, AppTask[]> = {
    overdue: [], heute: [], morgen: [], thisWeek: [], nextWeek: [], later: [], noDate: [],
  };

  for (const t of own) {
    if (t.dueDate == null) { B.noDate.push(t); continue; }
    const due = startOfDay(t.dueDate);
    if (!t.done && due < today - 86400000) { B.overdue.push(t); continue; }
    if (due === today) B.heute.push(t);
    else if (due === tomorrow) B.morgen.push(t);
    else if (due >= dayAfter && due <= sunThisWeek) B.thisWeek.push(t);
    else if (due > sunThisWeek && due <= sunNextWeek) B.nextWeek.push(t);
    else if (due > sunNextWeek) B.later.push(t);
    else B.heute.push(t);
  }
  const sortOwn = (a: AppTask, b: AppTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || b.priority - a.priority;
  Object.values(B).forEach(arr => arr.sort(sortOwn));

  const meta: Array<Omit<Bucket, 'items'>> = [
    { key: 'overdue',  label: 'Überfällig',    hint: 'Mehr als 1 Tag nach Fälligkeit', tone: 'danger',  icon: AlertTriangle },
    { key: 'heute',    label: 'Heute',         hint: 'Fällig heute',                   tone: 'warn',    icon: Flame },
    { key: 'morgen',   label: 'Morgen',                                                tone: 'default', icon: ArrowRight },
    { key: 'thisWeek', label: 'Diese Woche',  hint: 'Bis Sonntag',                      tone: 'default', icon: CalendarDays },
    { key: 'nextWeek', label: 'Nächste Woche', hint: 'Kommende Kalenderwoche',           tone: 'default', icon: CalendarDays },
    { key: 'later',    label: 'Später',                                                tone: 'muted',   icon: Clock },
    { key: 'noDate',   label: 'Ohne Datum',                                            tone: 'muted',   icon: Inbox },
  ];
  return meta
    .map(m => ({ ...m, items: B[m.key] }))
    .filter(b => b.items.length);
}

// ════════════════════════════ INBOX ═════════════════════════════════════════

// Eingehende Hausaufgaben zu Gruppen bündeln: dieselbe Hausaufgabe von mehreren
// Mitschülern ist EIN Eintrag. Der ausführlichste Titel steht vorne (Repräsentant).
function clusterFriendTasks(list: FriendTask[]): FriendTask[][] {
  const clusters: FriendTask[][] = [];
  for (const ft of list) {
    const hit = clusters.find(c => sameHomework(c[0], ft));
    if (hit) hit.push(ft);
    else clusters.push([ft]);
  }
  for (const c of clusters) c.sort((a, b) => b.title.length - a.title.length || (a.dueDate ?? 0) - (b.dueDate ?? 0));
  return clusters.sort((a, b) => (a[0].dueDate ?? Infinity) - (b[0].dueDate ?? Infinity));
}

// Passt eine eingehende Hausaufgabe zu einer offenen eigenen Aufgabe?
function findOwnMatch(rep: FriendTask, ownTasks: AppTask[], subjById: SubjMap): AppTask | undefined {
  return ownTasks.find(t =>
    !t.done && sameHomework(rep, {
      title: t.title,
      subjectName: t.subjectId ? subjById[t.subjectId]?.name : undefined,
      dueDate: t.dueDate,
    }),
  );
}

function InboxPanel({ items, ownTasks, subjById, loading, onRefresh, onAccept, onReject }: {
  items: FriendTask[];
  ownTasks: AppTask[];
  subjById: SubjMap;
  loading: boolean;
  onRefresh: () => void;
  onAccept: (ft: FriendTask) => void;
  onReject: (id: string | string[]) => void;
}) {
  const clusters = useMemo(() => clusterFriendTasks(items), [items]);

  return (
    <div className="card !p-4">
      <div className="flex items-center gap-2 mb-3">
        <Inbox className="size-[18px] text-theme" strokeWidth={2.3} />
        <h3 className="font-display font-bold text-[17px] text-ink-900">Inbox</h3>
        {clusters.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-bold border bg-theme-soft/70 text-theme-deep border-theme/20">{clusters.length}</span>
        )}
        <button onClick={onRefresh} title="Aktualisieren"
          className="ml-auto size-8 grid place-items-center rounded-full hover:bg-white/80 text-ink-400 hover:text-theme-deep transition">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="grid place-items-center text-center py-8">
          <div className="size-11 rounded-2xl bg-white/70 border border-white/70 grid place-items-center shadow-soft mb-2"><Check className="size-5 text-ink-400" /></div>
          <div className="text-[13.5px] font-semibold text-ink-700">Alles erledigt</div>
          <p className="text-[12px] text-ink-400 mt-0.5 max-w-[200px]">Keine neuen Hausaufgaben von Mitschülern.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {clusters.map(cluster => (
            <InboxCard
              key={cluster[0].id} cluster={cluster}
              ownMatch={findOwnMatch(cluster[0], ownTasks, subjById)}
              onAccept={onAccept} onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InboxCard({ cluster, ownMatch, onAccept, onReject }: {
  cluster: FriendTask[];
  ownMatch?: AppTask;
  onAccept: (ft: FriendTask) => void;
  onReject: (id: string | string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rep = cluster[0];
  const names = [...new Set(cluster.map(c => c.ownerName))];
  const multi = cluster.length > 1;

  return (
    <div className="rounded-2xl border border-theme/25 bg-theme-soft/20 p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex -space-x-2 flex-shrink-0">
          {cluster.slice(0, 3).map(ft => <span key={ft.id} className="ring-2 ring-white rounded-full"><OwnerAvatar ft={ft} size={28} /></span>)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-ink-800 leading-snug" style={{ textWrap: 'pretty' } as React.CSSProperties}>{rep.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-ink-500 flex-wrap">
            {rep.subjectName && <span className="font-semibold text-theme-deep">{rep.subjectName}</span>}
            {rep.subjectName && rep.dueDate != null && <span className="text-ink-300">·</span>}
            {rep.dueDate != null && <span className="font-semibold" style={{ color: urgency(rep.dueDate).text }}>{relativeDate(rep.dueDate)}</span>}
          </div>
        </div>
      </div>

      {/* Wer hat geteilt */}
      <button onClick={() => multi && setOpen(v => !v)} className={`mt-2 flex items-center gap-1 text-[11.5px] text-ink-500 ${multi ? 'hover:text-theme-deep' : 'cursor-default'}`}>
        <span>von <span className="font-semibold text-ink-700">{multi ? `${names.length} Mitschülern` : names[0]}</span></span>
        {multi && <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && multi && (
        <div className="mt-1.5 flex flex-col gap-1">
          {cluster.map(ft => (
            <div key={ft.id} className="flex items-center gap-2 rounded-xl bg-white/55 px-2 py-1">
              <OwnerAvatar ft={ft} size={22} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-ink-700 truncate">{ft.ownerName}</div>
                <div className="text-[11px] text-ink-400 truncate">{ft.title}{ft.description ? ` · ${ft.description}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hinweis: passt zu einer bestehenden Aufgabe */}
      {ownMatch && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-white/55 px-2 py-1.5 text-[11px] text-ink-500">
          <Share2 className="size-3 mt-0.5 flex-shrink-0 text-theme-deep" strokeWidth={2.4} />
          <span>Passt zu deiner Aufgabe „<span className="font-semibold text-ink-700">{ownMatch.title}</span>" – wird dort als Credit ergänzt.</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={() => onAccept(rep)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold theme-gradient text-white shadow-glow transition active:scale-[.97]">
          <Check className="size-4" strokeWidth={2.6} />{ownMatch ? 'Hinzufügen' : 'Annehmen'}
        </button>
        <button onClick={() => onReject(cluster.map(ft => ft.id))} title="Ablehnen"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold bg-white/70 border border-white/70 text-ink-600 hover:bg-white transition active:scale-[.97]">
          <X className="size-4" />Ablehnen
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════ HEADER · TOGGLE · FILTER ══════════════════════

function ViewToggle({ layout, setLayout }: { layout: Layout; setLayout: (v: Layout) => void }) {
  const views: Array<{ id: Layout; label: string; icon: LucideIcon }> = [
    { id: 'liste', label: 'Liste', icon: List },
    { id: 'kacheln', label: 'Kacheln', icon: LayoutGrid },
  ];
  return (
    <div className="flex items-center gap-0.5 p-1 rounded-2xl bg-white/55 border border-white/60">
      {views.map(v => {
        const Ic = v.icon;
        return (
          <button key={v.id} onClick={() => setLayout(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold transition ${layout === v.id ? 'theme-gradient text-white shadow-glow' : 'text-ink-600 hover:bg-white/70'}`}>
            <Ic className="size-4" />{v.label}
          </button>
        );
      })}
    </div>
  );
}

function FChip({ active, color, onClick, icon: Ic, children, dark }: {
  active?: boolean; color?: string; onClick?: () => void; icon?: LucideIcon; children: React.ReactNode; dark?: boolean;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition select-none';
  const cls = active
    ? (color ? 'text-white border-transparent shadow-sm' : dark ? 'bg-ink-900 text-ink-50 border-ink-900' : 'theme-gradient text-white border-transparent shadow-glow')
    : 'bg-white/65 border-white/70 text-ink-600 hover:bg-white';
  return (
    <button onClick={onClick} className={`${base} ${cls}`} style={active && color ? { background: color } : undefined}>
      {Ic && <Ic className="size-3.5" strokeWidth={2.3} />}{children}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mr-0.5">{children}</span>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${checked ? 'theme-gradient' : 'bg-ink-200'}`}>
      <span className={`absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
    </button>
  );
}

function FilterBar({ allKinds, subjects, filterKind, setFilterKind, subjectSel, toggleSubject, showDone, setShowDone, activeFilters, resetFilter }: {
  allKinds: Array<{ id: TaskKind; label: string }>;
  subjects: Subject[];
  filterKind: TaskKind | null;
  setFilterKind: (k: TaskKind | null) => void;
  subjectSel: Set<string>;
  toggleSubject: (id: string) => void;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  activeFilters: number;
  resetFilter: () => void;
}) {
  return (
    <div className="card !p-2.5 mb-4">
      <div className="flex items-start gap-2 flex-col lg:flex-row">
        {/* ── Art (links) – darf auf 2 Zeilen umbrechen, damit die Fächer mehr Platz haben ── */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0 lg:max-w-[280px]">
          <div className="flex items-center gap-1.5 pl-1 pr-0.5"><Filter className="size-4 text-theme" /><GroupLabel>Art</GroupLabel></div>
          <FChip active={!filterKind} dark onClick={() => setFilterKind(null)} icon={SlidersHorizontal}>Alle</FChip>
          {allKinds.map(k => (
            <FChip key={k.id} active={filterKind === k.id} onClick={() => setFilterKind(filterKind === k.id ? null : k.id)}>
              <TaskKindIcon kind={k.id} className="size-3.5" />{k.label}
            </FChip>
          ))}
        </div>

        {/* Trennlinie zwischen Art und Fächer */}
        <div className="hidden lg:block w-px self-stretch bg-ink-200/70 mx-1 flex-shrink-0" />

        {/* ── Fächer (rechts) ── */}
        {subjects.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <GroupLabel>Fächer</GroupLabel>
            {subjects.map(s => (
              <FChip key={s.id} color={s.color} active={subjectSel.has(s.id)} onClick={() => toggleSubject(s.id)}>
                <span className="size-2 rounded-full" style={{ background: subjectSel.has(s.id) ? '#fff' : s.color }} />{s.name}
              </FChip>
            ))}
          </div>
        )}

        {/* ── Erledigte + Zurücksetzen (ganz rechts) ── */}
        <div className="flex items-center gap-3 flex-shrink-0 lg:pl-2 ml-auto lg:ml-0">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-600 select-none cursor-pointer">
            <span>Erledigte</span><Toggle checked={showDone} onChange={setShowDone} />
          </label>
          {activeFilters > 0 && (
            <button onClick={resetFilter} className="chip hover:bg-white text-ink-500"><X className="size-3" />Zurücksetzen</button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasTasks, onNew }: { hasTasks: boolean; onNew: () => void }) {
  return (
    <div className="card grid place-items-center text-center py-14">
      <div className="size-14 rounded-2xl bg-white/70 border border-white/70 grid place-items-center shadow-soft mb-3"><Inbox className="size-7 text-ink-400" /></div>
      <div className="font-display font-bold text-ink-800 text-lg">Keine Aufgaben</div>
      <p className="subtle mt-1 max-w-xs">{hasTasks ? 'Filter prüfen oder erledigte einblenden — sonst ist gerade nichts offen. 🎉' : 'Leg los — was steht als nächstes an?'}</p>
      {!hasTasks && <button onClick={onNew} className="btn-primary mt-4"><Plus className="size-4" />Neue Aufgabe</button>}
    </div>
  );
}

// ════════════════════════════ SHARED ROW PRIMITIVES ═════════════════════════

function CheckBtn({ done, onClick, size = 'md' }: { done: boolean; onClick: () => void; size?: 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'size-8' : 'size-7';
  const ic = size === 'lg' ? 'size-[22px]' : 'size-[19px]';
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`grid place-items-center ${sz} rounded-full transition flex-shrink-0 ${done ? 'text-emerald-500' : 'text-ink-300 hover:text-emerald-500 hover:bg-white/70'}`}>
      {done ? <CheckCircle2 className={ic} strokeWidth={2.2} /> : <Circle className={ic} strokeWidth={2} />}
    </button>
  );
}

function SubjectTile({ task, subjById, size = 'md' }: { task: AppTask; subjById: SubjMap; size?: 'md' | 'lg' }) {
  const s = task.subjectId ? subjById[task.subjectId] : null;
  const color = s ? s.color : '#64748b';
  const sz = size === 'lg' ? 'size-11 rounded-2xl' : 'size-9 rounded-xl';
  const ic = size === 'lg' ? 'size-[22px]' : 'size-[18px]';
  return (
    <span className={`${sz} grid place-items-center text-white flex-shrink-0 shadow-sm`} style={{ background: color }}>
      <TaskKindIcon kind={task.kind} className={ic} />
    </span>
  );
}

function CountdownPill({ ts, done, size = 'md' }: { ts: number | undefined; done?: boolean; size?: 'md' | 'sm' }) {
  const u = urgency(ts, done);
  const label = ts == null ? 'Ohne Datum' : (done ? 'Erledigt' : relativeDate(ts));
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';
  const showClock = u.key === 'overdue' || u.key === 'today';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap ${pad}`} style={{ background: u.bg, color: u.text }}>
      {showClock && <AlarmClock className="size-3" strokeWidth={2.5} />}{label}
    </span>
  );
}

function HeroDue({ ts, done, small }: { ts: number | undefined; done?: boolean; small?: boolean }) {
  const u = urgency(ts, done);
  const label = ts == null ? '—' : (done ? 'Erledigt' : relativeDate(ts));
  return (
    <div className="flex flex-col items-end flex-shrink-0" style={{ minWidth: small ? 70 : 86 }}>
      <span className={`${small ? 'text-[13px]' : 'text-[15px]'} font-extrabold font-display leading-none whitespace-nowrap`} style={{ color: u.text }}>{label}</span>
      {ts != null && <span className="text-[10.5px] text-ink-400 mt-0.5">{formatShortDate(ts)}</span>}
    </div>
  );
}

function SubjectTag({ task, subjById }: { task: AppTask; subjById: SubjMap }) {
  const s = task.subjectId ? subjById[task.subjectId] : null;
  if (!s) return <span className="inline-flex items-center gap-1 text-ink-400"><span className="size-2 rounded-full bg-ink-300" />Allgemein</span>;
  return <span className="inline-flex items-center gap-1.5" style={{ color: s.color }}><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>;
}

// Credit-Zeile: von welchen Mitschülern wurde diese Hausaufgabe übernommen.
// Bewusst so klein wie das Fach – nur als dezenter Hinweis.
function CreditTag({ names }: { names: string[] }) {
  if (!names.length) return null;
  const label = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  return (
    <span className="inline-flex items-center gap-1 text-theme-deep font-medium" title={`geteilt von ${names.join(', ')}`}>
      <Share2 className="size-3" strokeWidth={2.4} />von {label}
    </span>
  );
}

// Nur die wirklich dringende „Hoch"-Priorität wird angezeigt.
function PriorityChip({ p }: { p: 1 | 2 | 3 }) {
  if (p !== 3) return null;
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold border bg-rose-100 text-rose-600 border-rose-200"><Flag className="size-2.5" strokeWidth={2.6} />Hoch</span>;
}

function OwnerAvatar({ ft, size = 22 }: { ft: FriendTask; size?: number }) {
  const initials = ft.ownerName.split(' ').map(p => p[0]).join('').slice(0, 2);
  return (
    <span className="grid place-items-center rounded-full text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: ownerColor(ft.ownerName), fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
      {initials}
    </span>
  );
}

function SharedTag() {
  return <span className="inline-flex items-center gap-1 text-theme-deep font-semibold"><Share2 className="size-3" strokeWidth={2.4} />geteilt</span>;
}

function BucketHead({ bucket, count }: { bucket: Bucket; count: number }) {
  const tone = bucket.tone;
  const titleCls = tone === 'danger' ? 'text-rose-700' : tone === 'warn' ? 'text-orange-600' : tone === 'muted' ? 'text-ink-500' : 'text-ink-900';
  const iconCls = tone === 'danger' ? 'text-rose-500' : tone === 'warn' ? 'text-orange-500' : tone === 'muted' ? 'text-ink-400' : 'text-theme';
  const chipCls = tone === 'danger' ? 'bg-rose-100 text-rose-700 border-rose-200' : tone === 'warn' ? 'bg-orange-100 text-orange-700 border-orange-200' : tone === 'muted' ? 'bg-ink-100 text-ink-600 border-ink-200' : 'bg-theme-soft/70 text-theme-deep border-theme/20';
  const Ic = bucket.icon;
  return (
    <div className="flex items-center gap-2 mb-3">
      <Ic className={`size-[18px] ${iconCls}`} strokeWidth={2.3} />
      <h3 className={`font-display font-bold text-[17px] ${titleCls}`}>{bucket.label}</h3>
      <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-bold border ${chipCls}`}>{count}</span>
      {bucket.hint && <span className="text-[11px] text-ink-400 ml-1 hidden md:inline">{bucket.hint}</span>}
    </div>
  );
}

// Kurze Inline-Löschbestätigung (verhindert versehentliches Löschen).
function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-[13px] text-rose-600 font-medium flex-1">Aufgabe wirklich löschen?</span>
      <button onClick={onConfirm} className="btn-soft !bg-rose-50 !text-rose-600 hover:!bg-rose-100 !py-1 !px-3 text-xs">Löschen</button>
      <button onClick={onCancel} className="btn-soft !py-1 !px-3 text-xs">Abbrechen</button>
    </div>
  );
}

interface BucketProps {
  bucket: Bucket;
  subjById: SubjMap;
  config?: GradingSystemConfig;
  onSelect: (t: AppTask) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

// ════════════════════════════ A · LISTE ═════════════════════════════════════

function ListBucket({ bucket, subjById, config, onSelect, onToggle, onDelete }: BucketProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const cardCls = bucket.tone === 'danger' ? '!border-rose-200/70 !bg-rose-50/40' : '';

  return (
    <div className={`card !p-4 ${cardCls}`}>
      <BucketHead bucket={bucket} count={bucket.items.length} />
      <div className="flex flex-col divide-y divide-white/55">
        {bucket.items.map(task => {
          if (confirmDelete === task.id) {
            return <div key={task.id}><DeleteConfirm onConfirm={() => { onDelete(task.id); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} /></div>;
          }
          return (
            <div key={task.id}>
              <div className="group flex items-center gap-3 py-2.5">
                <CheckBtn done={task.done} onClick={() => onToggle(task.id)} />
                <SubjectTile task={task} subjById={subjById} />
                <button onClick={() => onSelect(task)} className="flex-1 min-w-0 text-left">
                  <div className={`text-[14.5px] font-semibold text-ink-800 truncate ${task.done ? 'line-through text-ink-400' : ''}`}>{task.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[12px] text-ink-500 flex-wrap">
                    <span className="inline-flex items-center gap-1"><TaskKindIcon kind={task.kind} className="size-3" />{getTaskKindLabel(task.kind, config)}</span>
                    <span className="text-ink-300">·</span><SubjectTag task={task} subjById={subjById} />
                    {task.sharedFrom?.length ? <><span className="text-ink-300">·</span><CreditTag names={task.sharedFrom} /></> : null}
                    {task.shared && <><span className="text-ink-300">·</span><SharedTag /></>}
                  </div>
                </button>
                <PriorityChip p={task.priority} />
                <HeroDue ts={task.dueDate} done={task.done} />
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                  <button onClick={() => onSelect(task)} className="size-8 grid place-items-center rounded-full hover:bg-white/80 text-ink-400 hover:text-theme-deep"><Pencil className="size-4" /></button>
                  <button onClick={() => setConfirmDelete(task.id)} className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-ink-400 hover:text-rose-500"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════ B · KACHELN ═══════════════════════════════════

function TileBucket({ bucket, subjById, config, onSelect, onToggle, onDelete }: BucketProps) {
  return (
    <div>
      <BucketHead bucket={bucket} count={bucket.items.length} />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(282px, 1fr))' }}>
        {bucket.items.map(task => <TaskTile key={task.id} task={task} subjById={subjById} config={config} onSelect={onSelect} onToggle={onToggle} onDelete={onDelete} />)}
      </div>
    </div>
  );
}

function TaskTile({ task, subjById, config, onSelect, onToggle, onDelete }: {
  task: AppTask; subjById: SubjMap; config?: GradingSystemConfig;
  onSelect: (t: AppTask) => void; onToggle: (id: string) => void; onDelete: (id: string) => void;
}) {
  const s = task.subjectId ? subjById[task.subjectId] : null;
  const color = s ? s.color : '#64748b';
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="group relative card !p-0 overflow-hidden hover:shadow-glow transition cursor-pointer" onClick={() => onSelect(task)}>
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="p-3.5 pl-5">
        <div className="flex items-start gap-2.5">
          <SubjectTile task={task} subjById={subjById} size="lg" />
          <div className="flex-1 min-w-0 pt-0.5">
            <div className={`text-[14.5px] font-bold text-ink-900 leading-snug ${task.done ? 'line-through text-ink-400' : ''}`} style={{ textWrap: 'pretty' } as React.CSSProperties}>{task.title}</div>
            <div className="text-[12px] mt-1"><SubjectTag task={task} subjById={subjById} /></div>
          </div>
          <CheckBtn done={task.done} onClick={() => onToggle(task.id)} />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <CountdownPill ts={task.dueDate} done={task.done} />
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-500"><TaskKindIcon kind={task.kind} className="size-3.5" />{getTaskKindLabel(task.kind, config)}</span>
          <PriorityChip p={task.priority} />
        </div>
        {(task.sharedFrom?.length || task.shared) && (
          <div className="mt-3 pt-3 border-t border-white/55 text-[11.5px]">
            {task.sharedFrom?.length
              ? <CreditTag names={task.sharedFrom} />
              : <span className="font-semibold text-theme-deep inline-flex items-center gap-1"><Share2 className="size-3.5" />Von dir geteilt</span>}
          </div>
        )}
      </div>
      <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setConfirm(true)} className="size-7 grid place-items-center rounded-full bg-white/80 text-ink-400 hover:text-rose-500 shadow-sm"><Trash2 className="size-3.5" /></button>
      </div>
      {confirm && (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 rounded-3xl" style={{ background: 'rgba(255,255,255,.82)' }} onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-[13px] font-semibold text-ink-700 mb-2.5">Aufgabe wirklich löschen?</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => { onDelete(task.id); setConfirm(false); }} className="btn-soft !bg-rose-50 !text-rose-600 hover:!bg-rose-100 !py-1.5 !px-3 text-xs">Löschen</button>
              <button onClick={() => setConfirm(false)} className="btn-soft !py-1.5 !px-3 text-xs">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
