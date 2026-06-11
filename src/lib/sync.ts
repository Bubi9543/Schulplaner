import { supabase } from './supabase';
import { db, type SyncQueueItem } from './db';
import { mergeByUpdatedAt, type Syncable } from './syncMerge';
import type { Table } from 'dexie';
import type { AppSettings } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SyncTable = 'subjects' | 'grades' | 'tasks' | 'lessons' | 'photos' | 'school_years' | 'focus_sessions' | 'deck_folders' | 'decks' | 'card_topics' | 'flashcards';

const TABLES: SyncTable[] = ['subjects', 'grades', 'tasks', 'lessons', 'photos', 'school_years', 'focus_sessions', 'deck_folders', 'decks', 'card_topics', 'flashcards'];

function row(id: string, userId: string, data: unknown) {
  return { id, user_id: userId, data, updated_at: new Date().toISOString() };
}

export async function uploadAll(userId: string): Promise<void> {
  if (!supabase) return;
  const [subjects, grades, tasks, lessons, photos, schoolYears, focusSessions, deckFolders, decks, cardTopics, flashcards, settings] = await Promise.all([
    db.subjects.toArray(),
    db.grades.toArray(),
    db.tasks.toArray(),
    db.lessons.toArray(),
    db.photos.toArray(),
    db.schoolYears.toArray(),
    db.focusSessions.toArray(),
    db.deckFolders.toArray(),
    db.decks.toArray(),
    db.cardTopics.toArray(),
    db.flashcards.toArray(),
    db.settings.get('app'),
  ]);

  await Promise.all([
    subjects.length && supabase.from('subjects').upsert(subjects.map(s => row(s.id, userId, s))),
    grades.length && supabase.from('grades').upsert(grades.map(g => row(g.id, userId, g))),
    tasks.length && supabase.from('tasks').upsert(tasks.map(t => row(t.id, userId, t))),
    lessons.length && supabase.from('lessons').upsert(lessons.map(l => row(l.id, userId, l))),
    photos.length && supabase.from('photos').upsert(photos.map(p => row(p.id, userId, p))),
    schoolYears.length && supabase.from('school_years').upsert(schoolYears.map(y => row(y.id, userId, y))),
    focusSessions.length && supabase.from('focus_sessions').upsert(focusSessions.map(f => row(f.id, userId, f))),
    deckFolders.length && supabase.from('deck_folders').upsert(deckFolders.map(f => row(f.id, userId, f))),
    decks.length && supabase.from('decks').upsert(decks.map(d => row(d.id, userId, d))),
    cardTopics.length && supabase.from('card_topics').upsert(cardTopics.map(t => row(t.id, userId, t))),
    flashcards.length && supabase.from('flashcards').upsert(flashcards.map(c => row(c.id, userId, c))),
    settings && supabase.from('user_settings').upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() }),
  ]);
}

/** Zuordnung Cloud-Tabellenname → lokale Dexie-Tabelle (nur synchronisierte Daten). */
function syncedTableSpecs(): { name: SyncTable; table: Table<Syncable, string> }[] {
  const t = (x: unknown) => x as Table<Syncable, string>;
  return [
    { name: 'subjects', table: t(db.subjects) },
    { name: 'grades', table: t(db.grades) },
    { name: 'tasks', table: t(db.tasks) },
    { name: 'lessons', table: t(db.lessons) },
    { name: 'photos', table: t(db.photos) },
    { name: 'school_years', table: t(db.schoolYears) },
    { name: 'focus_sessions', table: t(db.focusSessions) },
    { name: 'deck_folders', table: t(db.deckFolders) },
    { name: 'decks', table: t(db.decks) },
    { name: 'card_topics', table: t(db.cardTopics) },
    { name: 'flashcards', table: t(db.flashcards) },
  ];
}

/**
 * Führt eine einzelne Tabelle lokal ⇄ Cloud zusammen („neuester gewinnt").
 * Gibt die Anzahl der Cloud-Einträge zurück (für die „Daten gefunden?"-Anzeige).
 */
