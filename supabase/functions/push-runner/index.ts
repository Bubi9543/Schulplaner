// Supabase Edge Function — Push-Notification-Runner.
//
// Wird per pg_cron alle 5 Min aufgerufen. Für jeden User mit aktiven
// Push-Subscriptions:
//   - lädt seine Settings (Notifications-Konfig)
//   - berechnet welche Events (Hausaufgaben, Klausuren, Stunden,
//     Lerndeadlines) in das jetzige Lauf-Fenster fallen
//   - sendet je Event eine Push-Notification (Web-Push-Protokoll mit VAPID)
//   - schreibt einen Dedup-Eintrag in `notification_log`, damit gleiches
//     Event nicht mehrfach gesendet wird.
//
// Deploy:   supabase functions deploy push-runner
// Trigger:  pg_cron (siehe SUPABASE_SETUP.md)

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// @ts-ignore
import webpush from 'npm:web-push@3.6.7';

// @ts-ignore
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Promise<Response> | Response) => void };

// ─── Types (Spiegel der App-Types) ─────────────────────────────────────

interface NotificationSettings {
  enabled: boolean;
  homework: { enabled: boolean; hoursBefore: number };
  exam: { enabled: boolean; daysBefore: number; hoursBefore: number };
  lessonStart: { enabled: boolean; minutesBefore: number; onlyWeekdays: boolean };
  studyDeadline: { enabled: boolean; hoursBefore: number };
  quietHours: { enabled: boolean; from: string; to: string };
}

interface AppSettings {
  name?: string;
  notifications?: NotificationSettings;
  region?: { country: string; subdivision?: string };
}

interface RawHoliday {
  startDate: string;
  endDate: string;
}

interface Lesson {
  id: string;
  subjectId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string;
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
  schoolYearId?: string;
}

interface Subject {
  id: string;
  name: string;
  short: string;
  teacher?: string;
  room?: string;
  schoolYearId?: string;
}

interface AppTask {
  id: string;
  title: string;
  subjectId?: string;
  kind: string;
  dueDate?: number;
  done: boolean;
  schoolYearId?: string;
  studyDeadline?: number;
}

interface Grade {
  id: string;
  subjectId: string;
  title?: string;
  kind: string;
  date: number;
  isPending?: boolean;
  schoolYearId?: string;
  studyDeadline?: number;
}

interface SchoolYear { id: string; active: boolean }

interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

interface NotificationEvent {
  /** Eindeutiger Key für dedup, z. B. `task-${id}-12h`. */
  key: string;
  title: string;
  body: string;
  url: string;
}

