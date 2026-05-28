import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ListTodo, Filter, CheckCircle2, Circle, AlertTriangle, Inbox, RefreshCw, Users, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { TaskDialog } from '@/components/dialogs/TaskDialog';
import { TaskDetailDialog } from '@/components/dialogs/TaskDetailDialog';
import { useStore } from '@/store/useStore';
import { relativeDate } from '@/lib/utils';
import { getTaskKindLabel, getTaskKindIcon } from '@/lib/grading';
import type { AppTask, FriendTask, TaskKind } from '@/types';
import { BUILTIN_TASK_KINDS } from '@/types';

type BucketKey = 'heute' | 'morgen' | 'thisWeek' | 'nextWeek' | 'later' | 'noDate' | 'overdue';

interface Bucket {
  key: BucketKey;
  label: string;
  hint?: string;
  tone: 'danger' | 'warn' | 'default' | 'muted';
  items: AppTask[];
  friendItems: FriendTask[];
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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

  const subs = settings?.homeworkSubscriptions ?? [];
  const customKinds = settings?.gradingConfig.customKinds ?? [];

  const allKinds = useMemo<Array<{ id: TaskKind; label: string; icon: string }>>(() => [
    ...BUILTIN_TASK_KINDS.map(id => ({ id, label: getTaskKindLabel(id), icon: getTaskKindIcon(id) })),
    ...customKinds.map(c => ({ id: c.id, label: c.label, icon: getTaskKindIcon(c.id) })),
  ], [customKinds]);

  const [filterKind, setFilterKind] = useState<TaskKind | null>(null);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [detail, setDetail] = useState<{ open: boolean; task?: AppTask }>({ open: false });
  const [editor, setEditor] = useState<{ open: boolean; task?: Partial<AppTask>; defaultKind?: TaskKind }>({ open: false });

  const filtered = useMemo(() => tasks.filter(t => {
    if (!showDone && t.done) return false;
    if (filterKind && t.kind !== filterKind) return false;
    if (filterSubject && t.subjectId !== filterSubject) return false;
    return true;
  }), [tasks, filterKind, filterSubject, showDone]);

  const filteredFriendTasks = useMemo(() => friendTasks.filter(ft => {
    if (dismissedFriendTaskIds.has(ft.id)) return false;
    const sub = subs.find(s => s.userId === ft.ownerUserId);
    if (!sub) return false;
    if (sub.subjectFilter !== null && sub.subjectFilter.length === 0) return false;
    if (sub.subjectFilter !== null && ft.subjectName) {
      const norm = sub.subjectFilter.map(n => n.toLowerCase());
      if (!norm.includes(ft.subjectName.toLowerCase())) return false;
    }
    if (filterKind && ft.kind !== filterKind) return false;
    if (filterSubject) {
      const subj = subjects.find(s => s.id === filterSubject);
      if (subj && ft.subjectName?.toLowerCase() !== subj.name.toLowerCase()) return false;
    }
    return true;
  }), [friendTasks, subs, filterKind, filterSubject, subjects, dismissedFriendTaskIds]);