async function reconcileTable(name: SyncTable, table: Table<Syncable, string>, userId: string): Promise<number> {
  if (!supabase) return 0;
  const [cloudRes, localRows] = await Promise.all([
    supabase.from(name).select('data').eq('user_id', userId),
    table.toArray(),
  ]);
  if (cloudRes.error) {
    // Cloud-Abruf fehlgeschlagen → lokale Daten NICHT anfassen (kein Datenverlust).
    console.warn('sync read error', name, cloudRes.error.message);
    return 0;
  }
  const cloud = (cloudRes.data ?? []).map(r => (r as { data: Syncable }).data);
  const { toUpload, toApplyLocal } = mergeByUpdatedAt(localRows, cloud);

  // Cloud-Gewinner lokal übernehmen (lokale Gewinner liegen schon in der DB).
  if (toApplyLocal.length) await table.bulkPut(toApplyLocal);

  // Lokale Gewinner hochladen; klappt das nicht, für später merken.
  if (toUpload.length) {
    try {
      const { error } = await supabase.from(name).upsert(toUpload.map(x => row(x.id, userId, x)));
      if (error) throw new Error(error.message);
    } catch (e) {
      console.warn('sync upload error', name, e);
      for (const x of toUpload) {
        await enqueue({ key: queueKey(name, x.id), table: name, rowId: x.id, op: 'upsert', data: x, queuedAt: Date.now() });
      }
    }
  }
  return cloud.length;
}

/**
 * Führt lokalen und Cloud-Stand zusammen, statt eine Seite blind zu
 * überschreiben. Pro Eintrag gewinnt die neuere Version (Zeitstempel).
 * Ersetzt das frühere „erst alles hoch, dann alles runter".
 *
 * Gibt true zurück, wenn in der Cloud überhaupt Daten lagen.
 */
export async function syncMergeAll(userId: string): Promise<boolean> {
  if (!supabase) return false;

  let cloudCount = 0;
  for (const spec of syncedTableSpecs()) {
    cloudCount += await reconcileTable(spec.name, spec.table, userId);
  }

  // Einstellungen (ein einzelner Datensatz): lokale Einstellungen behalten und
  // hochladen; nur wenn es lokal keine gibt, die aus der Cloud übernehmen.
  const cloudSettingsRes = await supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle();
  const cloudSettings = (cloudSettingsRes.data?.data as AppSettings | undefined) ?? null;
  const localSettings = await db.settings.get('app');
  if (localSettings) {
    await supabase.from('user_settings').upsert({ user_id: userId, data: localSettings, updated_at: new Date().toISOString() });
  } else if (cloudSettings) {
    await db.settings.put({ ...cloudSettings, id: 'app' });
  }
  if (cloudSettings) cloudCount += 1;

  return cloudCount > 0;
}

// ─── Offline-Warteschlange ──────────────────────────────────────────────
// Fehlgeschlagene Uploads/Löschungen werden gemerkt und später wiederholt,
// damit z. B. Schul-WLAN-Aussetzer keine Änderungen verschlucken.

function queueKey(table: string, rowId: string): string {
  return `${table}|${rowId}`;
}

async function enqueue(item: SyncQueueItem): Promise<void> {
  try {
    // put() ersetzt eine evtl. ältere wartende Aktion für denselben Datensatz.
    await db.syncQueue.put(item);
  } catch (e) {
    console.warn('queue write failed', e);
  }
}

/**
 * Versucht, alle gemerkten Sync-Vorgänge erneut auszuführen. Bricht beim ersten
 * Fehler ab (vermutlich wieder offline) – die restlichen bleiben für später.
 */
export async function flushSyncQueue(userId: string): Promise<void> {
  if (!supabase) return;
  const items = await db.syncQueue.orderBy('queuedAt').toArray();
  for (const item of items) {
    try {
      const res = item.op === 'delete'
        ? await supabase.from(item.table as SyncTable).delete().eq('id', item.rowId)
        : await supabase.from(item.table as SyncTable).upsert(row(item.rowId, userId, item.data));
      if (res.error) throw new Error(res.error.message);
      await db.syncQueue.delete(item.key);
    } catch (e) {
      console.warn('queue flush stopped at', item.table, e);
      break;
    }
  }
}

export async function syncRow(table: SyncTable, id: string, data: unknown, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from(table).upsert(row(id, userId, data));
    if (error) throw new Error(error.message);
    await db.syncQueue.delete(queueKey(table, id));
  } catch (e) {
    console.warn('sync error', table, e);
    await enqueue({ key: queueKey(table, id), table, rowId: id, op: 'upsert', data, queuedAt: Date.now() });
  }
}

export async function syncSettings(data: AppSettings, userId: string): Promise<void> {
  if (!supabase) return;
  supabase.from('user_settings').upsert({ user_id: userId, data, updated_at: new Date().toISOString() }).then(({ error }) => {
    if (error) console.warn('sync settings error', error.message);
  });
}

export async function deleteRow(table: SyncTable, id: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    await db.syncQueue.delete(queueKey(table, id));
  } catch (e) {
    console.warn('sync delete error', table, e);
    await enqueue({ key: queueKey(table, id), table, rowId: id, op: 'delete', queuedAt: Date.now() });
  }
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
