import { supabase } from './supabase';

/**
 * Kalender-Abonnement (.ics-Feed) – Token-Verwaltung.
 *
 * Pro User und Feed-Art existiert höchstens ein aktives Token. Mit dem Token
 * baut die App eine öffentlich abrufbare URL zur Edge Function `calendar`
 * zusammen, die dann den passenden iCal-Feed des Users ausliefert
 * (Service-Role intern). Die Feed-Art (`kind`) ist im Token hinterlegt –
 * die Edge Function entscheidet daran, ob sie den Stundenplan oder die Tests
 * ausliefert.
 *
 * `Neu erstellen` ersetzt den bestehenden Token derselben Art (alter Link
 * wird ungültig). Stundenplan- und Test-Feed haben getrennte Tokens.
 */

/** Welche Daten der Feed ausliefert. */
export type CalendarFeedKind = 'schedule' | 'exams';

export interface CalendarToken {
  token: string;
  userId: string;
  kind: CalendarFeedKind;
  label?: string;
  createdAt: number;
  lastAccessedAt: number | null;
}

interface TokenRow {
  token: string;
  user_id: string;
  kind: string | null;
  label: string | null;
  created_at: string;
  last_accessed_at: string | null;
}

function toCalendarToken(row: TokenRow): CalendarToken {
  return {
    token: row.token,
    userId: row.user_id,
    kind: (row.kind as CalendarFeedKind) ?? 'schedule',
    label: row.label ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at).getTime() : null,
  };
}

const TOKEN_COLS = 'token, user_id, kind, label, created_at, last_accessed_at';

/** 32-Zeichen URL-safer Token aus 24 Byte Zufall. */
function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Aktiven Token des Users für eine Feed-Art laden (oder null). */
export async function getActiveCalendarToken(kind: CalendarFeedKind = 'schedule'): Promise<CalendarToken | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('calendar_tokens')
    .select(TOKEN_COLS)
    .eq('user_id', user.id)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toCalendarToken(data as TokenRow) : null;
}

/**
 * Neuen Token einer Feed-Art erstellen. Bestehende Tokens derselben Art
 * werden vorher gelöscht (alte Links dieser Art werden ungültig). Tokens
 * anderer Arten (z.B. Stundenplan) bleiben unberührt.
 */
export async function createCalendarToken(kind: CalendarFeedKind = 'schedule', label?: string): Promise<CalendarToken> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht eingerichtet.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bitte erst in den Einstellungen anmelden.');

  // Alte Tokens derselben Art entsorgen.
  await supabase.from('calendar_tokens').delete().eq('user_id', user.id).eq('kind', kind);

  // Neuen erzeugen – Retry, falls (extrem unwahrscheinlich) Kollision.
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = generateToken();
    const row = {
      token,
      user_id: user.id,
      kind,
      label: label ?? null,
    };
    const { data, error } = await supabase
      .from('calendar_tokens')
      .insert(row)
      .select(TOKEN_COLS)
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

/** Tokens des Users einer Feed-Art löschen. */
export async function revokeCalendarTokens(kind: CalendarFeedKind = 'schedule'): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('calendar_tokens').delete().eq('user_id', user.id).eq('kind', kind);
}

/**
 * Baut die öffentliche HTTPS-URL der Edge Function für diesen Token.
 * Beispiel: https://abc.supabase.co/functions/v1/calendar/<token>.ics
 *
 * Welche Daten ausgeliefert werden, entscheidet die Function anhand der im
 * Token gespeicherten Art – der Dateiname dient nur der Anzeige im Kalender
 * (z.B. `stundenplan.ics` vs. `tests.ics`).
 */
export function buildCalendarFeedUrl(token: string, fileName = 'stundenplan'): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return '';
  const clean = base.replace(/\/+$/, '');
  return `${clean}/functions/v1/calendar/${token}.ics?name=${encodeURIComponent(fileName)}`;
}

/** Variante mit `webcal://`-Schema – iOS/macOS Kalender öffnet das nativ. */
export function buildCalendarWebcalUrl(token: string, fileName = 'stundenplan'): string {
  return buildCalendarFeedUrl(token, fileName).replace(/^https?:\/\//i, 'webcal://');
}

/** Direktlink, der den User in Google Calendar zum „Andere Kalender hinzufügen" schickt. */
export function buildGoogleCalendarAddUrl(token: string, fileName = 'stundenplan'): string {
  const feed = buildCalendarFeedUrl(token, fileName);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}
