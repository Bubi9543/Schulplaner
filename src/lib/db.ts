import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Subject, Grade, AppTask, Lesson, AppSettings, Photo, SchoolYear, SchoolHoliday } from '@/types';

export class NotenDB extends Dexie {
  subjects!: Table<Subject, string>;
  grades!: Table<Grade, string>;
  tasks!: Table<AppTask, string>;
  lessons!: Table<Lesson, string>;
  settings!: Table<AppSettings, string>;
  photos!: Table<Photo, string>;
  schoolYears!: Table<SchoolYear, string>;
  holidays!: Table<SchoolHoliday, string>;

  constructor() {
    super('notenapp');
    this.version(1).stores({
      subjects: 'id, name, system, category, createdAt',
      grades: 'id, subjectId, date, kind, isPending',
      tasks: 'id, subjectId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, weekday, start',
      settings: 'id',
    });

    this.version(2).stores({
      subjects: 'id, name, system, category, createdAt',
      grades: 'id, subjectId, date, kind, isPending',
      tasks: 'id, subjectId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, weekday, start',
      settings: 'id',
    }).upgrade(async tx => {
      const grades = tx.table<Grade>('grades');
      const subjects = tx.table<Subject>('subjects');
      const subjList = await subjects.toArray();
      const bayernSubjectIds = new Set(subjList.filter(s => s.system === 'bayern').map(s => s.id));
      await grades.toCollection().modify(g => {
        if (bayernSubjectIds.has(g.subjectId) && !g.isPending) {
          const rounded = Math.round(g.value);
          if (rounded !== g.value) g.value = Math.max(1, Math.min(6, rounded));
        }
      });
    });

    this.version(3).stores({
      subjects: 'id, name, system, category, createdAt',
      grades: 'id, subjectId, date, kind, isPending',
      tasks: 'id, subjectId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, weekday, start',
      settings: 'id',
      photos: 'id, refId, refType, createdAt',
    });

    this.version(4).stores({
      subjects: 'id, name, system, category, createdAt',
      grades: 'id, subjectId, date, kind, isPending',
      tasks: 'id, subjectId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, weekday, start',
      settings: 'id',
      photos: 'id, refId, refType, createdAt',
      schoolYears: 'id, active, startDate, createdAt',
    });

    this.version(5).stores({
      subjects: 'id, name, system, category, schoolYearId, createdAt',
      grades: 'id, subjectId, schoolYearId, date, kind, isPending',
      tasks: 'id, subjectId, schoolYearId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, schoolYearId, weekday, start',
      settings: 'id',
      photos: 'id, refId, refType, createdAt',
      schoolYears: 'id, active, startDate, createdAt',
    });

    this.version(6).stores({
      subjects: 'id, name, system, category, schoolYearId, createdAt',
      grades: 'id, subjectId, schoolYearId, date, kind, isPending',
      tasks: 'id, subjectId, schoolYearId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, schoolYearId, weekday, start',
      settings: 'id',
      photos: 'id, refId, refType, createdAt',
      schoolYears: 'id, active, startDate, createdAt',
      holidays: 'id, cacheKey, startDate, endDate',
    });
  }
}

export const db = new NotenDB();

export const uid = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

export async function resetDB() {
  await db.delete();
  await db.open();
}
