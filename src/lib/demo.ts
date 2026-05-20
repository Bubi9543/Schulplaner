import { db, uid } from './db';
import { defaultWeight } from './grading';
import { DEFAULT_GRADING_CONFIG, DEFAULT_SETTINGS } from '@/types';
import type { Subject, Grade, AppTask, Lesson, AppSettings, Weekday, GradeKind } from '@/types';

const SUBJECTS_DEMO: Array<Omit<Subject, 'id' | 'createdAt'>> = [
  { name: 'Mathematik', short: 'M', color: '#6366f1', category: 'haupt', system: 'bayern', teacher: 'Frau Bauer', room: 'B204', targetAverage: 2.5 },
  { name: 'Deutsch', short: 'D', color: '#ec4899', category: 'haupt', system: 'bayern', teacher: 'Herr Vogel', room: 'A112', targetAverage: 2.5 },
  { name: 'Englisch', short: 'E', color: '#06b6d4', category: 'haupt', system: 'bayern', teacher: 'Frau Hofer', room: 'A203', targetAverage: 2.0 },
  { name: 'Latein', short: 'L', color: '#a855f7', category: 'haupt', system: 'bayern', teacher: 'Herr Stein', room: 'A210', targetAverage: 2.5 },
  { name: 'Physik', short: 'Ph', color: '#3b82f6', category: 'neben', system: 'bayern', teacher: 'Frau Roth', room: 'C101' },
  { name: 'Chemie', short: 'Ch', color: '#14b8a6', category: 'neben', system: 'bayern', teacher: 'Herr Klein', room: 'C103' },
  { name: 'Biologie', short: 'Bi', color: '#10b981', category: 'neben', system: 'bayern', teacher: 'Frau Berg', room: 'C202' },
  { name: 'Geschichte', short: 'G', color: '#f59e0b', category: 'neben', system: 'bayern', teacher: 'Herr Mayer', room: 'A305' },
  { name: 'Geographie', short: 'Geo', color: '#84cc16', category: 'neben', system: 'bayern', teacher: 'Frau Albers', room: 'A301' },
  { name: 'Kunst', short: 'Ku', color: '#f43f5e', category: 'neben', system: 'bayern', teacher: 'Herr Eder', room: 'K1' },
  { name: 'Sport', short: 'Sp', color: '#f97316', category: 'neben', system: 'bayern', teacher: 'Frau Lang', room: 'Halle' },
  { name: 'Musik', short: 'Mu', color: '#8b5cf6', category: 'neben', system: 'bayern', teacher: 'Herr Wolf', room: 'Mu1' },
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
  const count = subject.category === 'haupt' ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
  const grades: Grade[] = [];
  const kinds = subject.category === 'haupt'
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
  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings], async () => {
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();

    const subjects: Subject[] = SUBJECTS_DEMO.map(s => ({ ...s, id: uid(), createdAt: Date.now() }));
    await db.subjects.bulkAdd(subjects);

    const allGrades: Grade[] = [];
    for (const s of subjects) allGrades.push(...genGradesFor(s));
    await db.grades.bulkAdd(allGrades);

    const lessons = genSchedule(subjects);
    await db.lessons.bulkAdd(lessons);

    const tasks = genTasks(subjects);
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

export async function resetAll() {
  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings], async () => {
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();
    await db.settings.clear();
  });
}
