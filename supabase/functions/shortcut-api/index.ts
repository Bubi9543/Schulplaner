// Supabase Edge Function — Apple-Shortcut-API für Aufgaben.
//
// Endpunkte (alle JSON, alle mit ?token=<token>):
//
//   GET  /functions/v1/shortcut-api/subjects?token=XYZ
//        → 200 [{ id, name, short, color, category }]   (nur aktives Schuljahr)
//
//   POST /functions/v1/shortcut-api/task?token=XYZ
//        body: { title, subjectId?, kind?, dueDate?, priority?, description? }
//        → 200 { ok: true, id }
//
//   GET  /functions/v1/shortcut-api/ping?token=XYZ
//        → 200 { ok: true }   (für Shortcut-Setup-Test)
//
// Auth: per Token in der Query (?token=…) – einfacher für Apple-Shortcut-
// "Get Contents of URL" als Bearer-Header. Lookup in shortcut_tokens läuft
// mit Service-Role-Key (umgeht RLS).
//
// Deploy:   supabase functions deploy shortcut-api --no-verify-jwt

// @ts-ignore - Deno-only Imports werden vom React-Build nicht angefasst.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// @ts-ignore
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Promise<Response> | Response) => void };

interface Subject {
  id: string;
  name: string;
  short?: string;
  color?: string;
  category?: string;
  schoolYearId?: string;
  position?: number;
  groupId?: string;
}

interface SchoolYear {
  id: string;
  name: string;
  active: boolean;
}

interface Lesson {
  id: string;
  subjectId: string;
  weekday: number; // 0=So .. 6=Sa (JS Date.getDay())
  start: string;   // 'HH:MM'
  end: string;
  weekParity?: 'A' | 'B' | 'ALL';
  schoolYearId?: string;
}

/** Prefix vor dem Aktuellen Fach in der Auswahl-Liste. */
const CURRENT_PREFIX = 'Aktuelles Fach: ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function errText(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

/**
 * Lockerer Datums-Parser. Akzeptiert:
 *   - ms-Number (≥ 1.000.000.000.000 = ~2001 in ms)
 *   - ISO 8601 ("2026-05-27T14:00:00")
 *   - Deutsche Schreibweise ("27.05.2026, 14:00" / "27.5.2026 14:00" / "27.05.2026")
 *   - US-Schreibweise ("5/27/2026, 2:00 PM")
 *
 * Liefert ms-Timestamp oder null.
 */
function parseLooseDate(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;

  // Versuch 1: Date.parse (kann ISO + ein paar Localized-Strings).
  const native = Date.parse(s);
  if (Number.isFinite(native)) return native;

  // Versuch 2: Deutsche Schreibweise "DD.MM.YYYY[, HH:MM[:SS]]".
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (de) {
    const [, d, m, y, hh, mm, ss] = de;
    const t = Date.UTC(+y, +m - 1, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0);
    if (Number.isFinite(t)) return t;
  }

  return null;
}

