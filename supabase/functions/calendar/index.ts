// Supabase Edge Function — liefert einen iCal-Feed eines Users.
//
// Aufruf:   GET https://<project>.supabase.co/functions/v1/calendar/<token>.ics
//
// Token → (user_id, kind)-Lookup in calendar_tokens. Function läuft mit
// Service-Role-Key, umgeht damit RLS. Die im Token gespeicherte Art (`kind`)
// entscheidet den Inhalt:
//   - 'schedule' → Stundenplan (subjects/lessons/school_years), siehe unten
//   - 'exams'    → angekündigte Tests/Klausuren (pending grades) als
//                  ganztägige VEVENTs, siehe buildExamICS
//
// Bauplan für die Stundenplan-VEVENTs:
//   - aktives Schuljahr bestimmt Start- und Enddatum der Wiederholung
//   - jede Lesson = ein wöchentlich wiederkehrendes VEVENT
//   - weekParity 'A'/'B' → INTERVAL=2 + passender Start-Anker
//   - Zeitzone via VTIMEZONE (Europe/Berlin, korrektes DST)
//
// Deploy:   supabase functions deploy calendar --no-verify-jwt

// @ts-ignore - Deno-only Imports werden vom React-Build nicht angefasst.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// @ts-ignore
declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (req: Request) => Promise<Response> | Response) => void };

interface Subject {
  id: string;
  name: string;
  short: string;
  color: string;
  teacher?: string;
  room?: string;
  schoolYearId?: string;
}

interface Lesson {
  id: string;
  subjectId: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  start: string; // 'HH:MM'
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
  schoolYearId?: string;
}

interface SchoolYear {
  id: string;
  name: string;
  startDate: number;
  endDate?: number;
  active: boolean;
  createdAt: number;
}

interface Grade {
  id: string;
  subjectId: string;
  kind: string;
  title?: string;
  date: number; // ms timestamp
  isPending?: boolean;
  schoolYearId?: string;
}

/** Labels der eingebauten Noten-Arten (Spiegel von src/lib/grading.ts). */
const GRADE_KIND_LABEL: Record<string, string> = {
  schulaufgabe: 'Schulaufgabe',
  stegreif: 'Stegreifaufgabe',
  muendlich: 'Mündlich',
  referat: 'Referat',
  klausur: 'Klausur',
  projekt: 'Projekt',
  sonstige: 'Sonstige',
};

interface HolidayRange { start: string; end: string } // YYYY-MM-DD (inkl.)

/** Lädt Schulferien einer Region für ein Jahr (server-side, ohne Caching). */
async function fetchHolidaysForYear(region: { country: string; subdivision?: string }, year: number): Promise<HolidayRange[]> {
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
    const raw = (await res.json()) as Array<{ startDate: string; endDate: string }>;
    return raw.map(h => ({ start: h.startDate, end: h.endDate }));
  } catch {
    return [];
  }
}

/** YYYY-MM-DD in lokaler Zeit. */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isDateInHolidays(d: Date, holidays: HolidayRange[]): boolean {
  const day = isoLocal(d);
  return holidays.some(h => h.start <= day && day <= h.end);
}

// ─── iCal helpers ────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Lokales Datum-Time im Format YYYYMMDDTHHMMSS (für DTSTART;TZID=...) */
function fmtLocal(y: number, m: number, d: number, hh: number, mm: number): string {
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

/** UTC-Stempel YYYYMMDDTHHMMSSZ (für DTSTAMP, UID-frische, UNTIL). */
function fmtUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

/** Reines Datum YYYYMMDD in lokaler Zeit (für ganztägige VEVENTs, VALUE=DATE). */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/**
 * Liefert das Date des ersten Vorkommens eines Wochentags (>= anchor),
 * lokal interpretiert. weekday: 0=So .. 6=Sa (wie JS Date.getDay()).
 */
function firstOccurrenceOnOrAfter(anchor: Date, weekday: number): Date {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** RFC 5545 erlaubt nur 75 Oktette pro Zeile. Wir falten bei 73 Zeichen. */
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(i, i + 73));
  i += 73;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 72));
    i += 72;
  }
  return out.join('\r\n');
}

