import { supabase } from './supabase';
import { db } from './db';
import type { Subject, Lesson } from '@/types';

/**
 * Stundenplan-Sharing via 4-stelliger Code.
 *
 * - Generiert einen kurzen Code aus einem Alphabet ohne mehrdeutige Zeichen
 *   (kein 0/O/1/I), damit man ihn am Tisch durchgeben kann.
 * - Speichert Subjects + Lessons des aktuellen Schuljahrs als JSON-Payload
 *   in der Tabelle `schedule_shares` (siehe SUPABASE_SETUP.md).
 * - Codes laufen nach 7 Tagen automatisch ab (TTL via `expires_at`).
 * - Pro User existiert immer höchstens ein aktiver Code – ein erneuter Klick
 *   auf „Teilen" frischt den Payload und den Ablauf am bestehenden Code auf.
 */

// 32 Zeichen, keine Mehrdeutigkeiten (kein 0/O/1/I)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;
const EXPIRY_DAYS = 7;
const MAX_CODE_RETRIES = 6;

function generateCode(): string {
  const arr = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[arr[i] % ALPHABET.length];
  }
  return out;
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/O/g, '0') // user-Tipp toleranter machen ist riskant; lass O stehen aber...
    // ↑ wir tolerieren KEIN O/0-Mapping da unser Alphabet 0 ausschließt – stattdessen
    //   filtern wir alle Zeichen, die nicht im Alphabet sind, einfach raus.
    .split('')
    .filter(c => ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LEN);
}

export interface SharedSubject {
  id: string;
  name: string;
  short: string;
  color: string;
  category: Subject['category'];
  system: Subject['system'];
  teacher?: string;
  room?: string;
  createdAt: number;
}

export interface SharedLesson {
  id: string;
  subjectId: string;
  weekday: Lesson['weekday'];
  start: string;
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
}

export interface SharePayload {
  version: 1;
  ownerName?: string;
  schoolYearName?: string;
  subjects: SharedSubject[];
  lessons: SharedLesson[];
}

export interface ShareInfo {
  code: string;
  payload: SharePayload;
  ownerEmail?: string;
  ownerUserId: string;
  /** ms timestamp */
  expiresAt: number;
}

interface ShareRow {
  code: string;
  owner_user_id: string;
  owner_email: string | null;
  payload: SharePayload;
  expires_at: string;
}

function toShareInfo(row: ShareRow): ShareInfo {
  return {
    code: row.code,
    payload: row.payload,
    ownerEmail: row.owner_email ?? undefined,
    ownerUserId: row.owner_user_id,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

async function buildPayload(schoolYearId: string, ownerName?: string, schoolYearName?: string): Promise<SharePayload> {
  const [subjectsAll, lessonsAll] = await Promise.all([
    db.subjects.toArray(),
    db.lessons.toArray(),
  ]);
  const subjects = subjectsAll.filter(s => s.schoolYearId === schoolYearId);
  const subjIds = new Set(subjects.map(s => s.id));
  const lessons = lessonsAll.filter(l => subjIds.has(l.subjectId));

  return {
    version: 1,
    ownerName,
    schoolYearName,
    subjects: subjects.map(s => ({
      id: s.id,
      name: s.name,
      short: s.short,
      color: s.color,
      category: s.category,
      system: s.system,
      teacher: s.teacher,
      room: s.room,
      createdAt: s.createdAt,
    })),
    lessons: lessons.map(l => ({
      id: l.id,
      subjectId: l.subjectId,
      weekday: l.weekday,
      start: l.start,
      end: l.end,
      room: l.room,
      weekParity: l.weekParity,
    })),
  };
}

/**
 * Existiert ein aktiver Share-Code des Users, wird dessen Payload + Ablauf
 * aufgefrischt. Sonst wird ein neuer 4-stelliger Code generiert.
 */
export async function createOrRefreshShare(opts: {
  schoolYearId: string;
  ownerName?: string;
  schoolYearName?: string;
}): Promise<ShareInfo> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht eingerichtet – ohne Login geht das nicht.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bitte erst in den Einstellungen anmelden.');

  const payload = await buildPayload(opts.schoolYearId, opts.ownerName, opts.schoolYearName);
  if (payload.subjects.length === 0 || payload.lessons.length === 0) {
    throw new Error('Dein Stundenplan ist leer – leg erst Fächer und Stunden an.');
  }
  const newExpiry = new Date(Date.now() + EXPIRY_DAYS * 86400000);

  // Existiert schon ein aktiver Share? Dann nur Payload + Ablauf refreshen.
  const { data: existing } = await supabase
    .from('schedule_shares')
    .select('code, owner_user_id, owner_email, payload, expires_at')
    .eq('owner_user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('schedule_shares')
      .update({ payload, expires_at: newExpiry.toISOString() })
      .eq('code', existing.code);
    if (error) throw new Error('Konnte den Code nicht auffrischen: ' + error.message);
    return toShareInfo({
      ...existing,
      payload,
      expires_at: newExpiry.toISOString(),
    } as ShareRow);
  }

  // Neu anlegen – Code per Retry-Loop, falls Kollision.
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const code = generateCode();
    const row = {
      code,
      owner_user_id: user.id,
      owner_email: user.email ?? null,
      payload,
      expires_at: newExpiry.toISOString(),
    };
    const { error } = await supabase.from('schedule_shares').insert(row);
    if (!error) {
      return toShareInfo(row as ShareRow);
    }
    // 23505 = unique_violation (Code kollidiert) → nochmal versuchen
    if (error.code !== '23505') {
      throw new Error('Konnte den Code nicht speichern: ' + error.message);
    }
  }
  throw new Error('Es konnte kein freier Code gefunden werden – versuch es gleich nochmal.');
}

