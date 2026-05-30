import { db, uid } from './db';
import { defaultWeight } from './grading';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, Weekday, GradeKind } from '@/types';

const SUBJECTS_DEMO: Array<Omit<Subject, 'id' | 'createdAt'>> = [
  { name: 'Mathematik', short: 'M', color: '#6366f1', category: 'hauptfach', system: 'bayern', teacher: 'Frau Bauer', room: 'B204', targetAverage: 2.5 },
  { name: 'Deutsch', short: 'D', color: '#ec4899', category: 'hauptfach', system: 'bayern', teacher: 'Herr Vogel', room: 'A112', targetAverage: 2.5 },
  { name: 'Englisch', short: 'E', color: '#06b6d4', category: 'hauptfach', system: 'bayern', teacher: 'Frau Hofer', room: 'A203', targetAverage: 2.0 },
  { name: 'Latein', short: 'L', color: '#a855f7', category: 'hauptfach', system: 'bayern', teacher: 'Herr Stein', room: 'A210', targetAverage: 2.5 },
  { name: 'Physik', short: 'Ph', color: '#3b82f6', category: 'hauptfach-1zu1', system: 'bayern', teacher: 'Frau Roth', room: 'C101' },
  { name: 'Chemie', short: 'Ch', color: '#14b8a6', category: 'hauptfach-1zu1', system: 'bayern', teacher: 'Herr Klein', room: 'C103' },
  { name: 'Biologie', short: 'Bi', color: '#10b981', category: 'nebenfach', system: 'bayern', teacher: 'Frau Berg', room: 'C202' },
  { name: 'Geschichte', short: 'G', color: '#f59e0b', category: 'nebenfach', system: 'bayern', teacher: 'Herr Mayer', room: 'A305' },
  { name: 'Geographie', short: 'Geo', color: '#84cc16', category: 'nebenfach', system: 'bayern', teacher: 'Frau Albers', room: 'A301' },
  { name: 'Kunst', short: 'Ku', color: '#f43f5e', category: 'nebenfach', system: 'bayern', teacher: 'Herr Eder', room: 'K1' },
  { name: 'Sport', short: 'Sp', color: '#f97316', category: 'nebenfach', system: 'bayern', teacher: 'Frau Lang', room: 'Halle' },
  { name: 'Musik', short: 'Mu', color: '#8b5cf6', category: 'nebenfach', system: 'bayern', teacher: 'Herr Wolf', room: 'Mu1' },
];

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

function daysFromNow(n: number, hour = 8) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function genGradesFor(subject: Subject): Grade[] {
  const isHaupt = subject.category !== 'nebenfach';
  const count = isHaupt ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
  const grades: Grade[] = [];
  const kinds = isHaupt
    ? ['schulaufgabe', 'schulaufgabe', 'muendlich', 'stegreif', 'muendlich', 'sonstige'] as const
    : ['stegreif', 'muendlich', 'projekt', 'muendlich', 'sonstige'] as const;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length] as GradeKind;
    const target = subject.targetAverage ?? 2.6;
    const val = Math.max(1, Math.min(5, target + (Math.random() - 0.45) * 1.8));
    const v = Math.round(val);
    grades.push({
      id: uid(),
      subjectId: subject.id,
      value: v,
      kind,
      title: kind === 'schulaufgabe' ? `${i + 1}. Schulaufgabe` : kind === 'stegreif' ? 'Stegreifaufgabe' : kind === 'muendlich' ? 'Mündliche Note' : kind === 'projekt' ? 'Projekt' : 'Sonstige Leistung',
      date: daysAgo(140 - i * 18 + Math.floor(Math.random() * 6)),
      weight: defaultWeight(kind, subject.system, subject.category, DEFAULT_GRADING_CONFIG),
    });
  }
  if (Math.random() > 0.5) {
    grades.push({
      id: uid(),
      subjectId: subject.id,
      value: 0,
      kind: 'schulaufgabe',
      title: 'Schulaufgabe (steht aus)',
      date: daysFromNow(7 + Math.floor(Math.random() * 14)),
      weight: defaultWeight('schulaufgabe', subject.system, subject.category, DEFAULT_GRADING_CONFIG),
      isPending: true,
    });
  }
  return grades;
}

const TIMES = [
  ['08:00', '08:45'], ['08:50', '09:35'], ['09:50', '10:35'], ['10:40', '11:25'],
  ['11:40', '12:25'], ['12:30', '13:15'], ['14:00', '14:45'], ['14:50', '15:35'],
];

