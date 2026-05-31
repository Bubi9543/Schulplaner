import { Link } from 'react-router-dom';
import { GraduationCap, Trophy, BookOpen, FileText, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useStore } from '@/store/useStore';
import { gradeColor } from '@/lib/grading';
import {
  computeAbitur, MAX_BLOCK_I, MAX_BLOCK_II, MAX_TOTAL, MAX_EINGEBRACHT, NUM_ABITURFAECHER,
} from '@/lib/abitur';
import { DEFAULT_GRADING_CONFIG } from '@/types';
import type { AbiturConfig } from '@/types';

export function AbiturPage() {
  const subjects = useStore(s => s.subjects);
  const allYearGrades = useStore(s => s.allYearGrades);
  const settings = useStore(s => s.settings);
  const schoolYears = useStore(s => s.schoolYears);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const updateSchoolYear = useStore(s => s.updateSchoolYear);
  const config = settings?.gradingConfig ?? DEFAULT_GRADING_CONFIG;

  const year = schoolYears.find(y => y.id === activeSchoolYearId);
  const abitur = year?.abitur;

  const result = computeAbitur(subjects, allYearGrades, abitur, config, year?.oberstufeJahrgaenge);

  if (!year?.oberstufe) {
    return (
      <PageShell title="Abitur">
        <Card>
          <Empty
            icon={GraduationCap}
            title="Nur in der Oberstufe verfügbar"
            description="Der Abitur-Rechner funktioniert in einem Oberstufen-Schuljahr (Q-Phase). Lege eines an oder wechsle dorthin."
            action={<Link to="/einstellungen?section=schoolyears" className="btn-primary">Schuljahre verwalten</Link>}
          />
        </Card>
      </PageShell>
    );
  }

  const examSubjectIds = abitur?.examSubjectIds ?? [];

  const fullSubjectIds = abitur?.fullSubjectIds ?? [];

  async function patchAbitur(patch: Partial<AbiturConfig>) {
    if (!year) return;
    const next: AbiturConfig = {
      examSubjectIds: abitur?.examSubjectIds ?? [],
      examPoints: abitur?.examPoints ?? {},
      fullSubjectIds: abitur?.fullSubjectIds ?? [],
      struckKeys: abitur?.struckKeys ?? [],
      ...patch,
    };
    await updateSchoolYear(year.id, { abitur: next });
  }

  function toggleExam(id: string) {
    const has = examSubjectIds.includes(id);
    if (has) {
      void patchAbitur({ examSubjectIds: examSubjectIds.filter(x => x !== id) });
    } else if (examSubjectIds.length < NUM_ABITURFAECHER) {
      void patchAbitur({ examSubjectIds: [...examSubjectIds, id] });
    }
  }

  function setExamPoints(id: string, pts: number) {
    void patchAbitur({ examPoints: { ...(abitur?.examPoints ?? {}), [id]: pts } });
  }

  function toggleFull(id: string) {
    const has = fullSubjectIds.includes(id);
    void patchAbitur({ fullSubjectIds: has ? fullSubjectIds.filter(x => x !== id) : [...fullSubjectIds, id] });
  }

  function toggleStrike(key: string) {
    const struck = abitur?.struckKeys ?? [];
    const has = struck.includes(key);
    void patchAbitur({ struckKeys: has ? struck.filter(x => x !== key) : [...struck, key] });
  }

  const note = result.note;
  const noteStr = note !== null ? note.toFixed(1).replace('.', ',') : '–';
  // Notenfarbe: 1,0 grün → 4,0 rot (umgekehrt zur Punkteskala).
  const noteColor = note === null ? '#64748b'
    : note <= 1.5 ? '#10b981' : note <= 2.5 ? '#22c55e' : note <= 3.3 ? '#f59e0b' : '#f97316';

  return (
    <PageShell
      title="Abitur"
      subtitle="Prognose der Gesamtqualifikation – Bayern G9"
    >
      <div className="grid grid-cols-12 gap-4 md:gap-5">
        {/* Ergebnis-Hero */}
        <Card delay={0} className="col-span-12 md:col-span-4 theme-gradient !text-white border-0 flex flex-col items-center justify-center py-7 gap-1">
          <div className="text-xs uppercase tracking-widest opacity-80 font-semibold">Abiturnote (Prognose)</div>
          <div className="font-display font-extrabold text-7xl leading-none mt-2 drop-shadow-sm">{noteStr}</div>
          <div className="mt-3 text-sm font-semibold opacity-90">{result.total} / {MAX_TOTAL} Punkte</div>
          <div className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${result.passed ? 'bg-white/20' : 'bg-black/20'}`}>
            {result.passed ? <><CheckCircle2 className="size-4" />Bestanden</> : <><AlertTriangle className="size-4" />Noch nicht bestanden</>}
          </div>
        </Card>

        {/* Block-Übersicht */}
        <Card delay={0.05} className="col-span-12 md:col-span-8">
          <h3 className="h3 mb-3">Gesamtqualifikation</h3>
          <BlockBar
            icon={BookOpen}
            label={`Block I · ${result.eingebracht.length} eingebrachte Halbjahresleistungen`}
            value={result.blockI} max={MAX_BLOCK_I} color="#6366f1"
          />
          <div className="h-3" />
          <BlockBar
            icon={Trophy}
            label={`Block II · ${examSubjectIds.length}/${NUM_ABITURFAECHER} Abiturprüfungen (×4)`}
            value={result.blockII} max={MAX_BLOCK_II} color="#f59e0b"
          />
          <div className="h-3" />
          <BlockBar
            icon={GraduationCap}
            label="Gesamt"
            value={result.total} max={MAX_TOTAL} color={noteColor} strong
          />

          {result.warnings.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" /><span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Block II: Abiturprüfungsfächer */}
        <Card delay={0.1} className="col-span-12 lg:col-span-7">
          <h3 className="h3 mb-1 flex items-center gap-2"><Trophy className="size-5 text-amber-500" />Abiturprüfungen</h3>
          <p className="subtle mb-3">Wähle {NUM_ABITURFAECHER} Prüfungsfächer und trage die erreichten Punkte (0–15) ein. Jedes zählt 4-fach.</p>
          <div className="space-y-2">
            {subjects.map(s => {
              const selected = examSubjectIds.includes(s.id);
              const pts = abitur?.examPoints?.[s.id] ?? 0;
              const disabled = !selected && examSubjectIds.length >= NUM_ABITURFAECHER;
              return (
                <div key={s.id} className={`flex items-center gap-3 rounded-2xl p-2.5 border transition ${selected ? 'border-theme bg-theme-soft/30' : 'border-white/50 bg-white/60'} ${disabled ? 'opacity-40' : ''}`}>
                  <button
                    onClick={() => toggleExam(s.id)}
                    disabled={disabled}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <span className={`size-5 rounded-md grid place-items-center border-2 flex-shrink-0 ${selected ? 'bg-theme border-theme text-white' : 'border-ink-300'}`}>
                      {selected && <CheckCircle2 className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="size-8 rounded-lg grid place-items-center text-white flex-shrink-0" style={{ background: s.color }}>
                      <SubjectIcon subject={s} className="size-4" />
                    </span>
                    <span className="font-semibold text-ink-800 truncate">{s.name}</span>
                    {s.leistungsfach && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">LF</span>}
                  </button>
                  {selected && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={pts}
                        onChange={e => setExamPoints(s.id, parseInt(e.target.value, 10))}
                        className="chip bg-white/90 cursor-pointer text-sm"
                      >
                        {Array.from({ length: 16 }, (_, i) => i).map(v => (
                          <option key={v} value={v}>{v} P</option>
                        ))}
                      </select>
                      <span className="text-xs text-ink-500 w-12 text-right">= {pts * 4} P</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Block I: Halbjahresleistungen */}
        <Card delay={0.15} className="col-span-12 lg:col-span-5">
          <h3 className="h3 mb-1 flex items-center gap-2"><BookOpen className="size-5 text-indigo-500" />Halbjahresleistungen</h3>
          <p className="subtle mb-3">
            Abiturfächer und Pflichtfächer werden komplett eingebracht, der Rest wird mit den besten
            Halbjahresleistungen auf {MAX_EINGEBRACHT} aufgefüllt (max. {MAX_BLOCK_I} P).
          </p>

          {/* Pflichtfächer markieren */}
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1.5">Komplett einbringen (Pflicht)</div>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map(s => {
                const isExam = examSubjectIds.includes(s.id);
                const isFull = isExam || fullSubjectIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => { if (!isExam) toggleFull(s.id); }}
                    disabled={isExam}
                    title={isExam ? 'Abiturfach – immer komplett' : 'Alle 4 Halbjahre verpflichtend einbringen'}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${isFull ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/60 text-ink-600 border-ink-200 hover:bg-white'} ${isExam ? 'opacity-80 cursor-default' : ''}`}
                  >
                    {s.short || s.name}{isExam && ' ★'}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-ink-400 mt-1">★ = Abiturfach (automatisch Pflicht). Tipp: Deutsch, Mathe, fortgeführte Fremdsprache & Naturwissenschaft markieren.</div>
          </div>

          {result.hjl.length === 0 ? (
            <div className="text-sm text-ink-500 py-4 text-center flex items-center justify-center gap-1.5">
              <FileText className="size-4" />Noch keine Halbjahresleistungen
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-[22rem] overflow-y-auto pr-1">
              {result.hjl.map(h => {
                const key = `${h.subjectId}:${h.term}`;
                const isPflicht = result.pflichtKeys.has(key);
                const isStruck = result.struckKeys.has(key);
                const eingebracht = result.eingebrachtKeys.has(key);
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${eingebracht ? 'bg-white/60' : 'opacity-45'}`}
                  >
                    <span className="text-[11px] font-semibold text-ink-400 w-10 flex-shrink-0">{h.termLabel}</span>
                    <span className="flex-1 truncate text-sm text-ink-700">{h.subjectName}</span>
                    {isPflicht
                      ? <span className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">Pflicht</span>
                      : (
                        <button
                          onClick={() => toggleStrike(key)}
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded transition ${isStruck ? 'text-rose-500 hover:bg-rose-50' : 'text-ink-400 hover:bg-ink-100'}`}
                          title={isStruck ? 'Streichung aufheben' : 'Diese Halbjahresleistung streichen'}
                        >
                          {isStruck ? 'gestrichen ↺' : 'streichen'}
                        </button>
                      )}
                    <span className="font-display font-bold text-sm w-7 text-right" style={{ color: gradeColor(h.points, 'oberstufe', config) }}>{h.points}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card delay={0.2} className="col-span-12">
          <div className="flex items-start gap-2 text-xs text-ink-500 leading-relaxed">
            <Info className="size-4 shrink-0 mt-0.5 text-theme" />
            <span>
              Bayerisches G9-Modell: Block I = {MAX_EINGEBRACHT} eingebrachte Halbjahresleistungen (Abitur- & Pflichtfächer komplett,
              Rest mit den besten aufgefüllt; max. {MAX_BLOCK_I} P), Block II = {NUM_ABITURFAECHER} Abiturprüfungen × 4 (max. {MAX_BLOCK_II} P),
              Gesamt max. {MAX_TOTAL} P → Note 1,0–4,0. Du bestimmst Pflichtfächer und Streichungen selbst – die feinen Aufgabenfeld-Regeln
              (GSO Anlage 10) prüft die App nicht automatisch. Orientierung, keine amtliche Berechnung.
            </span>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function BlockBar({ icon: Icon, label, value, max, color, strong }: {
  icon: typeof BookOpen; label: string; value: number; max: number; color: string; strong?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-ink-700 flex items-center gap-1.5"><Icon className="size-4" style={{ color }} />{label}</span>
        <span className={`font-display ${strong ? 'font-extrabold text-base' : 'font-bold text-sm'} text-ink-900`}>{value} <span className="text-ink-400 font-normal">/ {max}</span></span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