// ─── Setup ─────────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultNotificationSettings(): NotificationSettings {
  return {
    enabled: false,
    homework: { enabled: true, hoursBefore: 12 },
    exam: { enabled: true, daysBefore: 3, hoursBefore: 12 },
    lessonStart: { enabled: false, minutesBefore: 10, onlyWeekdays: true },
    studyDeadline: { enabled: true, hoursBefore: 24 },
    quietHours: { enabled: true, from: '22:00', to: '07:00' },
  };
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/** Prüft ob `now` (lokale Berlin-Zeit) in der Quiet-Hours-Range liegt. */
function isInQuietHours(now: Date, q: { enabled: boolean; from: string; to: string }): boolean {
  if (!q.enabled) return false;
  const { h: fH, m: fM } = parseHM(q.from);
  const { h: tH, m: tM } = parseHM(q.to);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fromMin = fH * 60 + fM;
  const toMin = tH * 60 + tM;
  if (fromMin === toMin) return false;
  if (fromMin < toMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  // Über Mitternacht (z. B. 22:00 - 07:00)
  return nowMin >= fromMin || nowMin < toMin;
}

/** Date in Berlin-Lokalzeit umrechnen (de-DE TZ). */
function toBerlinDate(d: Date): Date {
  // Hack: Intl-Format → Components → neues Date
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);
  // Y-M-D H:M:S in lokaler ohne TZ Info → als Date interpretieren
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

/**
 * Datum + HH:MM (Lokalzeit Berlin) → ms timestamp UTC.
 * Wir nutzen offset relativ zur aktuellen Berlin-Offset, was im
 * Standard-Schuljahresfenster ausreicht (DST stimmt jeweils).
 */
function lessonOccurrenceTs(weekday: 0|1|2|3|4|5|6, hhmm: string, reference: Date): number {
  const ref = toBerlinDate(reference);
  // ref.getDay() ist 0..6 — passt direkt.
  const refDow = ref.getDay();
  const diff = (weekday - refDow + 7) % 7;
  const occLocal = new Date(ref);
  occLocal.setDate(ref.getDate() + diff);
  const { h, m } = parseHM(hhmm);
  occLocal.setHours(h, m, 0, 0);
  if (occLocal.getTime() < ref.getTime()) {
    // Schon vorbei heute → nächste Woche
    occLocal.setDate(occLocal.getDate() + 7);
  }
  // occLocal ist als Berlin-Lokalzeit konstruiert, aber Date interpretiert
  // sie als Server-Lokalzeit (UTC in Edge Functions). Wir müssen die
  // Berlin-Offset-Differenz wieder rausrechnen.
  const offsetMin = berlinOffsetMinutes(occLocal);
  return occLocal.getTime() - offsetMin * 60_000;
}

/** Minuten-Offset von UTC zur Berlin-Zeit zum gegebenen Zeitpunkt. */
function berlinOffsetMinutes(d: Date): number {
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'shortOffset',
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  // local sieht aus wie "GMT+1" oder "GMT+2"
  const match = local.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 60;
  const sign = match[1] === '-' ? -1 : 1;
  const h = parseInt(match[2], 10);
  const m = parseInt(match[3] ?? '0', 10);
  return sign * (h * 60 + m);
}

// ─── Event-Berechnung ──────────────────────────────────────────────────────

/**
 * Liefert alle Events, die im aktuellen Run gesendet werden sollen.
 * Strategie: pro Trigger berechnen wir das Soll-Sendezeitpunkt-Fenster
 * (`triggerTs ± WINDOW_MS/2`) und prüfen, ob `now` im Fenster liegt.
 * `WINDOW_MS = 6min` ist > cron-Intervall (5min) damit nichts durchrutscht.
 * Dedup via notification_log.
 */
const WINDOW_MS = 6 * 60_000;

/** Lädt Ferien für ein Jahr in einer Region (server-side, kein Caching). */
async function fetchHolidaysForYear(region: { country: string; subdivision?: string }, year: number): Promise<Array<{ start: string; end: string }>> {
  const params = new URLSearchParams({
    countryIsoCode: region.country,
    validFrom: `${year}-01-01`,
    validTo: `${year}-12-31`,
    languageIsoCode: 'DE',
  });
  if (region.subdivision) params.set('subdivisionCode', region.subdivision);
  try {
    const res = await fetch(`https://openholidaysapi.org/SchoolHolidays?${params.toString()}`);
    if (!res.ok) return [];
    const raw = (await res.json()) as RawHoliday[];
    return raw.map(h => ({ start: h.startDate, end: h.endDate }));
  } catch {
    return [];
  }
}

function isDateInHolidays(date: Date, holidays: Array<{ start: string; end: string }>): boolean {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return holidays.some(h => h.start <= day && day <= h.end);
}

function eventsForUser(opts: {
  now: Date;
  settings: NotificationSettings;
  tasks: AppTask[];
  grades: Grade[];
  lessons: Lesson[];
  subjects: Subject[];
  activeYearId: string | null;
  holidays: Array<{ start: string; end: string }>;
}): NotificationEvent[] {
  const { now, settings, tasks, grades, lessons, subjects, activeYearId, holidays } = opts;
  const out: NotificationEvent[] = [];

  if (!settings.enabled) return out;
  const berlinNow = toBerlinDate(now);
  if (isInQuietHours(berlinNow, settings.quietHours)) return out;

  const subjMap = new Map(subjects.map(s => [s.id, s]));

  const inWindow = (triggerTs: number) =>
    Math.abs(triggerTs - now.getTime()) <= WINDOW_MS / 2 + 30_000; // +30s Toleranz

  // 1) Hausaufgaben
  if (settings.homework.enabled) {
    const hours = Math.max(0.25, settings.homework.hoursBefore);
    const offset = hours * 3600_000;
    for (const t of tasks) {
      if (t.done || !t.dueDate) continue;
      if (t.kind !== 'hausaufgabe') continue;
      const trigger = t.dueDate - offset;
      if (!inWindow(trigger)) continue;
      const subj = t.subjectId ? subjMap.get(t.subjectId) : null;
      out.push({
        key: `task-${t.id}-hw-${Math.round(hours)}h`,
        title: '📝 Hausaufgabe fällig',
        body: subj ? `${subj.name}: ${t.title}` : t.title,
        url: '/aufgaben',
      });
    }
  }

  // 2) Klausuren & Tests
  if (settings.exam.enabled) {
    const triggers: Array<{ ms: number; label: string }> = [];
    if (settings.exam.daysBefore > 0) {
      triggers.push({ ms: settings.exam.daysBefore * 86_400_000, label: `${settings.exam.daysBefore}d` });
    }
    if (settings.exam.hoursBefore > 0) {
      triggers.push({ ms: settings.exam.hoursBefore * 3600_000, label: `${settings.exam.hoursBefore}h` });
    }
    // Quellen: Pending-Grades vom Typ schulaufgabe/klausur UND Tasks Test/Schulaufgabe
    type ExamItem = { id: string; src: 'grade' | 'task'; due: number; title: string; subjectId?: string };
    const items: ExamItem[] = [];
    for (const g of grades) {
      if (!g.isPending) continue;
      if (g.kind !== 'schulaufgabe' && g.kind !== 'klausur') continue;
      items.push({ id: g.id, src: 'grade', due: g.date, title: g.title ?? 'Schulaufgabe', subjectId: g.subjectId });
    }
    for (const t of tasks) {
      if (t.done || !t.dueDate) continue;
      if (t.kind !== 'test' && t.kind !== 'schulaufgabe') continue;
      items.push({ id: t.id, src: 'task', due: t.dueDate, title: t.title, subjectId: t.subjectId });
    }
    for (const it of items) {
      for (const tr of triggers) {
        const trigger = it.due - tr.ms;
        if (!inWindow(trigger)) continue;
        const subj = it.subjectId ? subjMap.get(it.subjectId) : null;
        out.push({
          key: `${it.src}-${it.id}-exam-${tr.label}`,
          title: tr.label.endsWith('d') ? '⚠️ Klausur in Sicht' : '🎯 Klausur bald!',
          body: subj ? `${subj.name}: ${it.title} (${tr.label})` : `${it.title} (${tr.label})`,
          url: it.src === 'grade' ? '/noten' : '/aufgaben',
        });
      }
    }
  }

  // 3) Stundenbeginn
  if (settings.lessonStart.enabled) {
    const minutes = Math.max(1, settings.lessonStart.minutesBefore);
    const offset = minutes * 60_000;
    for (const l of lessons) {
      if (activeYearId && l.schoolYearId && l.schoolYearId !== activeYearId) continue;
      if (settings.lessonStart.onlyWeekdays && (l.weekday === 0 || l.weekday === 6)) continue;
      const startTs = lessonOccurrenceTs(l.weekday, l.start, now);
      const trigger = startTs - offset;
      if (!inWindow(trigger)) continue;
      // Skippe Stunden, die in Schulferien liegen.
      if (holidays.length && isDateInHolidays(toBerlinDate(new Date(startTs)), holidays)) continue;
      const subj = subjMap.get(l.subjectId);
      if (!subj) continue;
      // Dedup-Key inkl. Tagesdatum, damit nächste Woche neuer Event entsteht.
      const dayKey = new Date(startTs).toISOString().slice(0, 10);
      out.push({
        key: `lesson-${l.id}-${dayKey}`,
        title: '⏰ Gleich Unterricht',
        body: `${subj.name} in ${minutes} Min${l.room || subj.room ? ` · ${l.room ?? subj.room}` : ''}`,
        url: '/stundenplan',
      });
    }
  }

  // 4) Lerndeadlines (studyDeadline auf Task oder Grade)
  if (settings.studyDeadline.enabled) {
    const hours = Math.max(0.5, settings.studyDeadline.hoursBefore);
    const offset = hours * 3600_000;
    for (const t of tasks) {
      if (!t.studyDeadline || t.done) continue;
      const trigger = t.studyDeadline - offset;
      if (!inWindow(trigger)) continue;
      const subj = t.subjectId ? subjMap.get(t.subjectId) : null;
      out.push({
        key: `task-${t.id}-study-${Math.round(hours)}h`,
        title: '📚 Lern-Deadline',
        body: subj ? `${subj.name}: ${t.title}` : t.title,
        url: '/aufgaben',
      });
    }
    for (const g of grades) {
      if (!g.studyDeadline || !g.isPending) continue;
      const trigger = g.studyDeadline - offset;
      if (!inWindow(trigger)) continue;
      const subj = subjMap.get(g.subjectId);
      out.push({
        key: `grade-${g.id}-study-${Math.round(hours)}h`,
        title: '📚 Lern-Deadline',
        body: subj ? `${subj.name}: ${g.title ?? 'Klausur'}` : (g.title ?? 'Klausur'),
        url: '/noten',
      });
    }
  }

  return out;
}

// ─── Push-Send ─────────────────────────────────────────────────────────────

async function sendPush(sub: PushSubscriptionRow, payload: { title: string; body: string; url: string }): Promise<{ ok: boolean; gone?: boolean }> {
  try {
    await webpush.sendNotification({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }, JSON.stringify(payload));
    return { ok: true };
  } catch (e: any) {
    const status = e?.statusCode ?? e?.status;
    if (status === 404 || status === 410) {
      // Gerät abonniert nicht mehr – aufräumen.
      return { ok: false, gone: true };
    }
    console.error('Push send error', status, e?.body ?? e?.message);
    return { ok: false };
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (!supabaseUrl || !serviceKey) {
    return new Response('Server config missing', { status: 500, headers: CORS });
  }
  if (!vapidPublic || !vapidPrivate) {
    return new Response('VAPID keys missing', { status: 500, headers: CORS });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1) Alle Subscriptions pro User gruppieren.
  const { data: subsData, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth');
  if (subsErr) return new Response('Subs error: ' + subsErr.message, { status: 500, headers: CORS });
  const subs = (subsData ?? []) as PushSubscriptionRow[];
  if (subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, users: 0, sent: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const s of subs) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }

  const now = new Date();
  let totalSent = 0;
  let totalUsersWithEvents = 0;

  for (const [userId, userSubs] of subsByUser) {
    // 2) Settings + Daten dieses Users laden.
    const [setRes, taskRes, gradeRes, lessonRes, subjectRes, yearRes] = await Promise.all([
      supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
      supabase.from('tasks').select('data').eq('user_id', userId),
      supabase.from('grades').select('data').eq('user_id', userId),
      supabase.from('lessons').select('data').eq('user_id', userId),
      supabase.from('subjects').select('data').eq('user_id', userId),
      supabase.from('school_years').select('data').eq('user_id', userId),
    ]);
    const settingsRaw = (setRes.data?.data ?? {}) as AppSettings;
    const settings: NotificationSettings = settingsRaw.notifications ?? defaultNotificationSettings();
    const tasks = ((taskRes.data ?? []) as Array<{ data: AppTask }>).map(r => r.data);
    const grades = ((gradeRes.data ?? []) as Array<{ data: Grade }>).map(r => r.data);
    const lessons = ((lessonRes.data ?? []) as Array<{ data: Lesson }>).map(r => r.data);
    const subjects = ((subjectRes.data ?? []) as Array<{ data: Subject }>).map(r => r.data);
    const schoolYears = ((yearRes.data ?? []) as Array<{ data: SchoolYear }>).map(r => r.data);
    const activeYearId = schoolYears.find(y => y.active)?.id ?? null;

    // Ferien laden (nur wenn Region gesetzt + lessonStart-Notif aktiv – sonst sparen)
    let holidays: Array<{ start: string; end: string }> = [];
    if (settingsRaw.region && settings.lessonStart.enabled) {
      const year = now.getFullYear();
      const [a, b] = await Promise.all([
        fetchHolidaysForYear(settingsRaw.region, year),
        fetchHolidaysForYear(settingsRaw.region, year + 1),
      ]);
      holidays = [...a, ...b];
    }

    const events = eventsForUser({ now, settings, tasks, grades, lessons, subjects, activeYearId, holidays });
    if (events.length === 0) continue;

    // 3) Dedup gegen notification_log.
    const eventKeys = events.map(e => e.key);
    const { data: existingLogs } = await supabase
      .from('notification_log')
      .select('event_key')
      .eq('user_id', userId)
      .in('event_key', eventKeys);
    const sent = new Set((existingLogs ?? []).map(r => r.event_key as string));
    const newEvents = events.filter(e => !sent.has(e.key));
    if (newEvents.length === 0) continue;

    totalUsersWithEvents++;

    // 4) An jede Subscription des Users senden.
    for (const ev of newEvents) {
      for (const sub of userSubs) {
        const res = await sendPush(sub, { title: ev.title, body: ev.body, url: ev.url });
        if (res.gone) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        if (res.ok) totalSent++;
      }
    }

    // 5) Log einfügen, damit Events nicht erneut gehen.
    await supabase.from('notification_log').insert(
      newEvents.map(e => ({ user_id: userId, event_key: e.key })),
    );
  }

  // 6) Aufräumen: Log-Einträge älter als 30 Tage löschen, hält Tabelle klein.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await supabase.from('notification_log').delete().lt('sent_at', cutoff);

  return new Response(JSON.stringify({ ok: true, users: totalUsersWithEvents, sent: totalSent }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
