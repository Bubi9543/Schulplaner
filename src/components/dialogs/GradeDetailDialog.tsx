import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Calendar, Tag, Scale, BookOpen, NotebookText, Clock, Timer, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { usePhotos, usePhotoUrl } from '@/lib/photos';
import { getSystemMeta, gradeColor, getKindLabel, isLargeAssessmentKind } from '@/lib/grading';
import { StudyChecklist } from '@/components/StudyChecklist';
import { GradeHeader, MetaTile } from './dialogParts';
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

/** Lernzeit menschenlesbar: "2 h 15 min", "45 min" oder "30 s". */
function fmtStudyDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function GradeDetailDialog({ open, grade: gradeProp, onClose, onEdit }: Props) {
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const deleteGrade = useStore(s => s.deleteGrade);
  const updateGrade = useStore(s => s.updateGrade);
  const focusSessions = useStore(s => s.focusSessions);
  const navigate = useNavigate();
  const liveGrade = useStore(s => gradeProp ? s.grades.find(g => g.id === gradeProp.id) : undefined);
  const grade = liveGrade ?? gradeProp;

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

  const testSessions = focusSessions.filter(f => f.gradeId === grade.id);
  const studyMs = testSessions.reduce((sum, f) => sum + f.focusedMs, 0);

  async function handleDelete() {
    if (!grade || !confirm(`Note „${grade.title || meta.formatValue(grade.value)}" wirklich löschen?`)) return;
    await deleteGrade(grade.id);
    onClose();
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

            <GradeHeader
              gradeText={isPending ? '?' : meta.formatValue(grade.value)} tendency={isPending ? undefined : grade.tendency} color={color}
              kindLabel={isPending ? 'Geplant' : kindLabel} subject={subject} title={grade.title}
              onEdit={() => onEdit(grade)} onDelete={handleDelete} onClose={onClose}
            />

            <div className="dlg-scroll p-5 flex flex-col gap-3.5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <MetaTile icon={Calendar} label="Datum">{fmtFullDate(grade.date)}</MetaTile>
                <MetaTile icon={Tag} label="Art">{kindLabel}</MetaTile>
                <MetaTile icon={BookOpen} label="Fach">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: subject.color }} />
                    {subject.name}
                  </span>
                </MetaTile>
                {!isPending && (
                  <MetaTile icon={Scale} label="Gewichtung">
                    <span className="font-bold">×{String(weightMul).replace('.', ',')}</span>
                    <div className="subtle text-[11px] mt-0.5">{isLarge ? 'große Leistung' : 'kleine Leistung'}</div>
                  </MetaTile>
                )}
                {isPending && (
                  <MetaTile icon={Clock} label="Status">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgb(245 158 11 / 0.16)', color: '#b45309' }}>
                      Note steht aus
                    </span>
                  </MetaTile>
                )}
              </div>

              {/* Lernzeit für diesen Test */}
              <button
                onClick={() => navigate('/fokus')}
                className="w-full text-left rounded-2xl p-4 flex items-center gap-3 transition hover:shadow-glow theme-gradient-soft group"
                style={{ border: '1px solid rgb(var(--theme-primary-rgb) / 0.25)' }}
              >
                <div className="size-11 rounded-2xl theme-gradient grid place-items-center shadow-glow shrink-0">
                  <Timer className="size-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="eyebrow text-theme-deep">Lernzeit für diesen Test</div>
                  {studyMs > 0 ? (
                    <div className="text-lg font-display font-extrabold leading-tight" style={{ color: 'rgb(var(--ink-900))' }}>
                      {fmtStudyDuration(studyMs)}
                      <span className="text-xs font-medium text-ink-500 ml-2">in {testSessions.length} {testSessions.length === 1 ? 'Session' : 'Sessions'}</span>
                    </div>
                  ) : (
                    <div className="text-sm font-medium" style={{ color: 'rgb(var(--ink-600))' }}>Noch keine Lernzeit – jetzt eine Fokus-Session starten</div>
                  )}
                </div>
                <ChevronRight className="size-5 text-theme-deep/60 group-hover:translate-x-0.5 transition shrink-0" />
              </button>

              {/* Lerncheckliste */}
              {(isPending || (grade.studyChecklist && grade.studyChecklist.length > 0)) && (
                <StudyChecklist
                  items={grade.studyChecklist ?? []}
                  onChange={(items: StudyChecklistItem[]) => { void updateGrade(grade.id, { studyChecklist: items }); }}
                  deadline={grade.studyDeadline}
                  onDeadlineChange={(d) => { void updateGrade(grade.id, { studyDeadline: d }); }}
                />
              )}

              <PhotoGallery refId={grade.id} refType="grade" />
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
      <div className="eyebrow flex items-center gap-2 mb-2"><NotebookText className="size-3.5" />{photos.length} {photos.length === 1 ? 'Foto' : 'Fotos'}</div>
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
