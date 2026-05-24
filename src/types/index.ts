export type GradingSystem = 'bayern' | 'oberstufe' | 'austria' | 'custom';

/**
 * Fachkategorie - bestimmt die Notenberechnung in Bayern.
 * - hauptfach: Schulaufgaben zählen doppelt → (SA-Schnitt × 2 + Rest-Schnitt) / 3
 * - hauptfach-1zu1: Schulaufgaben 1:1 mit Rest → (SA-Schnitt + Rest-Schnitt) / 2 (z.B. Physik/Chemie)
 * - nebenfach: einfacher Schnitt aller Noten
 */
export type SubjectCategory = 'hauptfach' | 'hauptfach-1zu1' | 'nebenfach';

/** Migriert Legacy-Kategorien ('haupt' | 'neben') zu neuen Werten. */
export function normalizeSubjectCategory(input: unknown): SubjectCategory {
  if (input === 'hauptfach' || input === 'hauptfach-1zu1' || input === 'nebenfach') return input;
  if (input === 'haupt') return 'hauptfach';
  if (input === 'neben') return 'nebenfach';
  return 'nebenfach';
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type GradeKind = 'schulaufgabe' | 'stegreif' | 'muendlich' | 'referat' | 'klausur' | 'projekt' | 'sonstige';

export type GradeKindWeight = { haupt: number; neben: number };

export interface BayernConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
}
export interface OberstufeConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
  allowPerGradeWeight: boolean;
}
export interface AustriaConfig {
  kindWeights: Record<GradeKind, GradeKindWeight>;
}
export interface CustomConfig {
  min: number;
  max: number;
  step: number;
  goodIsLow: boolean;
  defaultValue: number;
  label: string;
  kindWeights: Record<GradeKind, GradeKindWeight>;
}

export interface GradingSystemConfig {
  bayern: BayernConfig;
  oberstufe: OberstufeConfig;
  austria: AustriaConfig;
  custom: CustomConfig;
}

export interface Subject {
  id: string;
  name: string;
  short: string;
  color: string;
  category: SubjectCategory;
  system: GradingSystem;
  teacher?: string;
  room?: string;
  targetAverage?: number;
  createdAt: number;
}

/** Standard-Gewichtsoptionen für einzelne Noten - "custom" erlaubt beliebigen Wert via weightMultiplier. */
export type GradeWeightPreset = 0.5 | 1 | 1.5 | 2;

export interface Grade {
  id: string;
  subjectId: string;
  value: number;
  kind: GradeKind;
  title?: string;
  date: number;
  /** Legacy-Feld (älteres Kind-Gewicht). Wird vom neuen System ignoriert. */
  weight: number;
  /** Per-Note Gewichts-Multiplikator. Default 1. Erlaubt 0.5/1/1.5/2 oder beliebige Zahl. */
  weightMultiplier?: number;
  isPending?: boolean;
}

export type TaskKind = 'hausaufgabe' | 'test' | 'schulaufgabe' | 'projekt' | 'todo';

export interface AppTask {
  id: string;
  title: string;
  description?: string;
  subjectId?: string;
  kind: TaskKind;
  dueDate?: number;
  reminder?: number;
  done: boolean;
  doneAt?: number;
  priority: 1 | 2 | 3;
  createdAt: number;
}

export interface Lesson {
  id: string;
  subjectId: string;
  weekday: Weekday;
  start: string;
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
}

export type ColorThemeId = 'indigo' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'crimson' | 'sunshine' | 'mono' | 'rainbow';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type DensityMode = 'comfortable' | 'compact';
export type FontScale = 0.9 | 1 | 1.1;
export type AnimationLevel = 'rich' | 'reduced' | 'minimal';
export type GreetingStyle = 'casual' | 'formal' | 'fun';
export type DashboardLayout = 'rich' | 'list';

export interface Photo {
  id: string;
  refId: string;
  refType: 'grade' | 'task';
  dataUrl: string;
  createdAt: number;
}

export interface AppSettings {
  id: 'app';
  name?: string;
  school?: string;
  classLevel?: string;
  avatarColor?: string;
  system: GradingSystem;
  onboarded: boolean;
  demo: boolean;
  isMainDevice: boolean;
  theme: ThemeMode;
  colorTheme: ColorThemeId;
  density: DensityMode;
  fontScale: FontScale;
  animationLevel: AnimationLevel;
  glassEffects: boolean;
  confettiOnGood: boolean;
  schoolStart: string;
  schoolEnd: string;
  showWeekends: boolean;
  weekStart: 0 | 1;
  dashboardGreetingStyle: GreetingStyle;
  dashboardLayout: DashboardLayout;
  quickButtons: TaskKind[];
  autoSelectActiveSubject: boolean;
  activeSubjectThresholdMin: number;
  defaultTaskPriority: 1 | 2 | 3;
  autoCompleteOverdue: boolean;
  averageDigits: 1 | 2 | 3;
  trendThreshold: number;
  gradingConfig: GradingSystemConfig;
}

export const SUBJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#f59e0b', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#a855f7', '#84cc16',
] as const;

export const DEFAULT_KIND_WEIGHTS: Record<GradeKind, GradeKindWeight> = {
  schulaufgabe: { haupt: 2, neben: 1 },
  stegreif:     { haupt: 1, neben: 1 },
  muendlich:    { haupt: 1, neben: 1 },
  referat:      { haupt: 1, neben: 1 },
  klausur:      { haupt: 2, neben: 1 },
  projekt:      { haupt: 1, neben: 1 },
  sonstige:     { haupt: 1, neben: 1 },
};

export interface SchoolYear {
  id: string;
  name: string;        // e.g. "2024/25"
  startDate: number;   // ms timestamp
  endDate?: number;    // ms timestamp, open if undefined
  active: boolean;
  createdAt: number;
}

export const DEFAULT_GRADING_CONFIG: GradingSystemConfig = {
  bayern: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
  oberstufe: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS), allowPerGradeWeight: true },
  austria: { kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
  custom: { min: 1, max: 6, step: 1/3, goodIsLow: true, defaultValue: 2, label: 'Frei', kindWeights: structuredCloneSafe(DEFAULT_KIND_WEIGHTS) },
};

export const DEFAULT_QUICK_BUTTONS: TaskKind[] = ['todo', 'hausaufgabe', 'test'];

export const DEFAULT_SETTINGS: Omit<AppSettings, 'id'> = {
  system: 'bayern',
  onboarded: false,
  demo: false,
  theme: 'auto',
  colorTheme: 'indigo',
  density: 'comfortable',
  fontScale: 1,
  animationLevel: 'rich',
  glassEffects: true,
  confettiOnGood: true,
  schoolStart: '08:00',
  schoolEnd: '17:00',
  showWeekends: false,
  weekStart: 1,
  dashboardGreetingStyle: 'casual',
  dashboardLayout: 'rich',
  quickButtons: DEFAULT_QUICK_BUTTONS,
  autoSelectActiveSubject: true,
  activeSubjectThresholdMin: 10,
  defaultTaskPriority: 2,
  autoCompleteOverdue: false,
  averageDigits: 2,
  trendThreshold: 0.2,
  gradingConfig: DEFAULT_GRADING_CONFIG,
  isMainDevice: false,
};

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
