import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Trash2, Check, Circle, Calendar, Flag, Tag, NotebookText, AlertTriangle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { usePhotos, usePhotoUrl } from '@/lib/photos';
import { getTaskKindLabel, getTaskKindIcon } from '@/lib/grading';
import { StudyChecklist } from '@/components/StudyChecklist';
import type { AppTask, Photo, StudyChecklistItem } from '@/types';

interface Props {
  open: boolean;
  task?: AppTask;
  onClose: () => void;
  onEdit: (task: AppTask) => void;
}

const PRIO_META: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: 'Niedrig', color: 'text-ink-600 bg-ink-100 border-ink-200' },
  2: { label: 'Normal',  color: 'text-amber-700 bg-amber-100 border-amber-200' },
  3: { label: 'Hoch',    color: 'text-rose-700 bg-rose-100 border-rose-200' },
};

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function TaskDetailDialog({ open, task, onClose, onEdit }: Props) {
  const subjects = useStore(s => s.subjects);
  const config = useStore(s => s.settings?.gradingConfig);
  const toggleTask = useStore(s => s.toggleTask);
  const updateTask = useStore(s => s.updateTask);
  const deleteTask = useStore(s => s.deleteTask);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!task) return null;

  const subj = subjects.find(s => s.id === task.subjectId);
  const accentColor = subj?.color ?? '#6366f1';

  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueStart = task.dueDate ? (() => { const d = new Date(task.dueDate); d.setHours(0,0,0,0); return d.getTime(); })() : null;
  const isOverdue = dueStart !== null && !task.done && dueStart < today.getTime() - 86400000;
  const isToday = dueStart !== null && dueStart === today.getTime();
  const daysUntil = dueStart !== null ? Math.round((dueStart - today.getTime()) / 86400000) : null;

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
          className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-3 md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full max-w-2xl glass-strong rounded-3xl shadow-soft overflow-hidden"
            initial={{ y: 30, scale: .96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: .98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {/* Header mit Fach-Farbverlauf */}
            <div className="relative p-6 text-white overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 60%, ${accentColor}aa 100%)` }}>
              {/* Action-Buttons oben rechts */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <button
                  onClick={() => onEdit(task)}
                  className="size-9 grid place-items-center rounded-full bg-white/20 hover:bg-white/30 transition text-white"
                  title="Bearbeiten"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="size-9 grid place-items-center rounded-full bg-white/20 hover:bg-rose-500/80 transition text-white"
                  title="Löschen"
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  onClick={onClose}
                  className="size-9 grid place-items-center rounded-full bg-white/20 hover:bg-white/30 transition text-white"
                  title="Schließen"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold opacity-90">
                <span>{getTaskKindIcon(task.kind)}</span>
                <span>{getTaskKindLabel(task.kind, config)}</span>
                {isOverdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/90 text-white text-[10px] font-bold">
                    <AlertTriangle className="size-3" /> Überfällig
                  </span>
                )}
                {isToday && !task.done && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-bold">
                    Heute fällig
                  </span>
                )}
              </div>

              <h2 className={`font-display font-extrabold text-2xl md:text-3xl mt-2 leading-tight pr-32 ${task.done ? 'line-through opacity-70' : ''}`}>
                {task.title}
              </h2>

              {subj && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm font-semibold backdrop-blur-sm">
                  <span className="size-2 rounded-full bg-white" />
                  {subj.name}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              {/* Status-Toggle */}
              <button
                onClick={handleToggle}
                className={`w-full rounded-2xl border-2 px-4 py-3 flex items-center gap-3 transition ${
                  task.done
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-ink-200 bg-white/60 hover:bg-white text-ink-800'
                }`}
              >
                {task.done
                  ? <Check className="size-5 text-emerald-600" strokeWidth={3} />
                  : <Circle className="size-5 text-ink-400" />}
                <span className="font-semibold">
                  {task.done ? 'Erledigt' : 'Als erledigt markieren'}
                </span>
                {task.done && task.doneAt && (
                  <span className="ml-auto text-xs text-emerald-700/80">
                    am {new Date(task.doneAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                )}
              </button>

              {/* Meta-Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {task.dueDate && (
                  <MetaTile icon={Calendar} label="Fällig">
                    <div className={isOverdue ? 'text-rose-700 font-semibold' : ''}>
                      {fmtFullDate(task.dueDate)}
                    </div>
                    {daysUntil !== null && (
                      <div className="text-xs text-ink-500 mt-0.5">
                        {daysUntil === 0 ? 'heute'
                          : daysUntil === 1 ? 'morgen'
                          : daysUntil === -1 ? 'gestern'
                          : daysUntil > 0 ? `in ${daysUntil} Tagen`
                          : `vor ${Math.abs(daysUntil)} Tagen`}
                      </div>
                    )}
                  </MetaTile>
                )}
                <MetaTile icon={Flag} label="Priorität">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold ${PRIO_META[task.priority].color}`}>
                    {PRIO_META[task.priority].label}
                  </span>
                </MetaTile>
                <MetaTile icon={Tag} label="Art">
                  {getTaskKindIcon(task.kind)} {getTaskKindLabel(task.kind, config)}
                </MetaTile>
                {task.createdAt && (
                  <MetaTile icon={NotebookText} label="Angelegt">
                    {new Date(task.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </MetaTile>
                )}
              </div>

              {/* Beschreibung */}
              {task.description && task.description.trim() && (
                <div className="rounded-2xl bg-white/60 p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1.5 flex items-center gap-1.5">
                    <NotebookText className="size-3.5" /> Notiz
                  </div>
                  <div className="text-ink-800 whitespace-pre-wrap leading-relaxed">{task.description}</div>
                </div>
              )}

              {/* Lerncheckliste – sinnvoll vor allem für Tests/Schulaufgaben/Projekte */}
              {(task.kind === 'test' || task.kind === 'schulaufgabe' || task.kind === 'projekt' || (task.studyChecklist && task.studyChecklist.length > 0)) && (
                <StudyChecklist
                  items={task.studyChecklist ?? []}
                  onChange={(items: StudyChecklistItem[]) => {
                    void updateTask(task.id, { studyChecklist: items });
                  }}
                />
              )}

              {/* Fotos in groß */}
              <PhotoGallery refId={task.id} refType="task" />

              {/* Aktualität */}
              <div className="text-xs text-ink-400 text-center pt-2">
                {now > task.createdAt
                  ? `vor ${Math.max(1, Math.round((now - task.createdAt) / 86400000))} Tagen angelegt`
                  : 'soeben'}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MetaTile({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-sm font-medium text-ink-800">{children}</div>
    </div>
  );
}

function PhotoGallery({ refId, refType }: { refId: string; refType: Photo['refType'] }) {
  const { photos } = usePhotos(refId, refType);
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  if (!photos.length) return null;

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">
        {photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {photos.map(p => (
          <PhotoTile key={p.id} photo={p} onOpen={() => setLightbox(p)} />
        ))}
      </div>
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function PhotoTile({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const { url, loading } = usePhotoUrl(photo);
  return (
    <button
      onClick={onOpen}
      className="relative aspect-square rounded-2xl overflow-hidden bg-ink-100 group shadow-sm hover:shadow-md transition"
    >
      {loading && (
        <div className="absolute inset-0 grid place-items-center text-xs text-ink-400 animate-pulse">…</div>
      )}
      {url && (
        <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300" />
      )}
      {!loading && !url && (
        <div className="absolute inset-0 grid place-items-center text-xs text-rose-400">nicht verfügbar</div>
      )}
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