  const buckets = useMemo<Bucket[]>(() => {
    const today = startOfDay(Date.now());
    const tomorrow = today + 86400000;
    const dayAfterTomorrow = today + 2 * 86400000;
    const inAWeek = today + 7 * 86400000;
    const inTwoWeeks = today + 14 * 86400000;

    const overdue: AppTask[] = [], heute: AppTask[] = [], morgen: AppTask[] = [];
    const thisWeek: AppTask[] = [], nextWeek: AppTask[] = [], later: AppTask[] = [], noDate: AppTask[] = [];
    const fOverdue: FriendTask[] = [], fHeute: FriendTask[] = [], fMorgen: FriendTask[] = [];
    const fThisWeek: FriendTask[] = [], fNextWeek: FriendTask[] = [], fLater: FriendTask[] = [], fNoDate: FriendTask[] = [];

    for (const t of filtered) {
      if (!t.dueDate) { noDate.push(t); continue; }
      const due = startOfDay(t.dueDate);
      if (!t.done && due < today - 86400000) { overdue.push(t); continue; }
      if (due === today) heute.push(t);
      else if (due === tomorrow) morgen.push(t);
      else if (due >= dayAfterTomorrow && due < inAWeek) thisWeek.push(t);
      else if (due >= inAWeek && due < inTwoWeeks) nextWeek.push(t);
      else if (due >= inTwoWeeks) later.push(t);
      else heute.push(t);
    }
    for (const ft of filteredFriendTasks) {
      if (!ft.dueDate) { fNoDate.push(ft); continue; }
      const due = startOfDay(ft.dueDate);
      if (due < today - 86400000) { fOverdue.push(ft); continue; }
      if (due === today) fHeute.push(ft);
      else if (due === tomorrow) fMorgen.push(ft);
      else if (due >= dayAfterTomorrow && due < inAWeek) fThisWeek.push(ft);
      else if (due >= inAWeek && due < inTwoWeeks) fNextWeek.push(ft);
      else if (due >= inTwoWeeks) fLater.push(ft);
      else fHeute.push(ft);
    }

    const sortOwn = (a: AppTask, b: AppTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || a.priority - b.priority;
    const sortFriend = (a: FriendTask, b: FriendTask) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity);
    [overdue, heute, morgen, thisWeek, nextWeek, later].forEach(arr => arr.sort(sortOwn));
    noDate.sort((a, b) => b.createdAt - a.createdAt);
    [fOverdue, fHeute, fMorgen, fThisWeek, fNextWeek, fLater, fNoDate].forEach(arr => arr.sort(sortFriend));

    return [
      { key: 'heute',    label: 'Heute',         hint: 'Fällig heute',  tone: 'warn',    items: heute,    friendItems: fHeute },
      { key: 'morgen',   label: 'Morgen',                               tone: 'default', items: morgen,   friendItems: fMorgen },
      { key: 'thisWeek', label: 'Diese Woche',                          tone: 'default', items: thisWeek, friendItems: fThisWeek },
      { key: 'nextWeek', label: 'Nächste Woche',                        tone: 'default', items: nextWeek, friendItems: fNextWeek },
      { key: 'later',    label: 'Später',                               tone: 'muted',   items: later,    friendItems: fLater },
      { key: 'noDate',   label: 'Ohne Datum',                           tone: 'muted',   items: noDate,   friendItems: fNoDate },
      { key: 'overdue',  label: 'Überfällig', hint: 'Mehr als 1 Tag nach Fälligkeit', tone: 'danger', items: overdue, friendItems: fOverdue },
    ];
  }, [filtered, filteredFriendTasks]);

  const openCount = tasks.filter(t => !t.done).length;
  const doneCount = tasks.filter(t => t.done).length;
  const totalShown = buckets.reduce((acc, b) => acc + b.items.length + b.friendItems.length, 0);

