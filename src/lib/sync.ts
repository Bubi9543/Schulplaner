import { supabase } from './supabase';
import { db } from './db';
import type { Subject, Grade, AppTask, Lesson, AppSettings, Photo, SchoolYear } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SyncTable = 'subjects' | 'grades' | 'tasks' | 'lessons' | 'photos' | 'school_years';

const TABLES: SyncTable[] = ['subjects', 'grades', 'tasks', 'lessons', 'photos', 'school_years'];

function row(id: string, userId: string, data: unknown) {
  return { id, user_id: userId, data, updated_at: new Date().toISOString() };
}

export async function uploadAll(userId: string): Promise<void> {
  if (!supabase) return;
  const [subjects, grades, tasks, lessons, photos, schoolYears, settings] = await Promise.all([
    db.subjects.toArray(),
    db.grades.toArray(),
    db.tasks.toArray(),
    db.lessons.toArray(),
    db.photos.toArray(),
    db.schoolYears.toArray(),
    db.settings.get('app'),
  ]);

  await Promise.all([
    subjects.length && supabase.from('subjects').upsert(subjects.map(s => row(s.id, userId, s))),
    grades.length && supabase.from('grades').upsert(grades.map(g => row(g.id, userId, g))),
    tasks.length && supabase.from('tasks').upsert(tasks.map(t => row(t.id, userId, t))),
    lessons.length && supabase.from('lessons').upsert(lessons.map(l => row(l.id, userId, l))),
    photos.length && supabase.from('photos').upsert(photos.map(p => row(p.id, userId, p))),
    schoolYears.length && supabase.from('school_years').upsert(schoolYears.map(y => row(y.id, userId, y))),
    settings && supabase.from('user_settings').upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() }),
  ]);
}

/**
 * Lädt Cloud-Daten und überschreibt lokale Daten komplett.
 * Gibt true zurück, wenn Cloud-Daten existieren.
 */
export async function downloadAll(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const [sRes, gRes, tRes, lRes, pRes, yRes, setRes] = await Promise.all([
    supabase.from('subjects').select('data').eq('user_id', userId),
    supabase.from('grades').select('data').eq('user_id', userId),
    supabase.from('tasks').select('data').eq('user_id', userId),
    supabase.from('lessons').select('data').eq('user_id', userId),
    supabase.from('photos').select('data').eq('user_id', userId),
    supabase.from('school_years').select('data').eq('user_id', userId),
    supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
  ]);

  const subjects: Subject[] = (sRes.data ?? []).map(r => r.data);
  const grades: Grade[] = (gRes.data ?? []).map(r => r.data);
  const tasks: AppTask[] = (tRes.data ?? []).map(r => r.data);
  const lessons: Lesson[] = (lRes.data ?? []).map(r => r.data);
  const photos: Photo[] = (pRes.data ?? []).map(r => r.data);
  const schoolYears: SchoolYear[] = (yRes.data ?? []).map(r => r.data);
  const settings: AppSettings | null = setRes.data?.data ?? null;

  if (!subjects.length && !grades.length && !tasks.length && !lessons.length && !photos.length && !schoolYears.length && !settings) {
    return false;
  }

  await db.transaction('rw', [db.subjects, db.grades, db.tasks, db.lessons, db.photos, db.schoolYears, db.settings], async () => {
    await db.subjects.clear(); if (subjects.length) await db.subjects.bulkPut(subjects);
    await db.grades.clear(); if (grades.length) await db.grades.bulkPut(grades);
    await db.tasks.clear(); if (tasks.length) await db.tasks.bulkPut(tasks);
    await db.lessons.clear(); if (lessons.length) await db.lessons.bulkPut(lessons);
    await db.photos.clear(); if (photos.length) await db.photos.bulkPut(photos);
    await db.schoolYears.clear(); if (schoolYears.length) await db.schoolYears.bulkPut(schoolYears);
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

// ─── Realtime Live-Sync ─────────────────────────────────────────────────

export interface RealtimeHandlers {
  onUpsert: (table: SyncTable, data: unknown) => void | Promise<void>;
  onDelete: (table: SyncTable, id: string) => void | Promise<void>;
  onSettings: (data: AppSettings) => void | Promise<void>;
  onStatusChange?: (status: 'connecting' | 'connected' | 'closed' | 'error') => void;
}

const channels: RealtimeChannel[] = [];

/**
 * Startet Live-Sync via Supabase Realtime. Jede Änderung an
 * subjects/grades/tasks/lessons/photos/school_years/user_settings auf dem
 * Server löst sofort den passenden Handler aus.
 */
export function startRealtime(userId: string, handlers: RealtimeHandlers): void {
  if (!supabase) return;
  stopRealtime();

  const statusCb = handlers.onStatusChange;
  statusCb?.('connecting');

  for (const table of TABLES) {
    const ch = supabase
      .channel(`sync:${table}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) void handlers.onDelete(table, id);
          } else {
            const data = (payload.new as { data?: unknown } | null)?.data;
            if (data) void handlers.onUpsert(table, data);
          }
        },
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') statusCb?.('connected');
        else if (status === 'CHANNEL_ERROR') statusCb?.('error');
        else if (status === 'CLOSED') statusCb?.('closed');
      });
    channels.push(ch);
  }

  const settingsCh = supabase
    .channel(`sync:user_settings:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
      (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown> | null }) => {
        if (payload.eventType === 'DELETE') return;
        const data = (payload.new as { data?: AppSettings } | null)?.data;
        if (data) void handlers.onSettings(data);
      },
    )
    .subscribe();
  channels.push(settingsCh);
}

export function stopRealtime(): void {
  if (!supabase) return;
  for (const ch of channels) {
    supabase.removeChannel(ch);
  }
  channels.length = 0;
}

/**
 * Löscht ALLE Cloud-Daten des eingeloggten Users:
 * - alle Rows in subjects/grades/tasks/lessons/photos/school_years/user_settings
 * - alle Storage-Objekte im "photos"-Bucket unter `{user_id}/`
 *
 * Lokale IndexedDB bleibt unangetastet (Realtime muss vorher gestoppt sein,
 * damit die DELETE-Events nicht in den Live-Sync-Handlern lokal kaskadieren).
 */
export async function deleteAllCloudData(userId: string): Promise<{ rows: number; files: number }> {
  if (!supabase) return { rows: 0, files: 0 };

  // 1) Tabellen leeren
  const tableResults = await Promise.all(
    TABLES.map(t => supabase!.from(t).delete().eq('user_id', userId).select('id')),
  );
  const settingsRes = await supabase.from('user_settings').delete().eq('user_id', userId).select('user_id');
  const rows = tableResults.reduce((acc, r) => acc + (r.data?.length ?? 0), 0) + (settingsRes.data?.length ?? 0);

  // 2) Storage-Bucket leeren (alle Dateien unter "{userId}/")
  let files = 0;
  try {
    const { data: list } = await supabase.storage.from('photos').list(userId, { limit: 1000 });
    if (list && list.length > 0) {
      const paths = list.map(f => `${userId}/${f.name}`);
      const { data: removed } = await supabase.storage.from('photos').remove(paths);
      files = removed?.length ?? 0;
    }
  } catch (e) {
    console.warn('Storage-Cleanup fehlgeschlagen (nicht kritisch):', e);
  }

  return { rows, files };
}
