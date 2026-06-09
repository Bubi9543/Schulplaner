import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Filter, SlidersHorizontal, CheckCircle2, Circle, AlertTriangle, Inbox,
  RefreshCw, Users, Trash2, Pencil, Share2, Flame, ArrowRight, CalendarDays, Clock,
  Flag, AlarmClock, List, LayoutGrid, X, Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { relativeDate, formatShortDate, daysUntil } from '@/lib/utils';
import { getTaskKindLabel } from '@/lib/grading';
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
  friendItems: FriendTask[];
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

  // Freundes-Hausaufgaben sind im Store bereits vorgefiltert – hier nur UI-Filter.
  const filteredFriendTasks = useMemo(() => {
    const selNames = [...subjectSel].map(id => subjById[id]?.name.toLowerCase()).filter(Boolean) as string[];
    return friendTasks.filter(ft => {
      if (dismissedFriendTaskIds.has(ft.id)) return false;
      if (filterKind && ft.kind !== filterKind) return false;
      if (selNames.length && (!ft.subjectName || !selNames.includes(ft.subjectName.toLowerCase()))) return false;
      return true;
    });
  }, [friendTasks, filterKind, subjectSel, subjById, dismissedFriendTaskIds]);

  const buckets = useMemo<Bucket[]>(() => computeBuckets(filtered, filteredFriendTasks), [filtered, filteredFriendTasks]);

  const openCount = tasks.filter(t => !t.done).length;
  const doneCount = tasks.filter(t => t.done).length;
  const friendCount = filteredFriendTasks.length;

  const onSelect = (t: AppTask) => setDetail({ open: true, task: t });

  return (
    <PageShell
      title="Aufgaben"
      subtitle={`${openCount} offen · ${doneCount} erledigt`}
      actions={
        <div className="flex items-center gap-2">
          <ViewToggle layout={layout} setLayout={chooseLayout} />
          {friends.length > 0 && (
            <button onClick={() => refreshFriendTasks()} title="Hausaufgaben von Mitschülern aktualisieren"
              className="relative size-10 grid place-items-center rounded-2xl glass text-ink-600 hover:bg-white transition">
              <RefreshCw className={`size-[18px] ${friendTasksLoading ? 'animate-spin' : ''}`} />
              {friendCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full theme-gradient text-white text-[10px] font-bold shadow">
                  {friendCount > 9 ? '9+' : friendCount}
                </span>
              )}
            </button>
          )}
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

      {buckets.length === 0 ? (
        <EmptyState hasTasks={tasks.length > 0} onNew={() => setEditor({ open: true })} />
      ) : layout === 'liste' ? (
        <div className="flex flex-col gap-4">
          {buckets.map((b, idx) => (
            <motion.div key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <ListBucket bucket={b} subjById={subjById} config={config} onSelect={onSelect} onToggle={toggleTask} onDelete={deleteTask} onDismiss={dismissFriendTask} onAccept={acceptFriendTask} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {buckets.map((b, idx) => (
            <motion.div key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <TileBucket bucket={b} subjById={subjById} config={config} onSelect={onSelect} onToggle={toggleTask} onDelete={deleteTask} onDismiss={dismissFriendTask} onAccept={acceptFriendTask} />
            </motion.div>
          ))}
        </div>
      )}

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

// ── Bucket-Berechnung (spiegelt die alte Logik, ergänzt Meta + Reihenfolge). ──
function computeBuckets(own: AppTask[], friend: FriendTask[]): Bucket[] {
  const today = startOfDay(Date.now());
  const tomorrow = today + 86400000, dayAfter = today + 2 * 86400000;
  const inAWeek = today + 7 * 86400000, inTwoWeeks = today + 14 * 86400000;
  const mk = () => ({ items: [] as AppTask[], friendItems: [] as FriendTask[] });
  const B: Record<BucketKey, { items: AppTask[]; friendItems: FriendTask[] }> = {
    overdue: mk(), heute: mk(), morgen: mk(), thisWeek: mk(), nextWeek: mk(), later: mk(), noDate: mk(),
  };

  for (const t of own) {
    if (t.dueDate == null) { B.noDate.items.push(t); continue; }
    const due = startOfDay(t.dueDate);
    if (!t.done && due < today - 86400000) { B.overdue.items.push(t); continue; }
    if (due === today) B.heute.items.push(t);
    else if (due === tomorrow) B.morgen.items.push(t);
    else if (due >= dayAfter && due < inAWeek) B.thisWeek.items.push(t);
    else if (due >= inAWeek && due < inTwoWeeks) B.nextWeek.items.push(t);
    else if (due >= inTwoWeeks) B.later.items.push(t);
    else B.heute.items.push(t);
  }
  for (const ft of friend) {
    if (ft.dueDate == null) { B.noDate.friendItems.push(ft); continue; }
    const due = startOfDay(ft.dueDate);
    if (due < today - 86400000) { B.overdue.friendItems.push(ft); continue; }
    if (due === today) B.heute.friendItems.push(ft);
    else if (due === tomorrow) B.morgen.friendItems.push(ft);
    else if (due >= dayAfter && due < inAWeek) B.thisWeek.friendItems.push(ft);
    else if (due >= inAWeek && due < inTwoWeeks) B.nextWeek.friendItems.push(ft);
    else if (due >= inTwoWeeks) B.later.friendItems.push(ft);
    else B.heute.friendItems.push(ft);
  }
  const sortOwn = (a: AppTask, b: AppTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || b.priority - a.priority;
  const sortFriend = (a: FriendTask, b: FriendTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
  Object.values(B).forEach(b => { b.items.sort(sortOwn); b.friendItems.sort(sortFriend); });

  const meta: Array<Omit<Bucket, 'items' | 'friendItems'>> = [
    { key: 'overdue',  label: 'Überfällig',    hint: 'Mehr als 1 Tag nach Fälligkeit', tone: 'danger',  icon: AlertTriangle },
    { key: 'heute',    label: 'Heute',         hint: 'Fällig heute',                   tone: 'warn',    icon: Flame },
    { key: 'morgen',   label: 'Morgen',                                                tone: 'default', icon: ArrowRight },
    { key: 'thisWeek', label: 'Diese Woche',                                           tone: 'default', icon: CalendarDays },
    { key: 'nextWeek', label: 'Nächste Woche',                                         tone: 'default', icon: CalendarDays },
    { key: 'later',    label: 'Später',                                                tone: 'muted',   icon: Clock },
    { key: 'noDate',   label: 'Ohne Datum',                                            tone: 'muted',   icon: Inbox },
  ];
  return meta
    .map(m => ({ ...m, ...B[m.key] }))
    .filter(b => b.items.length || b.friendItems.length);
}

// ── Inhaltlicher Abgleich zweier Aufgaben-Titel ─────────────────────────────
// Zieht Zahlen-Tokens (mit optionalem Buchstaben-Suffix) aus einem Titel.
//   "165/5,7a"                 → ["165","5","7a"]
//   "Seite 165 Aufgabe 5 und 7a" → ["165","5","7a"]
function numberTokens(s: string): string[] {
  return s.toLowerCase().match(/\d+[a-z]?/g) ?? [];
}
const tokenBase = (tok: string) => parseInt(tok, 10);

// Wörter (länger als 2 Zeichen, ohne Satzzeichen) – Fallback wenn keine Zahlen.
function titleWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2),
  );
}

// Beschreiben zwei Titel wahrscheinlich dieselbe Aufgabe?
// Mit Seiten-/Aufgabennummern wird tolerant über die Zahlen verglichen:
// gleiche (größte) Seitenzahl + Überschneidung bei den Aufgabennummern.
// Dadurch passen "165/5,7a" ↔ "Seite 165 Aufgabe 5 und 7b" zusammen, aber
// zwei verschiedene Aufgaben am selben Tag/Fach werden NICHT mehr gruppiert.
function tasksLikelySame(a: string, b: string): boolean {
  const ta = numberTokens(a), tb = numberTokens(b);
  if (ta.length && tb.length) {
    const basesA = ta.map(tokenBase), basesB = tb.map(tokenBase);
    const pageA = Math.max(...basesA), pageB = Math.max(...basesB);
    if (pageA !== pageB) return false;                       // andere Seite → andere Aufgabe
    const restA = new Set(basesA.filter(n => n !== pageA));
    const restB = new Set(basesB.filter(n => n !== pageB));
    if (restA.size === 0 && restB.size === 0) return true;    // nur eine Seitenangabe, gleich
    for (const n of restA) if (restB.has(n)) return true;     // mind. eine gemeinsame Aufgabe
    return false;
  }
  // Kein Zahlenbezug → über Wort-Überschneidung (Jaccard ≥ 0,5).
  const wa = titleWords(a), wb = titleWords(b);
  if (!wa.size || !wb.size) return false;
  let inter = 0; for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return inter / union >= 0.5;
}

// Pro Bucket: Map<eigeneTaskId → FriendTask[]> (gleiches Fach + gleicher Tag
// + inhaltlich passend) + eigenständige Fremdaufgaben (kein eigenes Pendant).
function bucketFriendGroups(bucket: Bucket, subjById: SubjMap) {
  const byOwn = new Map<string, FriendTask[]>();
  for (const ft of bucket.friendItems) {
    if (!ft.subjectName || !ft.dueDate) continue;
    for (const t of bucket.items) {
      const subj = t.subjectId ? subjById[t.subjectId] : null;
      if (!subj || !t.dueDate) continue;
      if (
        subj.name.toLowerCase() === ft.subjectName.toLowerCase() &&
        startOfDay(t.dueDate) === startOfDay(ft.dueDate) &&
        tasksLikelySame(t.title, ft.title)
      ) {
        const arr = byOwn.get(t.id) ?? []; arr.push(ft); byOwn.set(t.id, arr);
      }
    }
  }
  const dupIds = new Set<string>();
  for (const arr of byOwn.values()) arr.forEach(ft => dupIds.add(ft.id));
  const standalone = bucket.friendItems.filter(ft => !dupIds.has(ft.id));
  return { byOwn, standalone };
}

function bucketTotal(bucket: Bucket, byOwn: Map<string, FriendTask[]>, standalone: FriendTask[]) {
  return bucket.items.length + standalone.length + [...byOwn.values()].reduce((s, a) => s + a.length, 0);
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
function VDiv() { return <div className="w-px self-stretch bg-ink-200/70 mx-1" />; }

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
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 pl-1 pr-0.5"><Filter className="size-4 text-theme" /><GroupLabel>Art</GroupLabel></div>
        <FChip active={!filterKind} dark onClick={() => setFilterKind(null)} icon={SlidersHorizontal}>Alle</FChip>
        {allKinds.map(k => (
          <FChip key={k.id} active={filterKind === k.id} onClick={() => setFilterKind(filterKind === k.id ? null : k.id)}>
            <TaskKindIcon kind={k.id} className="size-3.5" />{k.label}
          </FChip>
        ))}
        {subjects.length > 0 && <><VDiv /><GroupLabel>Fächer</GroupLabel></>}
        {subjects.map(s => (
          <FChip key={s.id} color={s.color} active={subjectSel.has(s.id)} onClick={() => toggleSubject(s.id)}>
            <span className="size-2 rounded-full" style={{ background: subjectSel.has(s.id) ? '#fff' : s.color }} />{s.name}
          </FChip>
        ))}
        <div className="flex items-center gap-3 ml-auto pl-2">
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

// Nur die wirklich dringende „Hoch"-Priorität wird angezeigt.
function PriorityChip({ p }: { p: 1 | 2 | 3 }) {
  if (p !== 3) return null;
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold border bg-rose-100 text-rose-600 border-rose-200"><Flag className="size-2.5" strokeWidth={2.6} />Hoch</span>;
}

function FriendBadge({ count, active, onClick }: { count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold border transition flex-shrink-0 ${active ? 'theme-gradient text-white border-transparent shadow-glow' : 'bg-theme-soft/70 text-theme-deep border-theme/25 hover:bg-theme-soft'}`}>
      <Users className="size-3" strokeWidth={2.4} />{count} {count === 1 ? 'Freund' : 'Freunde'}
    </button>
  );
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
  onDismiss: (id: string) => void;
  onAccept: (ft: FriendTask) => void;
}

// ════════════════════════════ A · LISTE ═════════════════════════════════════

function ListBucket({ bucket, subjById, config, onSelect, onToggle, onDelete, onDismiss, onAccept }: BucketProps) {
  const { byOwn, standalone } = useMemo(() => bucketFriendGroups(bucket, subjById), [bucket, subjById]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const total = bucketTotal(bucket, byOwn, standalone);
  const cardCls = bucket.tone === 'danger' ? '!border-rose-200/70 !bg-rose-50/40' : '';

  return (
    <div className={`card !p-4 ${cardCls}`}>
      <BucketHead bucket={bucket} count={total} />
      <div className="flex flex-col divide-y divide-white/55">
        {bucket.items.map(task => {
          const friends = byOwn.get(task.id) ?? [];
          const open = expanded === task.id;
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
                    {task.shared && <><span className="text-ink-300">·</span><SharedTag /></>}
                  </div>
                </button>
                {friends.length > 0 && <FriendBadge count={friends.length} active={open} onClick={() => setExpanded(open ? null : task.id)} />}
                <PriorityChip p={task.priority} />
                <HeroDue ts={task.dueDate} done={task.done} />
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                  <button onClick={() => onSelect(task)} className="size-8 grid place-items-center rounded-full hover:bg-white/80 text-ink-400 hover:text-theme-deep"><Pencil className="size-4" /></button>
                  <button onClick={() => setConfirmDelete(task.id)} className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-ink-400 hover:text-rose-500"><Trash2 className="size-4" /></button>
                </div>
              </div>
              {open && friends.map(ft => <FriendRowInline key={ft.id} ft={ft} onDismiss={onDismiss} indent />)}
            </div>
          );
        })}
        {standalone.map(ft => <FriendRowInline key={ft.id} ft={ft} onDismiss={onDismiss} onAccept={onAccept} />)}
      </div>
    </div>
  );
}

function FriendRowInline({ ft, onDismiss, onAccept, indent }: { ft: FriendTask; onDismiss: (id: string) => void; onAccept?: (ft: FriendTask) => void; indent?: boolean }) {
  return (
    <div className={`group flex items-center gap-3 py-2.5 ${indent ? 'pl-10 bg-theme-soft/20 -mx-1 px-3 rounded-xl' : ''}`}>
      <OwnerAvatar ft={ft} size={28} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-ink-700 truncate">{ft.title}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-ink-400 flex-wrap">
          <span className="text-theme-deep font-semibold">{ft.ownerName}</span>
          {ft.subjectName && <><span className="text-ink-300">·</span><span>{ft.subjectName}</span></>}
          {ft.description && <><span className="text-ink-300">·</span><span className="truncate">{ft.description}</span></>}
        </div>
      </div>
      <HeroDue ts={ft.dueDate} small />
      {onAccept ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onAccept(ft)} title="Als eigene Aufgabe übernehmen"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold bg-theme-soft/70 text-theme-deep border border-theme/25 hover:bg-theme-soft transition">
            <Check className="size-3.5" strokeWidth={2.6} />Annehmen
          </button>
          <button onClick={() => onDismiss(ft.id)} title="Ablehnen"
            className="size-8 grid place-items-center rounded-full hover:bg-ink-100 text-ink-300 hover:text-ink-600 transition"><X className="size-4" /></button>
        </div>
      ) : (
        <button onClick={() => onDismiss(ft.id)} className="size-8 grid place-items-center rounded-full hover:bg-ink-100 text-ink-300 hover:text-ink-600 opacity-0 group-hover:opacity-100 transition flex-shrink-0"><X className="size-4" /></button>
      )}
    </div>
  );
}

// ════════════════════════════ B · KACHELN ═══════════════════════════════════

function TileBucket({ bucket, subjById, config, onSelect, onToggle, onDelete, onDismiss, onAccept }: BucketProps) {
  const { byOwn, standalone } = useMemo(() => bucketFriendGroups(bucket, subjById), [bucket, subjById]);
  const total = bucketTotal(bucket, byOwn, standalone);
  return (
    <div>
      <BucketHead bucket={bucket} count={total} />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(282px, 1fr))' }}>
        {bucket.items.map(task => <TaskTile key={task.id} task={task} friends={byOwn.get(task.id) ?? []} subjById={subjById} config={config} onSelect={onSelect} onToggle={onToggle} onDelete={onDelete} />)}
        {standalone.map(ft => <FriendTile key={ft.id} ft={ft} onDismiss={onDismiss} onAccept={onAccept} />)}
      </div>
    </div>
  );
}

function TaskTile({ task, friends, subjById, config, onSelect, onToggle, onDelete }: {
  task: AppTask; friends: FriendTask[]; subjById: SubjMap; config?: GradingSystemConfig;
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
        {(friends.length > 0 || task.shared) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/55">
            {friends.length > 0 ? (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">{friends.slice(0, 4).map(ft => <span key={ft.id} className="ring-2 ring-white rounded-full"><OwnerAvatar ft={ft} size={24} /></span>)}</div>
                <span className="text-[11.5px] font-semibold text-theme-deep">{friends.length} {friends.length === 1 ? 'Freund hat das auch' : 'Freunde haben das auch'}</span>
              </div>
            ) : <span className="text-[11.5px] font-semibold text-theme-deep inline-flex items-center gap-1"><Share2 className="size-3.5" />Von dir geteilt</span>}
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

function FriendTile({ ft, onDismiss, onAccept }: { ft: FriendTask; onDismiss: (id: string) => void; onAccept: (ft: FriendTask) => void }) {
  return (
    <div className="group relative rounded-3xl border border-dashed border-theme/30 bg-theme-soft/25 p-3.5 hover:bg-theme-soft/40 transition">
      <div className="flex items-start gap-2.5">
        <OwnerAvatar ft={ft} size={40} />
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-[14px] font-bold text-ink-800 leading-snug" style={{ textWrap: 'pretty' } as React.CSSProperties}>{ft.title}</div>
          <div className="text-[12px] text-theme-deep font-semibold mt-0.5">{ft.ownerName}{ft.subjectName ? ` · ${ft.subjectName}` : ''}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <CountdownPill ts={ft.dueDate} size="sm" />
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400"><Users className="size-3" />Von Mitschüler geteilt</span>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-theme/15">
        <button onClick={() => onAccept(ft)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold theme-gradient text-white shadow-glow transition active:scale-[.97]">
          <Check className="size-4" strokeWidth={2.6} />Annehmen
        </button>
        <button onClick={() => onDismiss(ft.id)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold bg-white/70 border border-white/70 text-ink-600 hover:bg-white transition active:scale-[.97]">
          <X className="size-4" />Ablehnen
        </button>
      </div>
    </div>
  );
}
