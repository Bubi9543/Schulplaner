import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, MapPin, User, Target, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { GradeBadge } from '@/components/GradeBadge';
import { GradeDialog } from '@/components/dialogs/GradeDialog';
import { SubjectDialog } from '@/components/dialogs/SubjectDialog';
import { useStore } from '@/store/useStore';
import { average, defaultWeight, formatAverage, gradeTrend, KIND_WEIGHTS, subjectAverage } from '@/lib/grading';
import { formatDate, relativeDate } from '@/lib/utils';
import type { Grade } from '@/types';

export function SubjectDetailPage() {
  const { subjectId } = useParams();
  const nav = useNavigate();
  const subjects = useStore(s => s.subjects);
  const grades = useStore(s => s.grades);
  const tasks = useStore(s => s.tasks);
  const lessons = useStore(s => s.lessons);

  const subject = subjects.find(s => s.id === subjectId);
  const [gradeDialog, setGradeDialog] = useState<{ open: boolean; grade?: Grade }>({ open: false });
  const [subjectDialog, setSubjectDialog] = useState(false);

  const subjectGrades = useMemo(() => subject ? grades.filter(g => g.subjectId === subject.id).sort((a, b) => a.date - b.date) : [], [grades, subject]);
  const realGrades = subjectGrades.filter(g => !g.isPending);
  const pendingGrades = subjectGrades.filter(g => g.isPending);
  const avg = subject ? subjectAverage(grades, subject) : null;
  const trend = useMemo(() => gradeTrend(subjectGrades), [subjectGrades]);

  const byKind = useMemo(() => {
    const m: Record<string, Grade[]> = {};
    for (const g of realGrades) (m[g.kind] ??= []).push(g);
    return Object.entries(m).map(([kind, gs]) => ({ kind, count: gs.length, avg: average(gs), weight: defaultWeight(kind, subject?.system ?? 'bayern', subject?.category ?? 'neben') }));
  }, [realGrades, subject]);

  const lineData = useMemo(() => {
    let sum = 0, w = 0;
    return realGrades.map(g => {
      sum += g.value * (g.weight || 1);
      w += (g.weight || 1);
      return { date: formatDate(g.date, { day: '2-digit', month: '2-digit' }), value: g.value, avg: +(sum / w).toFixed(2) };
    });
  }, [realGrades]);

  const lessonCount = subject ? lessons.filter(l => l.subjectId === subject.id).length : 0;
  const openTasks = subject ? tasks.filter(t => t.subjectId === subject.id && !t.done) : [];

  if (!subject) {
    return (
      <PageShell accent="green" title="Fach nicht gefunden">
        <Card>
          <Empty icon={Target} title="Dieses Fach existiert nicht" action={<Link to="/noten" className="btn-primary"><ArrowLeft className="size-4" />Zurück</Link>} />
        </Card>
      </PageShell>
    );
  }

  const accent = pickAccent(subject.color);

  return (
    <PageShell accent={accent} title={subject.name} subtitle={`${subject.category === 'haupt' ? 'Hauptfach' : 'Nebenfach'} · ${realGrades.length} Noten · ${lessonCount} Stunden/Woche`}
      actions={
        <>
          <button onClick={() => nav('/noten')} className="btn-ghost"><ArrowLeft className="size-4" />Zurück</button>
          <button onClick={() => setSubjectDialog(true)} className="btn-ghost"><Pencil className="size-4" />Bearbeiten</button>
          <button onClick={() => setGradeDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Note</button>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        <Card delay={0} className="col-span-12 md:col-span-5 lg:col-span-4 !p-6 text-white border-0 relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.color}cc)` }} />
          <div className="absolute -top-12 -right-12 size-48 rounded-full bg-white/10 blur-2xl animate-blob" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="size-16 rounded-3xl bg-white/20 grid place-items-center font-display font-extrabold text-2xl">{subject.short}</div>
              <div>
                <div className="text-xs opacity-80 uppercase tracking-wider">{subject.system === 'bayern' ? 'Bayerisches System' : 'Oberstufe'}</div>
                <div className="font-display font-bold text-xl">{subject.name}</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-xs opacity-80">Aktueller Schnitt</div>
              <div className="font-display font-extrabold text-5xl mt-1">{formatAverage(avg, subject.system)}</div>
              <div className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                {trend === 'up' ? <><TrendingUp className="size-4" />Trend: besser</> : trend === 'down' ? <><TrendingDown className="size-4" />Trend: schlechter</> : 'Stabil'}
              </div>
            </div>
            {(subject.teacher || subject.room || subject.targetAverage) && (
              <div className="mt-6 grid grid-cols-1 gap-1.5 text-sm">
                {subject.teacher && <div className="flex items-center gap-2 opacity-90"><User className="size-3.5" />{subject.teacher}</div>}
                {subject.room && <div className="flex items-center gap-2 opacity-90"><MapPin className="size-3.5" />Raum {subject.room}</div>}
                {subject.targetAverage && <div className="flex items-center gap-2 opacity-90"><Target className="size-3.5" />Ziel {formatAverage(subject.targetAverage, subject.system)}</div>}
              </div>
            )}
          </div>
        </Card>

        <Card delay={0.05} className="col-span-12 md:col-span-7 lg:col-span-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3">Verlauf & Schnitt</h3>
            {subject.targetAverage && <span className="chip">Zielnote: {formatAverage(subject.targetAverage, subject.system)}</span>}
          </div>
          <div className="h-64">
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(15,18,32,0.06)" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis reversed={subject.system === 'bayern'} domain={subject.system === 'bayern' ? [1, 6] : [0, 15]} stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)' }} />
                  {subject.targetAverage && <ReferenceLine y={subject.targetAverage} stroke="#ec4899" strokeDasharray="4 4" label={{ value: 'Ziel', fill: '#ec4899', fontSize: 10 }} />}
                  <Line type="monotone" dataKey="value" stroke={subject.color} strokeWidth={1.5} dot={{ r: 3 }} strokeOpacity={0.6} />
                  <Line type="monotone" dataKey="avg" stroke={subject.color} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-ink-400">Noch keine Noten</div>
            )}
          </div>
        </Card>

        <Card delay={0.1} className="col-span-12 md:col-span-6">
          <h3 className="h3 mb-2">Nach Art</h3>
          {byKind.length === 0 ? (
            <div className="text-sm text-ink-500 py-4 text-center">Noch keine Noten</div>
          ) : (
            <ul className="space-y-2">
              {byKind.map(b => (
                <li key={b.kind} className="flex items-center gap-3 rounded-2xl p-2 bg-white/60">
                  <div className="flex-1">
                    <div className="font-semibold text-ink-800">{KIND_WEIGHTS[b.kind]?.label ?? b.kind}</div>
                    <div className="text-xs text-ink-500">{b.count} Noten · Gewicht {b.weight}</div>
                  </div>
                  <GradeBadge value={b.avg ?? 0} system={subject.system} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card delay={0.15} className="col-span-12 md:col-span-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="h3 flex items-center gap-2"><Calendar className="size-5" />Ausstehende & Aufgaben</h3>
          </div>
          {pendingGrades.length === 0 && openTasks.length === 0 ? (
            <div className="text-sm text-ink-500 py-4 text-center">Nichts geplant.</div>
          ) : (
            <ul className="space-y-2">
              {pendingGrades.map(g => (
                <li key={g.id} className="flex items-center gap-3 rounded-2xl p-2 bg-white/60">
                  <GradeBadge value={0} system={subject.system} size="sm" pending />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-800 truncate">{g.title ?? 'Ausstehende Note'}</div>
                    <div className="text-xs text-ink-500">{KIND_WEIGHTS[g.kind]?.label} · {relativeDate(g.date)}</div>
                  </div>
                </li>
              ))}
              {openTasks.map(t => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl p-2 bg-white/60">
                  <div className="size-9 rounded-xl grid place-items-center bg-ink-100 font-bold text-xs">📝</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-800 truncate">{t.title}</div>
                    <div className="text-xs text-ink-500">{t.dueDate ? relativeDate(t.dueDate) : 'Ohne Datum'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card delay={0.2} className="col-span-12">
          <h3 className="h3 mb-3">Alle Noten</h3>
          {realGrades.length === 0 ? (
            <Empty icon={Plus} title="Noch keine Noten" description="Trage deine erste Note ein." action={<button onClick={() => setGradeDialog({ open: true })} className="btn-primary"><Plus className="size-4" />Note hinzufügen</button>} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...realGrades].reverse().map(g => (
                <button key={g.id} onClick={() => setGradeDialog({ open: true, grade: g })}
                  className="rounded-2xl bg-white/70 hover:bg-white p-3 text-left transition shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <GradeBadge value={g.value} system={subject.system} size="sm" />
                    <span className="chip">{KIND_WEIGHTS[g.kind]?.label}</span>
                  </div>
                  <div className="font-semibold text-sm text-ink-800 truncate">{g.title ?? 'Note'}</div>
                  <div className="text-xs text-ink-500">{formatDate(g.date)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <GradeDialog open={gradeDialog.open} initial={gradeDialog.grade} defaultSubjectId={subject.id} onClose={() => setGradeDialog({ open: false })} />
      <SubjectDialog open={subjectDialog} initial={subject} onClose={() => setSubjectDialog(false)} />
    </PageShell>
  );
}

function pickAccent(color: string): 'blue' | 'green' | 'orange' | 'violet' | 'rose' {
  const h = color.toLowerCase();
  if (/(#6|#3|#0|#1).*/.test(h)) return 'blue';
  if (/#(10|14|22|84)/.test(h)) return 'green';
  if (/#(a8|8b|c0|6c)/.test(h)) return 'violet';
  if (/#(ec|f4|fb|f5|f9)/.test(h)) return 'rose';
  if (/#(f9|f5|fa|fb)/.test(h)) return 'orange';
  return 'violet';
}
