import { supabase } from './supabase';

/**
 * Shortcut-API Token-Verwaltung.
 *
 * Pro User existiert höchstens ein aktives Token. Mit dem Token können Apple
 * Shortcuts (oder beliebige andere Clients) per HTTP eine neue Aufgabe in
 * Notenapp anlegen. Authentifizierung läuft über das Query-Param `?token=…`.
 */

export interface ShortcutToken {
  token: string;
  userId: string;
  label?: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface TokenRow {
  token: string;
  user_id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

function toShortcutToken(row: TokenRow): ShortcutToken {
  return {
    token: row.token,
    userId: row.user_id,
    label: row.label ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).getTime() : null,
  };
}

/** 32-Zeichen URL-safer Token aus 24 Byte Zufall. */
function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getActiveShortcutToken(): Promise<ShortcutToken | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('shortcut_tokens')
    .select('token, user_id, label, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toShortcutToken(data as TokenRow) : null;
}

export async function createShortcutToken(label?: string): Promise<ShortcutToken> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht eingerichtet.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bitte erst in den Einstellungen anmelden.');

  await supabase.from('shortcut_tokens').delete().eq('user_id', user.id);

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = generateToken();
    const row = { token, user_id: user.id, label: label ?? null };
    const { data, error } = await supabase
      .from('shortcut_tokens')
      .insert(row)
      .select('token, user_id, label, created_at, last_used_at')
      .single();
    if (!error && data) return toShortcutToken(data as TokenRow);
    if (error && error.code !== '23505') {
      throw new Error('Konnte Token nicht speichern: ' + error.message);
    }
  }
  throw new Error('Konnte keinen freien Token erzeugen – versuch es nochmal.');
}

export async function revokeShortcutTokens(): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('shortcut_tokens').delete().eq('user_id', user.id);
}

function baseUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return '';
  return base.replace(/\/+$/, '') + '/functions/v1/shortcut-api';
}

export function buildSubjectsUrl(token: string): string {
  return `${baseUrl()}/subjects?token=${encodeURIComponent(token)}`;
}

/**
 * Liefert nur die Fächernamen als JSON-Array – ideal für Apple-Shortcuts
 * (Direkt-Konsum durch „Aus Liste auswählen", kein Parsen nötig).
 */
export function buildSubjectNamesUrl(token: string): string {
  return `${baseUrl()}/subjects?format=names&token=${encodeURIComponent(token)}`;
}

export function buildTaskUrl(token: string): string {
  return `${baseUrl()}/task?token=${encodeURIComponent(token)}`;
}

export function buildPingUrl(token: string): string {
  return `${baseUrl()}/ping?token=${encodeURIComponent(token)}`;
}

/**
 * iCloud-Link des fertig gebauten Apple-Shortcuts.
 *
 * → Erstmal `null`. Sobald der Entwickler den Shortcut einmal auf seinem
 * iPhone/iPad gebaut hat (siehe README), trägt er hier den iCloud-Link ein
 * und ab dem nächsten Deploy können alle User den Shortcut mit einem Tap
 * installieren.
 *
 * Format: 'https://www.icloud.com/shortcuts/<uuid>'
 */
export const SHORTCUT_ICLOUD_URL: string | null = 'https://www.icloud.com/shortcuts/930d235b0b1c4f7a8896f52face35762';

