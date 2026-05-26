import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Trash2, Calendar, Tag, Scale, BookOpen, NotebookText, Clock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { usePhotos, usePhotoUrl } from '@/lib/photos';
import { getSystemMeta, gradeColor, getKindLabel, isLargeAssessmentKind } from '@/lib/grading';
import { hexToRgba } from '@/lib/utils';
import { StudyChecklist } from '@/components/StudyChecklist';
import type { Grade, Photo, StudyChecklistItem } from '@/types';

interface Props {
  open: boolean;
  grade?: Grade;
  onClose: () => void;
  onEdit: (g: Grade) => void;
}

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function GradeDetailDialog({ open, grade, onClose, onEdit }: Props) {
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const deleteGrade = useStore(s => s.deleteGrade);
  const updateGrade = useStore(s => s.updateGrade);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!grade || !settings) return null;
  const subject = subjects.find(s => s.id === grade.subjectId);
  if (!subject) return null;

  const meta = getSystemMeta(subject.system, settings.gradingConfig);
  const color = gradeColor(grade.value, subject.system, settings.gradingConfig);
  const isLarge = isLargeAssessmentKind(grade.kind, settings.gradingConfig);
  const isPending = !!grade.isPending;
  const weightMul = grade.weightMultiplier ?? 1;
  const kindLabel = getKindLabel(grade.kind, settings.gradingConfig);

  async function handleDelete() {
    if (!grade || !confirm(`Note „${grade.title || meta.formatValue(grade.value)}" wirklich löschen?`)) return;
    await deleteGrade(grade.id);
    onClose();
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
            {/* Riesige Note im Hero-Header */}
            <div className="relative p-6 md:p-8 text-white overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${color} 0%, ${hexToRgba(color, .82)} 100%)` }}>
              {/* Action-Buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                <button
                  onClick={() => onEdit(grade)}
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

              {/* Dezente Aurora */}
              <div className="absolute -top-20 -left-20 size-48 rounded-full bg-white/15 blur-3xl" />
              <div className="absolute -bottom-20 -right-20 size-48 rounded-full bg-white/10 blur-3xl" />

              <div className="relative flex flex-col items-center text-center">
                <div className="text-[11px] uppercase tracking-[0.2em] font-semibold opacity-90">
                  {isPending ? 'Geplant' : kindLabel}
                </div>
                <div className="font-display font-extrabold leading-none mt-3"
                  style={{ fontSize: 'clamp(5rem, 18vw, 9rem)' }}>
                  {isPending ? '?' : meta.formatValue(grade.value)}
                </div>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm font-semibold backdrop-blur-sm">
                  <span className="size-2 rounded-full" style={{ background: subject.color }} />
                  {subject.name}
                </div>
                {grade.title && (
                  <div className="mt-3 font-display font-bold text-lg md:text-xl opacity-95 max-w-md">
                    {grade.title}
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-5 max-h-[55vh] overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetaTile icon={Calendar} label="Datum">
                  {fmtFullDate(grade.date)}
                </MetaTile>
                <MetaTile icon={Tag} label="Art">
                  {kindLabel}
                </MetaTile>
                <MetaTile icon={BookOpen} label="Fach">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: subject.color }} />
                    {subject.name}
                  </span>
                </MetaTile>
                {!isPending && (
                  <MetaTile icon={Scale} label="Gewichtung">
                    <span className="font-semibold">×{String(weightMul).replace('.', ',')}</span>
                    <div className="text-[11px] text-ink-500 mt-0.5">
                      {isLarge ? 'große Leistung (Schulaufgabe/Klausur)' : 'kleine Leistung'}
                    </div>
                  </MetaTile>
                )}
                {isPending && (
                  <MetaTile icon={Clock} label="Status">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold">
                      Note steht aus
                    </span>
                  </MetaTile>
                )}
              </div>

              {/* Lerncheckliste – sinnvoll für ausstehende Schulaufgaben/Klausuren */}
              {(isPending || (grade.studyChecklist && grade.studyChecklist.length > 0)) && (
                <StudyChecklist
                  items={grade.studyChecklist ?? []}
                  onChange={(items: StudyChecklistItem[]) => {
                    void updateGrade(grade.id, { studyChecklist: items });
                  }}
                />
              )}

              {/* Fotos in groß */}
              <PhotoGallery refId={grade.id} refType="grade" />
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
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">
        <NotebookText className="size-3.5" />
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
