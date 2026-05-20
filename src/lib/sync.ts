import { supabase } from './supabase';
import { db } from './db';
import type { Subject, Grade, AppTask, Lesson, AppSettings } from '@/types';

type SyncTable = 'subjects' | 'grades' | 'tasks' | 'lessons';

function row(id: string, userId: string, data: unknown) {
  return { id, user_id: userId, data, updated_at: new Date().toISOString() };
}

export async function uploadAll(userId: string): Promise<void> {
  if (!supabase) return;
  const [subjects, grades, tasks, lessons, settings] = await Promise.all([
    db.subjects.toArray(),
    db.grades.toArray(),
    db.tasks.toArray(),
    db.lessons.toArray(),
    db.settings.get('app'),
  ]);

  await Promise.all([
    subjects.length && supabase.from('subjects').upsert(subjects.map(s => row(s.id, userId, s))),
    grades.length && supabase.from('grades').upsert(grades.map(g => row(g.id, userId, g))),
    tasks.length && supabase.from('tasks').upsert(tasks.map(t => row(t.id, userId, t))),
    lessons.length && supabase.from('lessons').upsert(lessons.map(l => row(l.id, userId, l))),
    settings && supabase.from('user_settings').upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() }),
  ]);
}

export async function downloadAll(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const [sRes, gRes, tRes, lRes, setRes] = await Promise.all([
    supabase.from('subjects').select('data').eq('user_id', userId),
    supabase.from('grades').select('data').eq('user_id', userId),
    supabase.from('tasks').select('data').eq('user_id', userId),
    supabase.from('lessons').select('data').eq('user_id', userId),
    supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
  ]);

  const subjects: Subject[] = (sRes.data ?? []).map(r => r.data);
  const grades: Grade[] = (gRes.data ?? []).map(r => r.data);
  const tasks: AppTask[] = (tRes.data ?? []).map(r => r.data);
  const lessons: Lesson[] = (lRes.data ?? []).map(r => r.data);
  const settings: AppSettings | null = setRes.data?.data ?? null;

  if (!subjects.length && !grades.length && !tasks.length && !lessons.length && !settings) {
    return false;
  }

  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.settings], async () => {
    await db.subjects.clear(); if (subjects.length) await db.subjects.bulkPut(subjects);
    await db.grades.clear(); if (grades.length) await db.grades.bulkPut(grades);
    await db.tasks.clear(); if (tasks.length) await db.tasks.bulkPut(tasks);
    await db.lessons.clear(); if (lessons.length) await db.lessons.bulkPut(lessons);
    if (settings) await db.settings.put({ ...settings, id: 'app' });
  });
  return true;
}

export async function syncRow(table: SyncTable, id: string, data: unknown, userId: string): Promise<void> {
  if (!supabase) return;
  supabase.from(table).upsert(row(id, userId, data)).then(({ error }) => {
    if (error) console.warn('sync error', table, error.message);
  });
}

export async function syncSettings(data: AppSettings, userId: string): Promise<void> {
  if (!supabase) return;
  supabase.from('user_settings').upsert({ user_id: userId, data, updated_at: new Date().toISOString() }).then(({ error }) => {
    if (error) console.warn('sync settings error', error.message);
  });
}

export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  if (!supabase) return;
  supabase.from(table).delete().eq('id', id).then(({ error }) => {
    if (error) console.warn('sync delete error', table, error.message);
  });
}