function uuid(): string {
  // RFC4122 v4
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function admin() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function userIdFromToken(token: string): Promise<string | null> {
  if (!token || token.length < 24) return null;
  const db = admin();
  const { data, error } = await db
    .from('shortcut_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  // Last-used timestamp aktualisieren (fire & forget).
  db.from('shortcut_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', token).then(() => {});
  return data.user_id as string;
}

async function activeSchoolYearId(db: ReturnType<typeof admin>, userId: string): Promise<string | null> {
  const { data } = await db.from('school_years').select('data').eq('user_id', userId);
  const years = (data ?? []).map((r: { data: SchoolYear }) => r.data);
  const act = years.find((y) => y.active);
  return act?.id ?? null;
}

async function loadActiveSubjects(userId: string): Promise<Subject[]> {
  const db = admin();
  const activeYear = await activeSchoolYearId(db, userId);
  const { data } = await db.from('subjects').select('data').eq('user_id', userId);
  return (data ?? [])
    .map((r: { data: Subject }) => r.data)
    .filter((s) => !activeYear || !s.schoolYearId || s.schoolYearId === activeYear)
    .sort((a, b) => {
      // Gleiche Logik wie in der App-Einstellung: zuerst nach position
      // (fehlende Position ans Ende), dann alphabetisch.
      const pa = a.position ?? Number.POSITIVE_INFINITY;
      const pb = b.position ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, 'de');
    });
}

/**
 * Liest die aktuelle Uhrzeit & den Wochentag in Europe/Berlin (egal wo der
 * Edge-Function-Container läuft). Wochentag: 0=Sonntag … 6=Samstag.
 */
function berlinClockState(): { weekday: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const y = +parts.year;
  const m = +parts.month;
  const d = +parts.day;
  // en-US mit hour12:false kann "24" für Mitternacht liefern.
  const hh = +parts.hour === 24 ? 0 : +parts.hour;
  const mm = +parts.minute;
  // Wochentag aus dem Datum: UTC-Konstruktor reicht (wir wollen den Wochentag-Index).
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { weekday, minutes: hh * 60 + mm };
}

/**
 * Welches Fach läuft *gerade jetzt*? Schaut in lessons, vergleicht Wochentag
 * und Uhrzeit (Europe/Berlin) mit start/end. weekParity wird ignoriert
 * (würde extra Setup-State erfordern – falls eine A-/B-Woche-Stunde gerade
 * läuft, wird sie trotzdem akzeptiert).
 */
async function currentSubjectIdForUser(userId: string): Promise<string | null> {
  const db = admin();
  const activeYear = await activeSchoolYearId(db, userId);
  const { data } = await db.from('lessons').select('data').eq('user_id', userId);
  const lessons: Lesson[] = (data ?? [])
    .map((r: { data: Lesson }) => r.data)
    .filter((l) => !activeYear || !l.schoolYearId || l.schoolYearId === activeYear);

  const { weekday, minutes } = berlinClockState();

  for (const l of lessons) {
    if (l.weekday !== weekday) continue;
    const [sh, sm] = l.start.split(':').map(Number);
    const [eh, em] = l.end.split(':').map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(eh)) continue;
    const startMin = sh * 60 + (sm || 0);
    const endMin = eh * 60 + (em || 0);
    if (minutes >= startMin && minutes < endMin) {
      return l.subjectId;
    }
  }
  return null;
}

async function handleSubjects(token: string, format: 'json' | 'names'): Promise<Response> {
  const userId = await userIdFromToken(token);
  if (!userId) return errText('Invalid token', 401);
  const subjects = await loadActiveSubjects(userId);

  if (format === 'names') {
    // Reihenfolge: erst „Aktuelles Fach: …" (falls gerade eine Stunde läuft),
    // danach die Fächer in der App-Reihenfolge (position). Der Aktuelles-Fach-
    // Eintrag ist NUR ein Komfort-Topping; das Fach steht trotzdem auch
    // unten als regulärer Eintrag, falls der User den Prefix nicht mag.
    const names = subjects.map((s) => s.name);
    const currentId = await currentSubjectIdForUser(userId);
    if (currentId) {
      const cur = subjects.find((s) => s.id === currentId);
      if (cur) names.unshift(`${CURRENT_PREFIX}${cur.name}`);
    }
    return json(names);
  }
  return json(subjects.map((s) => ({
    id: s.id, name: s.name, short: s.short, color: s.color, category: s.category,
  })));
}

interface TaskPayload {
  title?: string;
  subjectId?: string;
  /** Alternative zu subjectId: Fachname (case-insensitive Match gegen aktives Schuljahr). */
  subjectName?: string;
  kind?: string;
  dueDate?: string | number;
  priority?: number;
  description?: string;
}