function joinLines(lines: string[]): string {
  return lines.map(foldLine).join('\r\n');
}

const VTIMEZONE_BERLIN = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'X-LIC-LOCATION:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const ICAL_WEEKDAY: Record<number, string> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
};

function buildICS(opts: {
  ownerName?: string;
  ownerEmail?: string;
  schoolYear: SchoolYear | null;
  subjects: Subject[];
  lessons: Lesson[];
  holidays: HolidayRange[];
}): string {
  const { ownerName, ownerEmail, schoolYear, subjects, lessons, holidays } = opts;
  const calName = ownerName
    ? `Stundenplan – ${ownerName}`
    : ownerEmail
    ? `Stundenplan – ${ownerEmail}`
    : 'Stundenplan';
  const now = new Date();
  const dtstamp = fmtUtc(now);

  const header: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Notenapp//Schulplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE_BERLIN,
  ];

  const events: string[] = [];

  if (schoolYear && lessons.length && subjects.length) {
    const subjMap = new Map(subjects.map(s => [s.id, s]));
    const yearStart = new Date(schoolYear.startDate);
    const yearEnd = schoolYear.endDate
      ? new Date(schoolYear.endDate)
      : (() => {
          // Default: ~10 Monate nach Start
          const d = new Date(schoolYear.startDate);
          d.setMonth(d.getMonth() + 10);
          return d;
        })();

    for (const l of lessons) {
      const subj = subjMap.get(l.subjectId);
      if (!subj) continue;

      // Wochentag des Lessons (Lesson.weekday folgt JS-Konvention: 0=So..6=Sa)
      // Erstes Vorkommen ab Schuljahr-Start
      let firstDate = firstOccurrenceOnOrAfter(yearStart, l.weekday);

      // A/B-Wochen: A = gerader Wochenoffset zum Schuljahresstart, B = ungerader
      let interval = 1;
      if (l.weekParity === 'A' || l.weekParity === 'B') {
        interval = 2;
        const weekStart0 = new Date(yearStart);
        // Auf Montag der Schuljahr-Start-Woche normieren
        const dow = (weekStart0.getDay() + 6) % 7; // 0 = Mo
        weekStart0.setDate(weekStart0.getDate() - dow);
        weekStart0.setHours(0, 0, 0, 0);
        const lessonWeekStart = new Date(firstDate);
        const dow2 = (lessonWeekStart.getDay() + 6) % 7;
        lessonWeekStart.setDate(lessonWeekStart.getDate() - dow2);
        lessonWeekStart.setHours(0, 0, 0, 0);
        const weekDiff = Math.round((lessonWeekStart.getTime() - weekStart0.getTime()) / (7 * 86400000));
        const isCurrentParity = (weekDiff % 2 === 0 && l.weekParity === 'A')
                             || (weekDiff % 2 === 1 && l.weekParity === 'B');
        if (!isCurrentParity) {
          firstDate.setDate(firstDate.getDate() + 7);
        }
      }

      // Falls die erste Iteration schon nach Schuljahrende liegt → Lesson überspringen
      if (firstDate.getTime() > yearEnd.getTime()) continue;

      const [sh, sm] = l.start.split(':').map(Number);
      const [eh, em] = l.end.split(':').map(Number);
      const dtstart = fmtLocal(firstDate.getFullYear(), firstDate.getMonth() + 1, firstDate.getDate(), sh, sm);
      const dtend = fmtLocal(firstDate.getFullYear(), firstDate.getMonth() + 1, firstDate.getDate(), eh, em);

      // UNTIL muss UTC sein laut RFC – Schuljahres-Endtag, 23:59:59 UTC
      const untilDate = new Date(yearEnd);
      untilDate.setUTCHours(23, 59, 59, 0);
      const until = fmtUtc(untilDate);

      const byday = ICAL_WEEKDAY[l.weekday];
      const rrule = `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${byday};UNTIL=${until}`;

      // Ferien-Termine ausschließen: alle Vorkommen, die in Schulferien fallen,
      // als EXDATE markieren – so läuft der Stundenplan während der Ferien nicht.
      const exdates: string[] = [];
      if (holidays.length) {
        const occ = new Date(firstDate);
        while (occ.getTime() <= yearEnd.getTime()) {
          if (isDateInHolidays(occ, holidays)) {
            exdates.push(fmtLocal(occ.getFullYear(), occ.getMonth() + 1, occ.getDate(), sh, sm));
          }
          occ.setDate(occ.getDate() + 7 * interval);
        }
      }
      const exdateLine = exdates.length ? `EXDATE;TZID=Europe/Berlin:${exdates.join(',')}` : '';

      const room = l.room ?? subj.room ?? '';
      const summary = subj.name + (l.weekParity === 'A' ? ' (A)' : l.weekParity === 'B' ? ' (B)' : '');
      const description = [
        subj.teacher ? `Lehrer: ${subj.teacher}` : null,
        l.weekParity === 'A' || l.weekParity === 'B' ? `Woche ${l.weekParity}` : null,
      ].filter(Boolean).join('\\n');

      events.push(
        'BEGIN:VEVENT',
        `UID:lesson-${l.id}@notenapp`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=Europe/Berlin:${dtstart}`,
        `DTEND;TZID=Europe/Berlin:${dtend}`,
        rrule,
        exdateLine,
        `SUMMARY:${escapeText(summary)}`,
        room ? `LOCATION:${escapeText(room)}` : '',
        description ? `DESCRIPTION:${description}` : '',
        `COLOR:${subj.color}`,
        'END:VEVENT',
      );
    }
  }

  const lines = [
    ...header,
    ...events.filter(Boolean),
    'END:VCALENDAR',
  ];
  return joinLines(lines) + '\r\n';
}

/**
 * Baut den Tests-/Klausuren-Feed: jede angekündigte Prüfung (pending Grade
 * mit Datum) wird ein ganztägiges VEVENT am Prüfungstag. Keine Wiederholung,
 * keine Ferien-Logik – das sind punktuelle Termine.
 */
function buildExamICS(opts: {
  ownerName?: string;
  ownerEmail?: string;
  subjects: Subject[];
  exams: Grade[];
}): string {
  const { ownerName, ownerEmail, subjects, exams } = opts;
  const calName = ownerName
    ? `Tests – ${ownerName}`
    : ownerEmail
    ? `Tests – ${ownerEmail}`
    : 'Tests & Klausuren';
  const dtstamp = fmtUtc(new Date());
  const subjMap = new Map(subjects.map(s => [s.id, s]));

  const header: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Notenapp//Tests//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const events: string[] = [];

  for (const ex of exams) {
    if (!ex.date) continue;
    const subj = subjMap.get(ex.subjectId);
    const start = new Date(ex.date);
    if (isNaN(start.getTime())) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + 1); // DTEND ist bei VALUE=DATE exklusiv

    const kindLabel = GRADE_KIND_LABEL[ex.kind] ?? ex.kind;
    const subjName = subj?.name ?? 'Prüfung';
    const summary = ex.title?.trim()
      ? `${subjName}: ${ex.title.trim()}`
      : `${kindLabel}: ${subjName}`;
    const description = [
      `Art: ${kindLabel}`,
      subj?.teacher ? `Lehrer: ${subj.teacher}` : null,
    ].filter(Boolean).join('\\n');

    events.push(
      'BEGIN:VEVENT',
      `UID:exam-${ex.id}@notenapp`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${fmtDate(start)}`,
      `DTEND;VALUE=DATE:${fmtDate(end)}`,
      `SUMMARY:${escapeText(summary)}`,
      description ? `DESCRIPTION:${description}` : '',
      subj?.color ? `COLOR:${subj.color}` : '',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(summary)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  const lines = [
    ...header,
    ...events.filter(Boolean),
    'END:VCALENDAR',
  ];
  return joinLines(lines) + '\r\n';
}

// ─── Handler ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const token = last.replace(/\.ics$/i, '').trim();

  if (!token || token.length < 24) {
    return new Response('Token fehlt oder ist zu kurz.', { status: 400, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response('Server-Konfiguration unvollständig.', { status: 500, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('calendar_tokens')
    .select('user_id, kind')
    .eq('token', token)
    .maybeSingle();

  if (tokenErr) {
    return new Response('Lookup-Fehler: ' + tokenErr.message, { status: 500, headers: CORS_HEADERS });
  }
  if (!tokenRow) {
    return new Response('Token nicht gefunden – evtl. zurückgezogen.', { status: 404, headers: CORS_HEADERS });
  }

  const userId = tokenRow.user_id as string;
  const feedKind = (tokenRow.kind as string) === 'exams' ? 'exams' : 'schedule';

  // last_accessed_at aktualisieren (fire & forget)
  supabase
    .from('calendar_tokens')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('token', token)
    .then(() => {});

  // Gemeinsame Stammdaten: Fächer, Schuljahre, Settings. Lessons nur für den
  // Stundenplan-Feed, Grades nur für den Tests-Feed – wir holen das jeweils
  // Nötige, um keine unnötigen Reads zu machen.
  const [subjectsRes, schoolYearsRes, settingsRes, lessonsRes, gradesRes] = await Promise.all([
    supabase.from('subjects').select('data').eq('user_id', userId),
    supabase.from('school_years').select('data').eq('user_id', userId),
    supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle(),
    feedKind === 'schedule'
      ? supabase.from('lessons').select('data').eq('user_id', userId)
      : Promise.resolve({ data: [] as { data: Lesson }[] }),
    feedKind === 'exams'
      ? supabase.from('grades').select('data').eq('user_id', userId)
      : Promise.resolve({ data: [] as { data: Grade }[] }),
  ]);

  const subjectsAll = (subjectsRes.data ?? []).map((r: { data: Subject }) => r.data);
  const schoolYears = (schoolYearsRes.data ?? []).map((r: { data: SchoolYear }) => r.data);
  const settings = (settingsRes.data?.data ?? null) as { name?: string; region?: { country: string; subdivision?: string } } | null;

  const activeYear = schoolYears.find((y) => y.active) ?? schoolYears[0] ?? null;
  const subjects = activeYear
    ? subjectsAll.filter((s) => !s.schoolYearId || s.schoolYearId === activeYear.id)
    : subjectsAll;

  let body: string;
  let fileName: string;

  if (feedKind === 'exams') {
    const gradesAll = (gradesRes.data ?? []).map((r: { data: Grade }) => r.data);
    const exams = gradesAll
      .filter((g) => g.isPending && !!g.date)
      .filter((g) => !activeYear || !g.schoolYearId || g.schoolYearId === activeYear.id);
    body = buildExamICS({ ownerName: settings?.name, subjects, exams });
    fileName = 'tests';
  } else {
    const lessonsAll = (lessonsRes.data ?? []).map((r: { data: Lesson }) => r.data);
    const lessons = activeYear
      ? lessonsAll.filter((l) => !l.schoolYearId || l.schoolYearId === activeYear.id)
      : lessonsAll;

    // Schulferien für die Region laden, um Stunden während der Ferien auszublenden.
    let holidays: HolidayRange[] = [];
    if (settings?.region && activeYear) {
      const startYear = new Date(activeYear.startDate).getFullYear();
      const endYear = (activeYear.endDate ? new Date(activeYear.endDate) : new Date(activeYear.startDate)).getFullYear() + (activeYear.endDate ? 0 : 1);
      const years = new Set<number>();
      for (let y = startYear; y <= endYear; y++) years.add(y);
      const results = await Promise.all([...years].map(y => fetchHolidaysForYear(settings.region!, y)));
      holidays = results.flat();
    }

    body = buildICS({
      ownerName: settings?.name,
      schoolYear: activeYear,
      subjects,
      lessons,
      holidays,
    });
    fileName = 'stundenplan';
  }

  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${fileName}.ics"`,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
});
