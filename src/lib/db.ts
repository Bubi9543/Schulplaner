import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Subject, Grade, AppTask, Lesson, AppSettings } from '@/types';

export class NotenDB extends Dexie {
  subjects!: Table<Subject, string>;
  grades!: Table<Grade, string>;
  tasks!: Table<AppTask, string>;
  lessons!: Table<Lesson, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('notenapp');
    this.version(1).stores({
      subjects: 'id, name, system, category, createdAt',
      grades: 'id, subjectId, date, kind, isPending',
      tasks: 'id, subjectId, dueDate, done, kind, priority, createdAt',
      lessons: 'id, subjectId, weekday, start',
      settings: 'id',
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