async function handleCreateTask(token: string, body: TaskPayload): Promise<Response> {
  const userId = await userIdFromToken(token);
  if (!userId) return errText('Invalid token', 401);

  const title = (body.title ?? '').trim();
  if (!title) return errText('Missing title', 400);

  // dueDate kann ISO-String, ms-Number, ODER ein lokalisiertes Datum sein,
  // das Apple-Shortcuts an JSON-Bodies anhängt (z. B. "27.5.2026, 14:00" /
  // "5/27/2026, 2:00 PM"). Wir versuchen mehrere Parser nacheinander.
  let dueDate: number | undefined;
  if (body.dueDate != null && body.dueDate !== '') {
    dueDate = parseLooseDate(body.dueDate);
    if (dueDate == null) return errText('Invalid dueDate', 400);
  }

  const priority = (() => {
    const p = Number(body.priority);
    if (p === 1 || p === 2 || p === 3) return p as 1 | 2 | 3;
    return 2 as const;
  })();

  const db = admin();

  // subjectId hat Vorrang. Fallback: subjectName per case-insensitive Match
  // gegen Fächer im aktiven Schuljahr auflösen. Falls der Name mit
  // "Aktuelles Fach: …" anfängt (Shortcut-Komfort-Topping), schneiden wir
  // den Prefix ab und matchen nur gegen den eigentlichen Fachnamen.
  let resolvedSubjectId: string | undefined = body.subjectId || undefined;
  if (!resolvedSubjectId && body.subjectName) {
    let cleaned = body.subjectName.trim();
    if (cleaned.toLowerCase().startsWith(CURRENT_PREFIX.toLowerCase())) {
      cleaned = cleaned.slice(CURRENT_PREFIX.length).trim();
    }
    const all = await loadActiveSubjects(userId);
    const wanted = cleaned.toLowerCase();
    const hit = all.find((s) => s.name.trim().toLowerCase() === wanted);
    if (!hit) return errText(`Unknown subject "${cleaned}"`, 404);
    resolvedSubjectId = hit.id;
  }
  if (resolvedSubjectId) {
    // Schutz: gehört das Fach wirklich dem User?
    const { data } = await db
      .from('subjects')
      .select('id')
      .eq('user_id', userId)
      .eq('id', resolvedSubjectId)
      .maybeSingle();
    if (!data) return errText('Subject not found', 404);
  }

  const activeYear = await activeSchoolYearId(db, userId);

  const id = uuid();
  const now = Date.now();
  const task = {
    id,
    title,
    description: body.description?.trim() || undefined,
    subjectId: resolvedSubjectId,
    kind: body.kind || 'hausaufgabe',
    dueDate,
    done: false,
    priority,
    createdAt: now,
    schoolYearId: activeYear ?? undefined,
  };

  const { error } = await db.from('tasks').insert({
    id,
    user_id: userId,
    data: task,
    updated_at: new Date().toISOString(),
  });
  if (error) return errText(error.message, 500);
  return json({ ok: true, id });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.split('/').filter(Boolean);
  // Erwartet: ['functions', 'v1', 'shortcut-api', '<route>']  – oder direkt ['<route>'] beim lokalen Test.
  const route = path[path.length - 1] || '';
  const token = url.searchParams.get('token') ?? '';

  try {
    if (req.method === 'GET' && route === 'ping') {
      const userId = await userIdFromToken(token);
      if (!userId) return errText('Invalid token', 401);
      return json({ ok: true });
    }
    if (req.method === 'GET' && route === 'subjects') {
      const format = url.searchParams.get('format') === 'names' ? 'names' : 'json';
      return await handleSubjects(token, format);
    }
    if (req.method === 'POST' && route === 'task') {
      let body: TaskPayload = {};
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        return errText('Invalid JSON body', 400);
      }
      return await handleCreateTask(token, body);
    }
    return errText('Not found', 404);
  } catch (e) {
    return errText(e instanceof Error ? e.message : String(e), 500);
  }
});
