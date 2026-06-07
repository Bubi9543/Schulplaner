import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, Circle, Calendar, Flag, NotebookText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { usePhotos, usePhotoUrl } from '@/lib/photos';
import { getTaskKindLabel, getTaskKindIcon } from '@/lib/grading';
import { StudyChecklist } from '@/components/StudyChecklist';
import { DetailHeader, MetaTile, PRIO_COLOR, PRIO_LABEL, relText } from './dialogParts';
import type { AppTask, Photo, StudyChecklistItem } from '@/types';

interface Props {
  open: boolean;
  task?: AppTask;
  onClose: () => void;
  onEdit: (task: AppTask) => void;
}

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function TaskDetailDialog({ open, task: taskProp, onClose, onEdit }: Props) {
  const subjects = useStore(s => s.subjects);
  const config = useStore(s => s.settings?.gradingConfig);
  const toggleTask = useStore(s => s.toggleTask);
  const updateTask = useStore(s => s.updateTask);
  const deleteTask = useStore(s => s.deleteTask);
  const liveTask = useStore(s => taskProp ? s.tasks.find(t => t.id === taskProp.id) : undefined);
  const task = liveTask ?? taskProp;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!task) return null;

  const subj = subjects.find(s => s.id === task.subjectId);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueStart = task.dueDate ? (() => { const d = new Date(task.dueDate); d.setHours(0, 0, 0, 0); return d.getTime(); })() : null;
  const isOverdue = dueStart !== null && !task.done && dueStart < today.getTime() - 86400000;
  const isToday = dueStart !== null && dueStart === today.getTime();
  const daysUntil = dueStart !== null ? Math.round((dueStart - today.getTime()) / 86400000) : null;

  const status = task.done
    ? { icon: CheckCircle2, label: 'Erledigt', color: '#059669' }
    : isOverdue
      ? { icon: AlertTriangle, label: 'Überfällig', color: '#e11d48' }
      : isToday
        ? { icon: Calendar, label: 'Heute fällig', color: '#b45309' }
        : undefined;

  async function handleDelete() {
    if (!task || !confirm(`Aufgabe „${task.title}" wirklich löschen?`)) return;
    await deleteTask(task.id);
    onClose();
  }

  async function handleToggle() {
    if (!task) return;
    await toggleTask(task.id);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full md:max-w-xl max-h-[94vh] md:max-h-[86vh] glass-strong rounded-t-3xl md:rounded-3xl shadow-soft overflow-hidden flex flex-col"
            initial={{ y: 40, scale: .98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: .98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="md:hidden flex justify-center pt-2.5 shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-ink-300" />
            </div>

            <DetailHeader
              kindLabel={getTaskKindLabel(task.kind, config)} kindIcon={getTaskKindIcon(task.kind)}
              subject={subj} title={task.title} status={status} done={task.done}
              onEdit={() => onEdit(task)} onDelete={handleDelete} onClose={onClose}
            />

            <div className="dlg-scroll p-5 flex flex-col gap-3.5 overflow-y-auto flex-1">
              {/* Status-Toggle */}
              <button
                onClick={handleToggle}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition"
                style={task.done
                  ? { borderColor: 'rgb(16 185 129 / 0.5)', background: 'rgb(16 185 129 / 0.12)', color: '#059669' }
                  : { borderColor: 'rgb(var(--surface-border-rgb) / 0.8)', background: 'rgb(var(--surface-rgb) / 0.5)', color: 'rgb(var(--ink-800))' }}
              >
                {task.done ? <CheckCircle2 className="size-[21px] shrink-0" strokeWidth={2.4} /> : <Circle className="size-[21px] shrink-0 text-ink-400" />}
                <span className="font-bold text-[15px] whitespace-nowrap">{task.done ? 'Erledigt' : 'Als erledigt markieren'}</span>
                {task.done && task.doneAt && (
                  <span className="ml-auto text-xs opacity-80">
                    am {new Date(task.doneAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
              </button>

              {/* Meta-Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {task.dueDate && (
                  <MetaTile icon={Calendar} label="Fällig">
                    <span style={isOverdue ? { color: '#e11d48' } : undefined}>{fmtFullDate(task.dueDate)}</span>
                    {daysUntil !== null && <div className="subtle text-[11px] mt-0.5">{relText(daysUntil)}</div>}
                  </MetaTile>
                )}
                <MetaTile icon={Flag} label="Priorität">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: PRIO_COLOR[task.priority] }}>
                    {PRIO_LABEL[task.priority]}
                  </span>
                </MetaTile>
                {task.createdAt && (
                  <MetaTile icon={NotebookText} label="Angelegt">
                    {new Date(task.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </MetaTile>
                )}
              </div>

              {/* Notiz */}
              {task.description && task.description.trim() && (
                <div className="meta-tile">
                  <div className="mt-label"><NotebookText className="size-3.5" strokeWidth={2.2} />Notiz</div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgb(var(--ink-700))' }}>{task.description}</div>
                </div>
              )}

              {/* Lerncheckliste */}
              {(task.kind === 'test' || task.kind === 'schulaufgabe' || task.kind === 'projekt' || (task.studyChecklist && task.studyChecklist.length > 0)) && (
                <StudyChecklist
                  items={task.studyChecklist ?? []}
                  onChange={(items: StudyChecklistItem[]) => { void updateTask(task.id, { studyChecklist: items }); }}
                  deadline={task.studyDeadline}
                  onDeadlineChange={(d) => { void updateTask(task.id, { studyDeadline: d }); }}
                />
              )}

              <PhotoGallery refId={task.id} refType="task" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PhotoGallery({ refId, refType }: { refId: string; refType: Photo['refType'] }) {
  const { photos } = usePhotos(refId, refType);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  if (!photos.length) return null;
  return (
    <div>
      <div className="eyebrow mb-2">{photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {photos.map(p => <PhotoTile key={p.id} photo={p} onOpen={() => setLightbox(p)} />)}
      </div>
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function PhotoTile({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const { url, loading } = usePhotoUrl(photo);
  return (
    <button onClick={onOpen} className="relative aspect-square rounded-2xl overflow-hidden bg-ink-100 group shadow-sm hover:shadow-md transition">
      {loading && <div className="absolute inset-0 grid place-items-center text-xs text-ink-400 animate-pulse">…</div>}
      {url && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300" />}
      {!loading && !url && <div className="absolute inset-0 grid place-items-center text-xs text-rose-400">nicht verfügbar</div>}
    </button>
  );
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { url, loading } = usePhotoUrl(photo);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white p-2 rounded-full hover:bg-white/20" onClick={onClose}>
        <X className="size-7" />
      </button>
      {loading && <div className="text-white text-sm">Lädt …</div>}
      {url && <img src={url} alt="" className="max-w-full max-h-full rounded-2xl object-contain" onClick={e => e.stopPropagation()} />}
    </div>
  );
}
