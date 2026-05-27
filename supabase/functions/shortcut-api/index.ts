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
}

interface SchoolYear {
  id: string;
  name: string;
  active: boolean;
}

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

async function handleSubjects(token: string): Promise<Response> {
  const userId = await userIdFromToken(token);
  if (!userId) return errText('Invalid token', 401);
  const db = admin();
  const activeYear = await activeSchoolYearId(db, userId);
  const { data, error } = await db.from('subjects').select('data').eq('user_id', userId);
  if (error) return errText(error.message, 500);
  const subjects: Subject[] = (data ?? [])
    .map((r: { data: Subject }) => r.data)
    .filter((s) => !activeYear || !s.schoolYearId || s.schoolYearId === activeYear)
    .map((s) => ({ id: s.id, name: s.name, short: s.short, color: s.color, category: s.category }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return json(subjects);
}

interface TaskPayload {
  title?: string;
  subjectId?: string;
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

  // dueDate kann ISO-String, Datumstring oder ms-Number sein.
  let dueDate: number | undefined;
  if (body.dueDate != null && body.dueDate !== '') {
    const n = typeof body.dueDate === 'number' ? body.dueDate : Date.parse(String(body.dueDate));
    if (!Number.isFinite(n)) return errText('Invalid dueDate', 400);
    dueDate = n;
  }

  const priority = (() => {
    const p = Number(body.priority);
    if (p === 1 || p === 2 || p === 3) return p as 1 | 2 | 3;
    return 2 as const;
  })();

  const db = admin();

  // Falls subjectId angegeben: gehört das Fach dem User? (Schutz vor Cross-User)
  if (body.subjectId) {
    const { data } = await db
      .from('subjects')
      .select('id')
      .eq('user_id', userId)
      .eq('id', body.subjectId)
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
    subjectId: body.subjectId || undefined,
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
      return await handleSubjects(token);
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