function genSchedule(subjects: Subject[]): Lesson[] {
  const lessons: Lesson[] = [];
  for (let day = 1; day <= 5; day++) {
    const slots = 5 + Math.floor(Math.random() * 2);
    const order = [...subjects].sort(() => Math.random() - 0.5).slice(0, slots);
    for (let i = 0; i < slots; i++) {
      const subj = order[i];
      const [start, end] = TIMES[i];
      lessons.push({
        id: uid(),
        subjectId: subj.id,
        weekday: day as Weekday,
        start,
        end,
        room: subj.room,
        weekParity: 'ALL',
      });
    }
  }
  return lessons;
}

function genTasks(subjects: Subject[]): AppTask[] {
  const out: AppTask[] = [];
  const titles = ['Aufgabenheft S. 42', 'Vokabeln lernen', 'Lesetext zusammenfassen', 'Übungen 1-5', 'Referat vorbereiten', 'Karteikarten erstellen'];
  for (let i = 0; i < 8; i++) {
    const subj = pick(subjects);
    out.push({
      id: uid(),
      title: `${pick(titles)}`,
      subjectId: subj.id,
      kind: 'hausaufgabe',
      dueDate: daysFromNow(i - 1, 8),
      done: i < 2,
      doneAt: i < 2 ? daysAgo(1) : undefined,
      priority: (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3,
      createdAt: daysAgo(3 + i),
    });
  }
  out.push({ id: uid(), title: 'Schulaufgabe Mathe', kind: 'schulaufgabe', subjectId: subjects.find(s => s.name === 'Mathematik')?.id, dueDate: daysFromNow(9, 8), done: false, priority: 3, createdAt: daysAgo(5) });
  out.push({ id: uid(), title: 'Vokabeltest Latein', kind: 'test', subjectId: subjects.find(s => s.name === 'Latein')?.id, dueDate: daysFromNow(2, 8), done: false, priority: 2, createdAt: daysAgo(2) });
  out.push({ id: uid(), title: 'Bibliotheksausweis abholen', kind: 'todo', dueDate: daysFromNow(4, 14), done: false, priority: 1, createdAt: daysAgo(1) });
  return out;
}

export async function installDemo() {
  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings, db.schoolYears], async () => {
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();
    await db.schoolYears.clear();

    // Default Schuljahr für Demo
    const yearId = uid();
    const now = new Date();
    const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    await db.schoolYears.add({
      id: yearId,
      name: `${y}/${String(y + 1).slice(2)}`,
      startDate: new Date(y, 8, 1).getTime(),
      active: true,
      createdAt: Date.now(),
    });

    const subjects: Subject[] = SUBJECTS_DEMO.map(s => ({ ...s, id: uid(), createdAt: Date.now(), schoolYearId: yearId }));
    await db.subjects.bulkAdd(subjects);

    const allGrades: Grade[] = [];
    for (const s of subjects) allGrades.push(...genGradesFor(s).map(g => ({ ...g, schoolYearId: yearId })));
    await db.grades.bulkAdd(allGrades);

    const lessons = genSchedule(subjects).map(l => ({ ...l, schoolYearId: yearId }));
    await db.lessons.bulkAdd(lessons);

    const tasks = genTasks(subjects).map(t => ({ ...t, schoolYearId: yearId }));
    await db.tasks.bulkAdd(tasks);

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      id: 'app',
      name: 'Demo-Schüler',
      system: 'bayern',
      onboarded: true,
      demo: true,
    };
    await db.settings.put(settings);
  });
}

// ─── Oberstufe-Demo (Bayern G9, Q-Phase) ──────────────────────────────────