/**
 * Holt einen geteilten Stundenplan über den 4-stelligen Code.
 * Wirft, wenn der Code nicht existiert oder abgelaufen ist.
 */
export async function fetchScheduleShare(rawCode: string): Promise<ShareInfo> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht eingerichtet – ohne Login geht das nicht.');
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LEN) {
    throw new Error(`Code muss ${CODE_LEN} Zeichen lang sein (nur Buchstaben/Ziffern, ohne 0/O/1/I).`);
  }
  const { data, error } = await supabase
    .from('schedule_shares')
    .select('code, owner_user_id, owner_email, payload, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error('Fehler beim Abrufen: ' + error.message);
  if (!data) throw new Error('Code nicht gefunden – Tippfehler? Oder Code ist abgelaufen.');

  const info = toShareInfo(data as ShareRow);
  if (info.expiresAt < Date.now()) {
    throw new Error('Dieser Code ist abgelaufen – frag den Besitzer nach einem neuen.');
  }
  return info;
}

/** Eigenen Share-Code zurückziehen (alle aktiven Codes des Users löschen). */
export async function deleteOwnShares(): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('schedule_shares').delete().eq('owner_user_id', user.id);
}

// ─── Friend-basiertes Teilen (ohne Code) ────────────────────────────────────
//
// Statt eines kurzlebigen Codes wird der Stundenplan unter der eigenen user_id
// in `shared_schedules` abgelegt (eine Zeile pro Nutzer, upsert). Freunde holen
// ihn direkt über die user_id. Siehe FRIENDS_SETUP.md.

/** Baut den Payload des aktiven Schuljahrs (öffentlich, da von Friends-Page genutzt). */
export async function buildSchedulePayload(opts: {
  schoolYearId: string;
  ownerName?: string;
  schoolYearName?: string;
}): Promise<SharePayload> {
  return buildPayload(opts.schoolYearId, opts.ownerName, opts.schoolYearName);
}

/** Veröffentlicht (upsert) den eigenen Stundenplan für Freunde. */
export async function publishMySchedule(payload: SharePayload): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('shared_schedules').upsert({
    user_id: user.id,
    payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/** Zieht den eigenen geteilten Stundenplan zurück. */
export async function unpublishMySchedule(): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('shared_schedules').delete().eq('user_id', user.id);
}

/** Holt den geteilten Stundenplan eines Freundes (oder null, wenn er keinen teilt). */
export async function fetchFriendSchedule(userId: string): Promise<SharePayload | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('shared_schedules')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('fetchFriendSchedule error:', error.message);
    return null;
  }
  return data ? (data.payload as SharePayload) : null;
}

/** Liefert den aktiven Share-Code des Users zurück, oder null. */
export async function getOwnActiveShare(): Promise<ShareInfo | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('schedule_shares')
    .select('code, owner_user_id, owner_email, payload, expires_at')
    .eq('owner_user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toShareInfo(data as ShareRow) : null;
}
