import { supabase } from './supabase';
import type { AppTask, FriendTask } from '@/types';

/**
 * Hausaufgaben-Sharing via permanentem 6-stelligem Freundecode.
 *
 * - Jeder Nutzer bekommt einmalig einen permanenten Code (in `user_profiles`).
 * - Geteilte Hausaufgaben landen in `shared_tasks`.
 * - Abonnenten holen sich die Tasks über `fetchTasksFromUser`.
 * - Codes laufen NICHT ab – sie sind für die Dauer des Accounts gültig.
 *
 * Benötigte Supabase-Tabellen: → siehe HOMEWORK_SHARING_SETUP.md
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 6;
const MAX_RETRIES = 8;

function generateCode(): string {
  const arr = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[arr[i] % ALPHABET.length];
  }
  return out;
}

export function normalizeFriendCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter(c => ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LEN);
}

export interface UserProfile {
  userId: string;
  displayName: string;
  friendCode: string;
  avatarUrl?: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string;
  friend_code: string;
  avatar_url?: string | null;
}

function toProfile(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    friendCode: row.friend_code,
    avatarUrl: row.avatar_url ?? undefined,
  };
}

/**
 * Gibt das eigene Profil zurück – legt es bei Bedarf neu an.
 * Wird beim ersten Besuch der Freunde-Seite oder beim Teilen aufgerufen.
 */
export async function getOrCreateMyProfile(displayName?: string): Promise<UserProfile> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert – bitte erst anmelden.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt – bitte erst anmelden.');

  // Vorhandenes Profil holen
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, friend_code, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    // Optional: displayName aktualisieren, falls übergeben
    if (displayName && displayName !== existing.display_name) {
      await supabase
        .from('user_profiles')
        .update({ display_name: displayName })
        .eq('user_id', user.id);
      return toProfile({ ...existing, display_name: displayName });
    }
    return toProfile(existing as ProfileRow);
  }

  // Neues Profil anlegen – Code-Kollisionen abfangen
  const name = displayName ?? user.email?.split('@')[0] ?? 'Anonym';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('user_profiles').insert({
      user_id: user.id,
      display_name: name,
      friend_code: code,
    });
    if (!error) {
      return { userId: user.id, displayName: name, friendCode: code };
    }
    if (error.code !== '23505') {
      throw new Error('Profil konnte nicht angelegt werden: ' + error.message);
    }
  }
  throw new Error('Kein freier Code gefunden – versuch es nochmal.');
}

/**
 * Sucht einen Nutzer anhand seines 6-stelligen Freundecodes.
 * Gibt null zurück, wenn der Code nicht existiert.
 */
export async function lookupByFriendCode(rawCode: string): Promise<UserProfile | null> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert.');
  const code = normalizeFriendCode(rawCode);
  if (code.length !== CODE_LEN) {
    throw new Error(`Code muss ${CODE_LEN} Zeichen lang sein.`);
  }
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, friend_code, avatar_url')
    .eq('friend_code', code)
    .maybeSingle();
  if (error) throw new Error('Fehler beim Suchen: ' + error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

/**
 * Veröffentlicht eine Aufgabe in `shared_tasks` (upsert).
 * Wird aufgerufen wenn `task.shared === true` und die Aufgabe gespeichert/aktualisiert wird.
 */
export async function publishTask(task: AppTask, subjectName?: string): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('shared_tasks').upsert({
    id: task.id,
    owner_user_id: user.id,
    title: task.title,
    description: task.description ?? null,
    subject_name: subjectName ?? null,
    kind: task.kind,
    due_date: task.dueDate ?? null,
    created_at: task.createdAt,
  }, { onConflict: 'id' });
}

/**
 * Entfernt eine Aufgabe aus `shared_tasks` (beim Löschen oder wenn sharing deaktiviert wird).
 */
export async function unpublishTask(taskId: string): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('shared_tasks').delete().eq('id', taskId).eq('owner_user_id', user.id);
}

interface SharedTaskRow {
  id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  subject_name: string | null;
  kind: string;
  due_date: number | null;
  created_at: number;
}

/**
 * Holt alle geteilten Aufgaben eines Mitschülers aus Supabase.
 * `ownerName` wird als Anzeigename ins FriendTask geschrieben.
 *
 * `friendsSince` = ms-Timestamp, seit wann die Freundschaft besteht. Es werden
 * NUR Hausaufgaben geladen, die nach diesem Zeitpunkt erstellt wurden – so
 * flutet ein neuer Freund nicht rückwirkend mit seinen alten Aufgaben.
 */
export async function fetchTasksFromUser(ownerUserId: string, ownerName: string, friendsSince = 0): Promise<FriendTask[]> {
  if (!supabase) return [];

  // Nur Tasks der letzten 60 Tage + zukünftige laden …
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  // … und niemals welche, die schon VOR Beginn der Freundschaft erstellt wurden.
  const sinceCreated = Math.floor(friendsSince);

  const { data, error } = await supabase
    .from('shared_tasks')
    .select('id, owner_user_id, title, description, subject_name, kind, due_date, created_at')
    .eq('owner_user_id', ownerUserId)
    .gte('created_at', sinceCreated)
    .or(`due_date.is.null,due_date.gte.${cutoff}`)
    .order('due_date', { ascending: true });

  if (error) {
    console.warn('fetchTasksFromUser error:', error.message);
    return [];
  }

  const now = Date.now();
  return (data as SharedTaskRow[]).map(row => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName,
    title: row.title,
    description: row.description ?? undefined,
    subjectName: row.subject_name ?? undefined,
    kind: row.kind,
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
    fetchedAt: now,
  }));
}
