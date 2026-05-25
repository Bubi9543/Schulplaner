/**
 * Export/Import-Schema (Version 3).
 *
 * Format ist bewusst flach + selbsterklärend, damit man Datenmigration aus
 * anderen Apps mit Claude Code / ChatGPT prompten kann. Siehe IMPORT_GUIDE.md.
 */

import { db, uid } from './db';
import {
  normalizeSubjectCategory,
  DEFAULT_SETTINGS,
} from '@/types';
import type {
  AppSettings, Subject, Grade, AppTask, Lesson, SchoolYear,
  GradingSystem, SubjectCategory, GradeKind, TaskKind, Weekday,
} from '@/types';

export const EXPORT_VERSION = 3;

export interface ExportFile {
  version: number;
  exportedAt: string;
  settings: Partial<AppSettings> | null;
  schoolYears: SchoolYear[];
  subjects: Subject[];
  grades: Grade[];
  tasks: AppTask[];
  lessons: Lesson[];
}

// ─── Export ────────────────────────────────────────────────────────────────

export async function buildExport(): Promise<ExportFile> {
  const [settings, schoolYears, subjects, grades, tasks, lessons] = await Promise.all([
    db.settings.get('app'),
    db.schoolYears.toArray(),
    db.subjects.toArray(),
    db.grades.toArray(),
    db.tasks.toArray(),
    db.lessons.toArray(),
  ]);
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    schoolYears,
    subjects,
    grades,
    tasks,
    lessons,
  };
}