/** Typische Kurse der bayerischen Q-Phase + ein Zielschnitt in Punkten (0–15). */
const OBERSTUFE_SUBJECTS: Array<Omit<Subject, 'id' | 'createdAt'> & { targetPoints: number }> = [
  { name: 'Deutsch',            short: 'D',   color: '#ec4899', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Herr Vogel',  room: 'A112', targetPoints: 10 },
  { name: 'Mathematik',         short: 'M',   color: '#6366f1', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Bauer',  room: 'B204', targetPoints: 9 },
  { name: 'Englisch',           short: 'E',   color: '#06b6d4', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Hofer',  room: 'A203', targetPoints: 12 },
  { name: 'Biologie',           short: 'Bi',  color: '#10b981', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Berg',   room: 'C202', targetPoints: 11 },
  { name: 'Geschichte + Sozialkunde', short: 'G+Sk', color: '#f59e0b', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Herr Mayer', room: 'A305', targetPoints: 10 },
  { name: 'Wirtschaft und Recht', short: 'WR', color: '#84cc16', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Albers', room: 'A301', targetPoints: 9 },
  { name: 'Geographie',         short: 'Geo', color: '#0ea5e9', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Herr Frank',  room: 'A302', targetPoints: 11 },
  { name: 'Religion',           short: 'Rel', color: '#a855f7', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Scommer', room: 'A108', targetPoints: 13 },
  { name: 'Sport',              short: 'Sp',  color: '#f97316', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Lang',   room: 'Halle', targetPoints: 13 },
  { name: 'W-Seminar Astrophysik', short: 'W',  color: '#3b82f6', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Frau Roth', room: 'C101', targetPoints: 11 },
  { name: 'P-Seminar Berufsorientierung', short: 'P', color: '#14b8a6', category: 'hauptfach-1zu1', system: 'oberstufe', teacher: 'Herr Klein', room: 'C103', targetPoints: 12 },
];

/** Ungefähre Tage-vor-heute-Basis je Ausbildungsabschnitt (12/1 … 13/2). */
const TERM_BASE_DAYS_AGO = [560, 400, 220, 60];

function genOberstufeGradesFor(subject: Subject, targetPoints: number): Grade[] {
  const grades: Grade[] = [];
  // Pro Halbjahr (1–4): 1 Klausur (großer LN) + 2 kleine LN (mündlich/sonstige).
  for (let term = 1; term <= 4; term++) {
    const base = TERM_BASE_DAYS_AGO[term - 1];
    const plan: Array<{ kind: GradeKind; title: string }> = [
      { kind: 'klausur',   title: 'Klausur' },
      { kind: 'muendlich', title: 'Mündliche Note' },
      { kind: 'sonstige',  title: 'Mitarbeit' },
    ];
    plan.forEach((p, i) => {
      const noisy = targetPoints + (Math.random() - 0.45) * 4;
      const v = Math.max(0, Math.min(15, Math.round(noisy)));
      grades.push({
        id: uid(),
        subjectId: subject.id,
        value: v,
        kind: p.kind,
        title: p.title,
        date: daysAgo(base - i * 20 + Math.floor(Math.random() * 6)),
        weight: 1,
        term,
      });
    });
  }
  return grades;
}

export async function installOberstufeDemo() {
  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings, db.schoolYears], async () => {
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();
    await db.schoolYears.clear();

    // Oberstufen-Schuljahr (Q-Phase 12/13). Beginn ~2 Jahre zurück.
    const yearId = uid();
    const startYear = new Date().getFullYear() - 2;
    const subjects: Subject[] = OBERSTUFE_SUBJECTS.map(({ targetPoints, ...s }) => {
      void targetPoints;
      return { ...s, id: uid(), createdAt: Date.now(), schoolYearId: yearId };
    });

    // Abitur-Demo: 5 Abiturfächer mit Punkten nahe dem Zielschnitt vorbelegen.
    const examNames = ['Deutsch', 'Mathematik', 'Englisch', 'Biologie', 'Geschichte + Sozialkunde'];
    const examSubjectIds: string[] = [];
    const examPoints: Record<string, number> = {};
    for (const name of examNames) {
      const subj = subjects.find(s => s.name === name);
      const tgt = OBERSTUFE_SUBJECTS.find(o => o.name === name)?.targetPoints ?? 10;
      if (subj) { examSubjectIds.push(subj.id); examPoints[subj.id] = tgt; }
    }

    await db.schoolYears.add({
      id: yearId,
      name: 'Oberstufe (Demo)',
      startDate: new Date(startYear, 8, 1).getTime(),
      active: true,
      createdAt: Date.now(),
      oberstufe: true,
      oberstufeJahrgaenge: [12, 13],
      abitur: { examSubjectIds, examPoints, fullSubjectIds: [], struckKeys: [] },
    });

    await db.subjects.bulkAdd(subjects);

    const allGrades: Grade[] = [];
    subjects.forEach((s, idx) => {
      const target = OBERSTUFE_SUBJECTS[idx].targetPoints;
      allGrades.push(...genOberstufeGradesFor(s, target).map(g => ({ ...g, schoolYearId: yearId })));
    });
    await db.grades.bulkAdd(allGrades);

    const lessons = genSchedule(subjects).map(l => ({ ...l, schoolYearId: yearId }));
    await db.lessons.bulkAdd(lessons);

    const tasks = genTasks(subjects).map(t => ({ ...t, schoolYearId: yearId }));
    await db.tasks.bulkAdd(tasks);

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      id: 'app',
      name: 'Demo-Oberstufe',
      classLevel: '12',
      system: 'oberstufe',
      onboarded: true,
      demo: true,
    };
    await db.settings.put(settings);
  });
  // Aktives Halbjahr auf 12/1 setzen (sauberer Startzustand).
  try { localStorage.setItem('notenapp.activeTerm', JSON.stringify({})); } catch { /* ignore */ }
}

export async function resetAll() {
  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings, db.schoolYears], async () => {
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();
    await db.schoolYears.clear();
    await db.settings.clear();
  });
}
