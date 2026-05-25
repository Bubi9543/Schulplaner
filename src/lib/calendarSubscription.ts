import { supabase } from './supabase';

/**
 * Kalender-Abonnement (.ics-Feed) – Token-Verwaltung.
 *
 * Pro User existiert höchstens ein aktives Token. Mit dem Token baut die
 * App eine öffentlich abrufbare URL zur Edge Function `calendar` zusammen,
 * die dann den iCal-Feed des Users ausliefert (Service-Role intern).
 *
 * `Neu erstellen` ersetzt den bestehenden Token (alter Link wird ungültig).
 */

export interface CalendarToken {
  token: string;
  userId: string;
  label?: string;
  createdAt: number;
  lastAccessedAt: number | null;
}

interface TokenRow {
  token: string;
  user_id: string;
  label: string | null;
  created_at: string;
  last_accessed_at: string | null;
}

function toCalendarToken(row: TokenRow): CalendarToken {
  return {
    token: row.token,
    userId: row.user_id,
    label: row.label ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : null,
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

/** Aktiven Token des Users laden (oder null). */
export async function getActiveCalendarToken(): Promise<CalendarToken | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('calendar_tokens')
    .select('token, user_id, label, created_at, last_accessed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toCalendarToken(data as TokenRow) : null;
}

/**
 * Neuen Token erstellen. Bestehende Tokens des Users werden vorher
 * gelöscht (alte Links werden damit ungültig).
 */
export async function createCalendarToken(label?: string): Promise<CalendarToken> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht eingerichtet.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bitte erst in den Einstellungen anmelden.');

  // Alte Tokens entsorgen.
  await supabase.from('calendar_tokens').delete().eq('user_id', user.id);

  // Neuen erzeugen – Retry, falls (extrem unwahrscheinlich) Kollision.
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = generateToken();
    const row = {
      token,
      user_id: user.id,
      label: label ?? null,
    };
    const { data, error } = await supabase
      .from('calendar_tokens')
      .insert(row)
      .select('token, user_id, label, created_at, last_accessed_at')
      .single();
    if (!error && data) {
      return toCalendarToken(data as TokenRow);
    }
    if (error && error.code !== '23505') {
      throw new Error('Konnte Token nicht speichern: ' + error.message);
    }
  }
  throw new Error('Konnte keinen freien Token erzeugen – versuch es nochmal.');
}

/** Alle Tokens des Users löschen. */
export async function revokeCalendarTokens(): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('calendar_tokens').delete().eq('user_id', user.id);
}

/**
 * Baut die öffentliche HTTPS-URL der Edge Function für diesen Token.
 * Beispiel: https://abc.supabase.co/functions/v1/calendar/<token>.ics
 */
export function buildCalendarFeedUrl(token: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return '';
  const clean = base.replace(/\/+$/, '');
  return `${clean}/functions/v1/calendar/${token}.ics`;
}

/** Variante mit `webcal://`-Schema – iOS/macOS Kalender öffnet das nativ. */
export function buildCalendarWebcalUrl(token: string): string {
  return buildCalendarFeedUrl(token).replace(/^https?:\/\//i, 'webcal://');
}

/** Direktlink, der den User in Google Calendar zum „Andere Kalender hinzufügen" schickt. */
export function buildGoogleCalendarAddUrl(token: string): string {
  const feed = buildCalendarFeedUrl(token);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}
