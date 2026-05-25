import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Clock, Share2, KeyRound, Download, Pencil, Check } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { LessonDialog } from '@/components/dialogs/LessonDialog';
import { ScheduleShareDialog } from '@/components/dialogs/ScheduleShareDialog';
import { useStore } from '@/store/useStore';
import { WEEKDAYS_DE } from '@/lib/utils';
import type { Lesson, Weekday } from '@/types';

const HOURS = Array.from({ length: 11 }, (_, i) => i + 7);

function toMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

export function SchedulePage() {
  const lessons = useStore(s => s.lessons);
  const subjects = useStore(s => s.subjects);
  const nav = useNavigate();
  const [dialog, setDialog] = useState<{ open: boolean; lesson?: Lesson; defaults?: { weekday?: Weekday; start?: string; end?: string } }>({ open: false });
  const [shareDialog, setShareDialog] = useState<{ open: boolean; tab: 'share' | 'import' }>({ open: false, tab: 'share' });
  const [editMode, setEditMode] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<number, Lesson[]>();
    for (let d = 1; d <= 5; d++) m.set(d, []);
    for (const l of lessons) {
      if (l.weekday < 1 || l.weekday > 5) continue;
      const arr = m.get(l.weekday) ?? [];
      arr.push(l);
      m.set(l.weekday, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [lessons]);

  const startHour = 7;
  const endHour = 17;
  const totalMinutes = (endHour - startHour) * 60;
  const minHeight = 38;

  if (!subjects.length) {
    return (
      <PageShell title="Stundenplan"
        actions={
          <button className="btn-ghost" onClick={() => setShareDialog({ open: true, tab: 'import' })}>
            <Download className="size-4" />Code eingeben
          </button>
        }
      >
        <Card>
          <Empty
            icon={Clock}
            title="Noch keine Fächer angelegt"
            description="Lege erst Fächer an, oder übernimm einen Stundenplan per Code von einem Freund."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => nav('/einstellungen?section=subjects')} className="btn-primary">
                  <Plus className="size-4" /> Fach anlegen
                </button>
                <button onClick={() => setShareDialog({ open: true, tab: 'import' })} className="btn-ghost">
                  <KeyRound className="size-4" /> Code eingeben
                </button>
              </div>
            }
          />
        </Card>
        <ScheduleShareDialog open={shareDialog.open} initialTab={shareDialog.tab} onClose={() => setShareDialog({ open: false, tab: 'share' })} />
      </PageShell>
    );
  }

  return (
    <PageShell title="Stundenplan"
      subtitle={editMode
        ? 'Bearbeiten-Modus: klicke eine Stunde zum Ändern oder Löschen, oder auf eine freie Stelle für eine neue.'
        : 'Klicke auf ein Fach für die Detailansicht oder auf eine freie Stelle, um eine Stunde hinzuzufügen.'}
      actions={
        <>
          {!editMode && (
            <>
              <button className="btn-ghost" onClick={() => setShareDialog({ open: true, tab: 'import' })} title="Stundenplan per Code übernehmen">
                <Download className="size-4" /><span className="hidden sm:inline">Empfangen</span>
              </button>
              <button className="btn-ghost" onClick={() => setShareDialog({ open: true, tab: 'share' })} title="Stundenplan per Code teilen">
                <Share2 className="size-4" /><span className="hidden sm:inline">Teilen</span>
              </button>
            </>
          )}
          <button
            className={editMode ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setEditMode(e => !e)}
            title={editMode ? 'Bearbeiten beenden' : 'Stunden bearbeiten / löschen'}
          >
            {editMode ? <Check className="size-4" /> : <Pencil className="size-4" />}
            <span className="hidden sm:inline">{editMode ? 'Fertig' : 'Bearbeiten'}</span>
          </button>
          <button className="btn-primary" onClick={() => setDialog({ open: true })}><Plus className="size-4" />Neue Stunde</button>
        </>
      }
    >
      <Card>
        <div className="grid gap-2 min-w-[640px]" style={{ gridTemplateColumns: '52px repeat(5, 1fr)' }}>
          <div />
          {[1, 2, 3, 4, 5].map(d => (
            <div key={d} className="text-center pb-2">
              <div className="font-display font-bold text-ink-900">{WEEKDAYS_DE[d]}</div>
              <div className="text-xs text-ink-500">{byDay.get(d)?.length ?? 0} Stunden</div>
            </div>
          ))}
          <div className="relative" style={{ height: minHeight * (endHour - startHour) }}>
            {HOURS.filter(h => h <= endHour).map((h, idx) => (
              <div key={h} className="absolute -translate-y-1/2 text-[10px] font-semibold text-ink-400" style={{ top: idx * minHeight }}>
                {h.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {[1, 2, 3, 4, 5].map(d => (
            <div key={d} className="relative rounded-2xl bg-white/40 overflow-hidden cursor-pointer" style={{ height: minHeight * (endHour - startHour) }}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const minute = startHour * 60 + (y / rect.height) * totalMinutes;
                const snapped = Math.round(minute / 45) * 45;
                const h = Math.floor(snapped / 60);
                const m = snapped % 60;
                const start = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                const endM = snapped + 45;
                const eh = Math.floor(endM / 60);
                const em = endM % 60;
                const end = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
                setDialog({ open: true, defaults: { weekday: d as Weekday, start, end } });
              }}
            >
              {HOURS.filter(h => h <= endHour).map((_h, idx) => (
                <div key={idx} className="absolute inset-x-0 h-px bg-ink-100" style={{ top: idx * minHeight }} />
              ))}
              {(byDay.get(d) ?? []).map(l => {
                const subj = subjects.find(s => s.id === l.subjectId);
                if (!subj) return null;
                const s = toMinutes(l.start) - startHour * 60;
                const e = toMinutes(l.end) - startHour * 60;
                const top = (s / totalMinutes) * 100;
                const height = ((e - s) / totalMinutes) * 100;
                return (
                  <button
                    key={l.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (editMode) {
                        setDialog({ open: true, lesson: l });
                      } else {
                        nav(`/noten/${subj.id}`);
                      }
                    }}
                    onDoubleClick={(ev) => { ev.stopPropagation(); setDialog({ open: true, lesson: l }); }}
                    className={`absolute left-1 right-1 rounded-xl p-2 text-white text-left overflow-hidden shadow-soft transition hover:scale-[1.02] hover:z-10 ${editMode ? 'ring-2 ring-white/80 animate-pulse' : ''}`}
                    style={{ top: `${top}%`, height: `${height}%`, background: `linear-gradient(135deg, ${subj.color}, ${subj.color}cc)` }}
                  >
                    {editMode && (
                      <div className="absolute top-1 right-1 size-5 rounded-full bg-white/90 grid place-items-center shadow">
                        <Pencil className="size-2.5 text-ink-800" />
                      </div>
                    )}
                    <div className="text-[10px] opacity-90 flex items-center gap-1"><Clock className="size-2.5" />{l.start} – {l.end}</div>
                    <div className="font-display font-bold text-sm truncate">{subj.name}</div>
                    {(l.room ?? subj.room) && <div className="text-[10px] opacity-90 flex items-center gap-1"><MapPin className="size-2.5" />{l.room ?? subj.room}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h3 className="h3 mb-3">Schnellzugriff Fächer</h3>
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <button key={s.id} onClick={() => nav(`/noten/${s.id}`)} className="chip hover:bg-white text-white border-transparent" style={{ background: s.color }}>
              <span className="font-bold">{s.short}</span>
              <span className="font-medium">{s.name}</span>
            </button>
          ))}
        </div>
      </Card>

      <LessonDialog open={dialog.open} initial={dialog.lesson} defaults={dialog.defaults} onClose={() => setDialog({ open: false })} />
      <ScheduleShareDialog open={shareDialog.open} initialTab={shareDialog.tab} onClose={() => setShareDialog({ open: false, tab: 'share' })} />
    </PageShell>
  );
}