  return (
    <PageShell
      title="Aufgaben"
      subtitle={`${openCount} offen · ${doneCount} erledigt`}
      actions={
        <div className="flex items-center gap-2">
          {subs.length > 0 && (
            <button className="btn-ghost relative" onClick={() => refreshFriendTasks()}
              title="Hausaufgaben von Mitschülern aktualisieren">
              <RefreshCw className={`size-4 ${friendTasksLoading ? 'animate-spin' : ''}`} />
              {filteredFriendTasks.length > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-theme text-white text-[9px] grid place-items-center">
                  {filteredFriendTasks.length > 9 ? '9+' : filteredFriendTasks.length}
                </span>
              )}
            </button>
          )}
          <button className="btn-primary" onClick={() => setEditor({ open: true })}>
            <Plus className="size-4" />Neu
          </button>
        </div>
      }
    >
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="size-4 text-ink-400" />
          <button onClick={() => setFilterKind(null)} className={`chip ${!filterKind ? 'bg-ink-900 text-ink-50 border-ink-900' : ''}`}>Alle</button>
          {allKinds.map(k => (
            <button key={k.id} onClick={() => setFilterKind(filterKind === k.id ? null : k.id)}
              className={`chip ${filterKind === k.id ? 'bg-orange-500 text-white border-orange-500' : ''}`}>
              <span>{k.icon}</span>{k.label}
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

      {totalShown === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-10">
            <div className="size-14 rounded-2xl bg-white/70 grid place-items-center shadow-soft mb-4">
              <Inbox className="size-7 text-ink-500" />
            </div>
            <h3 className="font-display font-bold text-ink-800 text-lg">Keine Aufgaben</h3>
            <p className="subtle mt-1 max-w-sm">{tasks.length ? 'Filter prüfen oder erledigte einblenden.' : 'Leg los — was steht als nächstes an?'}</p>
            <button onClick={() => setEditor({ open: true })} className="btn-primary mt-4"><Plus className="size-4" />Neue Aufgabe</button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {buckets.map((b, idx) => (b.items.length === 0 && b.friendItems.length === 0) ? null : (
            <motion.div key={b.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <BucketCard
                bucket={b}
                onSelect={t => setDetail({ open: true, task: t })}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onDismiss={dismissFriendTask}
              />
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

// ─── BucketCard ──────────────────────────────────────────────────────────────

function BucketCard({ bucket, onSelect, onToggle, onDelete, onDismiss }: {
  bucket: Bucket;
  onSelect: (t: AppTask) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const subjects = useStore(s => s.subjects);
  const config = useStore(s => s.settings?.gradingConfig);

  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);

  const toneClass = (() => {
    switch (bucket.tone) {
      case 'danger': return 'text-rose-700';
      case 'warn':   return 'text-orange-600';
      case 'muted':  return 'text-ink-500';
      default:       return 'text-ink-800';
    }
  })();
  const chipClass = (() => {
    switch (bucket.tone) {
      case 'danger': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'warn':   return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'muted':  return 'bg-ink-100 text-ink-600 border-ink-200';
      default:       return '';
    }
  })();
  const cardClass = bucket.tone === 'danger' ? 'border-rose-200/80 bg-rose-50/40' : '';

  // Duplikate: Map<ownTaskId → FriendTask[]> für "gleicher Tag + gleiches Fach"
  const friendsByOwnTask = useMemo(() => {
    const map = new Map<string, FriendTask[]>();
    for (const ft of bucket.friendItems) {
      if (!ft.subjectName || !ft.dueDate) continue;
      for (const t of bucket.items) {
        const subj = subjects.find(s => s.id === t.subjectId);
        if (!subj || !t.dueDate) continue;
        if (
          subj.name.toLowerCase() === ft.subjectName.toLowerCase() &&
          startOfDay(t.dueDate) === startOfDay(ft.dueDate)
        ) {
          const arr = map.get(t.id) ?? [];
          map.set(t.id, [...arr, ft]);
        }
      }
    }
    return map;
  }, [bucket.items, bucket.friendItems, subjects]);

  // Fremd-Tasks die KEIN Duplikat sind (eigenständige Zeilen)
  const standaloneFriendTasks = useMemo(() => {
    const duplicateIds = new Set<string>();
    for (const fts of friendsByOwnTask.values()) {
      fts.forEach(ft => duplicateIds.add(ft.id));
    }
    return bucket.friendItems.filter(ft => !duplicateIds.has(ft.id));
  }, [bucket.friendItems, friendsByOwnTask]);

  const totalCount = bucket.items.length + standaloneFriendTasks.length +
    [...friendsByOwnTask.values()].reduce((s, arr) => s + arr.length, 0);

  return (
    <Card className={cardClass}>
      <div className="flex items-center gap-2 mb-2.5">
        {bucket.tone === 'danger' && <AlertTriangle className="size-5 text-rose-600" />}
        {bucket.tone !== 'danger' && bucket.key === 'heute' && <ListTodo className="size-5 text-orange-500" />}
        <h3 className={`h3 ${toneClass}`}>{bucket.label}</h3>
        <span className={`chip ${chipClass}`}>{totalCount}</span>
        {bucket.hint && <span className="text-[11px] text-ink-400 ml-1 hidden sm:inline">{bucket.hint}</span>}
      </div>

      <ul className="divide-y divide-white/50">
        {/* ── Eigene Aufgaben ── */}
        {bucket.items.map(t => {
          const subj = subjects.find(s => s.id === t.subjectId);
          const friendsHere = friendsByOwnTask.get(t.id) ?? [];
          const isConfirmDelete = confirmDeleteId === t.id;

          return (
            <li key={t.id}>
              {/* Confirm-Strip */}
              {isConfirmDelete ? (
                <div className="flex items-center gap-3 py-2.5">
                  <span className="text-sm text-rose-600 font-medium flex-1">Aufgabe wirklich löschen?</span>
                  <button onClick={() => { onDelete(t.id); setConfirmDeleteId(null); }}
                    className="btn-soft text-rose-600 py-1 text-xs">Löschen</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="btn-ghost py-1 text-xs">Abbrechen</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-2.5 group">
                  {/* Checkbox */}
                  <button onClick={() => onToggle(t.id)}
                    className={`grid place-items-center size-7 rounded-full hover:bg-white/70 transition flex-shrink-0 ${t.done ? 'text-emerald-500' : 'text-ink-400 hover:text-emerald-500'}`}>
                    {t.done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                  </button>

                  {/* Titel + Metadaten */}
                  <button onClick={() => onSelect(t)} className="flex-1 min-w-0 text-left">
                    <div className={`font-medium text-ink-800 truncate ${t.done ? 'line-through text-ink-400' : ''}`}>{t.title}</div>
                    <div className="text-xs text-ink-500 flex items-center gap-2 mt-0.5 flex-wrap">
                      <span>{getTaskKindIcon(t.kind)} {getTaskKindLabel(t.kind, config)}</span>
                      {subj && (<><span>·</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: subj.color }} />{subj.name}</span></>)}
                      {t.dueDate && <><span>·</span><span>{relativeDate(t.dueDate)}</span></>}
                      {t.shared && <span className="text-theme-deep">· geteilt</span>}
                    </div>
                  </button>

                  {/* Freunde-Badge (Duplikate) */}
                  {friendsHere.length > 0 && (
                    <button
                      onClick={() => setExpandedFriendId(expandedFriendId === t.id ? null : t.id)}
                      className={`chip text-[10px] flex-shrink-0 transition ${expandedFriendId === t.id ? 'bg-theme text-white border-theme' : 'bg-theme-soft text-theme-deep border-theme/30'}`}
                    >
                      <Users className="size-3" />
                      {friendsHere.length} {friendsHere.length === 1 ? 'Freund' : 'Freunde'}
                    </button>
                  )}

                  {/* Priorität-Chip */}
                  <span className={`chip text-[10px] flex-shrink-0 ${
                    t.priority === 3 ? 'bg-rose-100 text-rose-600 border-rose-200'
                    : t.priority === 2 ? 'bg-amber-100 text-amber-700 border-amber-200' : ''
                  }`}>
                    {t.priority === 3 ? 'Hoch' : t.priority === 2 ? 'Normal' : 'Niedrig'}
                  </span>

                  {/* Löschen */}
                  <button onClick={() => setConfirmDeleteId(t.id)}
                    className="opacity-0 group-hover:opacity-100 transition grid place-items-center size-7 rounded-full hover:bg-rose-50 text-ink-400 hover:text-rose-500 flex-shrink-0">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Expandierte Freund-Duplikate */}
              <AnimatePresence>
                {expandedFriendId === t.id && friendsHere.map(ft => (
                  <FriendRow
                    key={ft.id}
                    ft={ft}
                    confirmDismissId={confirmDismissId}
                    onDismissRequest={id => setConfirmDismissId(id)}
                    onDismissConfirm={id => { onDismiss(id); setConfirmDismissId(null); }}
                    onDismissCancel={() => setConfirmDismissId(null)}
                    isExpanded
                  />
                ))}
              </AnimatePresence>
            </li>
          );
        })}

        {/* ── Eigenständige Fremdaufgaben (kein Duplikat) ── */}
        {standaloneFriendTasks.map(ft => (
          <FriendRow
            key={ft.id}
            ft={ft}
            confirmDismissId={confirmDismissId}
            onDismissRequest={id => setConfirmDismissId(id)}
            onDismissConfirm={id => { onDismiss(id); setConfirmDismissId(null); }}
            onDismissCancel={() => setConfirmDismissId(null)}
            isExpanded={false}
          />
        ))}
      </ul>
    </Card>
  );
}

// ─── FriendRow ───────────────────────────────────────────────────────────────

function FriendRow({ ft, confirmDismissId, onDismissRequest, onDismissConfirm, onDismissCancel, isExpanded }: {
  ft: FriendTask;
  confirmDismissId: string | null;
  onDismissRequest: (id: string) => void;
  onDismissConfirm: (id: string) => void;
  onDismissCancel: () => void;
  isExpanded: boolean;
}) {
  const isConfirm = confirmDismissId === ft.id;

  return (
    <motion.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className={`overflow-hidden ${isExpanded ? 'pl-9 bg-ink-50/40' : ''}`}
    >
      {isConfirm ? (
        <div className="flex items-center gap-3 py-2.5">
          <span className="text-sm text-ink-600 font-medium flex-1">Ausblenden?</span>
          <button onClick={() => onDismissConfirm(ft.id)} className="btn-soft py-1 text-xs">Ausblenden</button>
          <button onClick={onDismissCancel} className="btn-ghost py-1 text-xs">Abbrechen</button>
        </div>
      ) : (
        <div className="flex items-start gap-2 py-2.5 group">
          <div className="grid place-items-center size-7 flex-shrink-0 mt-0.5">
            <Users className="size-4 text-ink-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-700 truncate text-sm">{ft.title}</div>
            <div className="text-xs text-ink-400 flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-theme-deep font-semibold">{ft.ownerName}</span>
              {ft.subjectName && <><span>·</span><span>{ft.subjectName}</span></>}
              {ft.dueDate && <><span>·</span><span>{relativeDate(ft.dueDate)}</span></>}
            </div>
            {ft.description && <div className="text-xs text-ink-400 mt-0.5 line-clamp-1">{ft.description}</div>}
          </div>
          <button onClick={() => onDismissRequest(ft.id)}
            className="opacity-0 group-hover:opacity-100 transition grid place-items-center size-7 rounded-full hover:bg-ink-100 text-ink-400 hover:text-ink-600 flex-shrink-0">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </motion.li>
  );
}