export function downloadExport(data: ExportFile, filename?: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `notenapp-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Import ────────────────────────────────────────────────────────────────

const VALID_SYSTEMS: GradingSystem[] = ['bayern', 'oberstufe', 'austria', 'custom'];
const VALID_KINDS: GradeKind[] = ['schulaufgabe', 'stegreif', 'muendlich', 'referat', 'klausur', 'projekt', 'sonstige'];
const VALID_TASK_KINDS: TaskKind[] = ['hausaufgabe', 'test', 'schulaufgabe', 'projekt', 'todo'];

export interface ImportResult {
  schoolYears: number;
  subjects: number;
  grades: number;
  tasks: number;
  lessons: number;
  warnings: string[];
}

class ImportError extends Error {}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}
function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function asTimestamp(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

function normalizeSystem(v: unknown): GradingSystem {
  if (typeof v === 'string' && (VALID_SYSTEMS as string[]).includes(v)) return v as GradingSystem;
  return 'bayern';
}
function normalizeKind(v: unknown): GradeKind {
  if (typeof v === 'string' && (VALID_KINDS as string[]).includes(v)) return v as GradeKind;
  return 'sonstige';
}
function normalizeTaskKind(v: unknown): TaskKind {
  if (typeof v === 'string' && (VALID_TASK_KINDS as string[]).includes(v)) return v as TaskKind;
  return 'todo';
}
function normalizeWeekday(v: unknown): Weekday {
  const n = asNumber(v, 1);
  return (Math.max(0, Math.min(6, Math.round(n))) as Weekday);
}

function parseSchoolYear(raw: unknown): SchoolYear | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    id: asString(r.id, uid()),
    name: asString(r.name, '???'),
    startDate: asTimestamp(r.startDate),
    endDate: r.endDate != null ? asTimestamp(r.endDate) : undefined,
    active: asBool(r.active, false),
    createdAt: r.createdAt != null ? asTimestamp(r.createdAt) : Date.now(),
  };
}

function parseSubject(raw: unknown, defaultYearId?: string): Subject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = asString(r.name, '');
  if (!name) return null;
  const cat: SubjectCategory = normalizeSubjectCategory(r.category);
  return {
    id: asString(r.id, uid()),
    name,
    short: asString(r.short, name.slice(0, 2)),
    color: asString(r.color, '#6366f1'),
    category: cat,
    system: normalizeSystem(r.system),
    teacher: typeof r.teacher === 'string' ? r.teacher : undefined,
    room: typeof r.room === 'string' ? r.room : undefined,
    targetAverage: typeof r.targetAverage === 'number' ? r.targetAverage : undefined,
    createdAt: r.createdAt != null ? asTimestamp(r.createdAt) : Date.now(),
    schoolYearId: asString(r.schoolYearId, defaultYearId ?? '') || undefined,
  };
}

function parseGrade(raw: unknown, subjectMap: Map<string, Subject>): Grade | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const subjectId = asString(r.subjectId, '');
  const subj = subjectMap.get(subjectId);
  if (!subj) return null;
  const value = asNumber(r.value, 0);
  const wm = r.weightMultiplier;
  return {
    id: asString(r.id, uid()),
    subjectId: subj.id,
    value,
    kind: normalizeKind(r.kind),
    title: typeof r.title === 'string' ? r.title : undefined,
    date: asTimestamp(r.date),
    weight: asNumber(r.weight, 1),
    weightMultiplier: typeof wm === 'number' && Number.isFinite(wm) && wm > 0 ? wm : undefined,
    isPending: asBool(r.isPending, false),
    schoolYearId: asString(r.schoolYearId, subj.schoolYearId ?? '') || undefined,
  };
}

function parseTask(raw: unknown, subjectMap: Map<string, Subject>, defaultYearId?: string): AppTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = asString(r.title, '');
  if (!title) return null;
  const subjId = typeof r.subjectId === 'string' ? r.subjectId : undefined;
  const subj = subjId ? subjectMap.get(subjId) : undefined;
  const prio = asNumber(r.priority, 2);
  return {
    id: asString(r.id, uid()),
    title,
    description: typeof r.description === 'string' ? r.description : undefined,
    subjectId: subj?.id,
    kind: normalizeTaskKind(r.kind),
    dueDate: r.dueDate != null ? asTimestamp(r.dueDate) : undefined,
    reminder: r.reminder != null ? asTimestamp(r.reminder) : undefined,
    done: asBool(r.done, false),
    doneAt: r.doneAt != null ? asTimestamp(r.doneAt) : undefined,
    priority: (prio === 1 || prio === 3 ? prio : 2) as 1 | 2 | 3,
    createdAt: r.createdAt != null ? asTimestamp(r.createdAt) : Date.now(),
    schoolYearId: asString(r.schoolYearId, subj?.schoolYearId ?? defaultYearId ?? '') || undefined,
  };
}

function parseLesson(raw: unknown, subjectMap: Map<string, Subject>): Lesson | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const subjectId = asString(r.subjectId, '');
  const subj = subjectMap.get(subjectId);
  if (!subj) return null;
  const wp = r.weekParity;
  return {
    id: asString(r.id, uid()),
    subjectId: subj.id,
    weekday: normalizeWeekday(r.weekday),
    start: asString(r.start, '08:00'),
    end: asString(r.end, '08:45'),
    room: typeof r.room === 'string' ? r.room : undefined,
    weekParity: wp === 'A' || wp === 'B' || wp === 'ALL' ? wp : 'ALL',
    schoolYearId: asString(r.schoolYearId, subj.schoolYearId ?? '') || undefined,
  };
}

/**
 * Importiert eine ExportFile/ähnliche Struktur. ERSETZT alle bestehenden Daten.
 * Tolerant gegenüber fehlenden Feldern - generiert sinnvolle Defaults.
 */
export async function importData(rawText: string): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new ImportError('Ungültiges JSON: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (!json || typeof json !== 'object') throw new ImportError('Wurzel-Element muss ein Objekt sein.');
  const data = json as Record<string, unknown>;

  const warnings: string[] = [];
  const version = typeof data.version === 'number' ? data.version : 0;
  if (version > EXPORT_VERSION) {
    warnings.push(`Datei-Version ${version} ist neuer als unterstützt (${EXPORT_VERSION}). Versuche trotzdem.`);
  }

  // Schuljahre einlesen
  const rawYears = Array.isArray(data.schoolYears) ? data.schoolYears : [];
  const schoolYears: SchoolYear[] = rawYears
    .map(parseSchoolYear)
    .filter((y): y is SchoolYear => y !== null);

  // Sicherstellen: mindestens ein Schuljahr (sonst Default anlegen)
  if (schoolYears.length === 0) {
    const d = new Date();
    const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    schoolYears.push({
      id: uid(),
      name: `${y}/${String(y + 1).slice(2)}`,
      startDate: new Date(y, 8, 1).getTime(),
      active: true,
      createdAt: Date.now(),
    });
    warnings.push('Kein Schuljahr in der Datei – Default-Schuljahr angelegt.');
  }
  if (!schoolYears.some(y => y.active)) {
    schoolYears[0].active = true;
  }
  const defaultYearId = schoolYears.find(y => y.active)?.id ?? schoolYears[0].id;

  // Subjects
  const rawSubjects = Array.isArray(data.subjects) ? data.subjects : [];
  const subjects: Subject[] = rawSubjects
    .map(s => parseSubject(s, defaultYearId))
    .filter((s): s is Subject => s !== null);

  // Map für Subject-Lookup
  const subjectMap = new Map(subjects.map(s => [s.id, s]));

  // Grades
  const rawGrades = Array.isArray(data.grades) ? data.grades : [];
  let skippedGrades = 0;
  const grades: Grade[] = [];
  for (const r of rawGrades) {
    const g = parseGrade(r, subjectMap);
    if (g) grades.push(g);
    else skippedGrades++;
  }
  if (skippedGrades) warnings.push(`${skippedGrades} Noten ohne passendes Fach übersprungen.`);

  // Tasks
  const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
  const tasks: AppTask[] = [];
  for (const r of rawTasks) {
    const t = parseTask(r, subjectMap, defaultYearId);
    if (t) tasks.push(t);
  }

  // Lessons
  const rawLessons = Array.isArray(data.lessons) ? data.lessons : [];
  let skippedLessons = 0;
  const lessons: Lesson[] = [];
  for (const r of rawLessons) {
    const l = parseLesson(r, subjectMap);
    if (l) lessons.push(l);
    else skippedLessons++;
  }
  if (skippedLessons) warnings.push(`${skippedLessons} Stunden ohne passendes Fach übersprungen.`);

  // Settings: wenn in Datei → übernehmen; sonst bestehende behalten (so bleibt onboarded=true).
  const existingSettings = await db.settings.get('app');
  let settings: AppSettings;
  if (data.settings && typeof data.settings === 'object') {
    settings = { ...DEFAULT_SETTINGS, ...(existingSettings ?? {}), ...(data.settings as object), id: 'app', onboarded: true } as AppSettings;
  } else if (existingSettings) {
    // Existierende Settings beibehalten - User ist schon onboarded
    settings = { ...existingSettings, onboarded: true } as AppSettings;
    warnings.push('Datei enthielt keine Settings - bestehende Einstellungen wurden beibehalten.');
  } else {
    // Frisch installiert + Datei ohne Settings: minimale Defaults setzen, damit Onboarding übersprungen wird
    settings = { ...DEFAULT_SETTINGS, id: 'app', onboarded: true, demo: false } as AppSettings;
    warnings.push('Datei enthielt keine Settings - Standardwerte wurden gesetzt.');
  }

  // Reset + Insert
  await db.transaction('rw', [db.settings, db.schoolYears, db.subjects, db.grades, db.tasks, db.lessons], async () => {
    await db.settings.clear();
    await db.schoolYears.clear();
    await db.subjects.clear();
    await db.grades.clear();
    await db.tasks.clear();
    await db.lessons.clear();
    await db.settings.put(settings);
    if (schoolYears.length) await db.schoolYears.bulkAdd(schoolYears);
    if (subjects.length) await db.subjects.bulkAdd(subjects);
    if (grades.length) await db.grades.bulkAdd(grades);
    if (tasks.length) await db.tasks.bulkAdd(tasks);
    if (lessons.length) await db.lessons.bulkAdd(lessons);
  });

  return {
    schoolYears: schoolYears.length,
    subjects: subjects.length,
    grades: grades.length,
    tasks: tasks.length,
    lessons: lessons.length,
    warnings,
  };
}

// Für die Format-Doc/Demo:
export function getExampleFile(): ExportFile {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: null,
    schoolYears: [
      { id: 'y1', name: '2025/26', startDate: new Date(2025, 8, 1).getTime(), active: true, createdAt: Date.now() },
    ],
    subjects: [
      { id: 's1', name: 'Mathematik', short: 'M', color: '#6366f1', category: 'hauptfach', system: 'bayern', createdAt: Date.now(), schoolYearId: 'y1' },
      { id: 's2', name: 'Physik', short: 'Ph', color: '#3b82f6', category: 'hauptfach-1zu1', system: 'bayern', createdAt: Date.now(), schoolYearId: 'y1' },
    ],
    grades: [
      { id: 'g1', subjectId: 's1', value: 2, kind: 'schulaufgabe', title: '1. SA', date: new Date(2025, 9, 14).getTime(), weight: 1, schoolYearId: 'y1' },
      { id: 'g2', subjectId: 's1', value: 3, kind: 'muendlich', date: new Date(2025, 10, 5).getTime(), weight: 1, weightMultiplier: 1.5, schoolYearId: 'y1' },
    ],
    tasks: [
      { id: 't1', title: 'Aufgaben S. 42', subjectId: 's1', kind: 'hausaufgabe', dueDate: Date.now() + 86400000, done: false, priority: 2, createdAt: Date.now(), schoolYearId: 'y1' },
    ],
    lessons: [
      { id: 'l1', subjectId: 's1', weekday: 1, start: '08:00', end: '08:45', schoolYearId: 'y1' },
    ],
  };
}
