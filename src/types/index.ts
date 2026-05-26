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

/**
 * Notenart. Vordefiniert sind die Werte aus BUILTIN_GRADE_KINDS, zusätzlich
 * können in den Einstellungen eigene Kategorien angelegt werden – ihre ID
 * wird dann hier abgelegt (Format frei wählbar).
 */
export type GradeKind = string;

export const BUILTIN_GRADE_KINDS = ['schulaufgabe', 'stegreif', 'muendlich', 'referat', 'klausur', 'projekt', 'sonstige'] as const;
export type BuiltinGradeKind = typeof BUILTIN_GRADE_KINDS[number];

/**
 * Vom User definierte zusätzliche Notenart.
 * - `weighting = 'large'`: zählt wie eine Schulaufgabe/Klausur
 *   (geht in den Schulaufgaben-Block beim Bayern-Hauptfach-Schnitt).
 * - `weighting = 'rest'`: zählt wie Mündlich/Stegreif (kleine Leistung).
 */
export interface CustomGradeKind {
  id: string;
  label: string;
  weighting: 'large' | 'rest';
}

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
  /** Vom User angelegte Leistungsnachweis-Kategorien (über Schulaufgabe/Mündlich hinaus). */
  customKinds: CustomGradeKind[];
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
  /** Zugehöriges Schuljahr. Wenn nicht gesetzt, gehört das Fach zum aktuellen Jahr (Migration). */
  schoolYearId?: string;
  /** Optionale Zugehörigkeit zu einer User-definierten Fächergruppe (SubjectGroup.id). */
  groupId?: string;
  /** Manuelle Sortierreihenfolge. Kleinere Werte zuerst. Fehlende Werte werden ans Ende gehängt und alphabetisch sortiert. */
  position?: number;
}

/**
 * Vom User angelegte Fächergruppe – rein organisatorisch (keine Auswirkung auf
 * Notenberechnung). Z. B. "Naturwissenschaften", "Sprachen", "Sport".
 */
export interface SubjectGroup {
  id: string;
  label: string;
  color?: string;
  /** Reihenfolge der Gruppen untereinander. */
  position?: number;
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
  /** Zugehöriges Schuljahr. Wird vom Subject geerbt beim Anlegen. */
  schoolYearId?: string;
  /** Lerncheckliste – Themen die du können musst, mit Ampel-Status. */
  studyChecklist?: StudyChecklistItem[];
  /** Ziel-Datum bis wann du die Checkliste durchhaben willst (ms timestamp). */
  studyDeadline?: number;
}

export type StudyStatus = 'red' | 'yellow' | 'green';

export interface StudyChecklistItem {
  id: string;
  label: string;
  status: StudyStatus;
}

/**
 * Aufgaben-Art. Built-ins in BUILTIN_TASK_KINDS, zusätzlich können die
 * vom User angelegten Custom-Kategorien (gradingConfig.customKinds) als
 * Aufgaben-Art verwendet werden – ihre ID landet dann hier als String.
 */
export type TaskKind = string;

export const BUILTIN_TASK_KINDS = ['hausaufgabe', 'test', 'schulaufgabe', 'projekt', 'todo'] as const;
export type BuiltinTaskKind = typeof BUILTIN_TASK_KINDS[number];

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
  /** Zugehöriges Schuljahr. */
  schoolYearId?: string;
  /** Lerncheckliste – Themen die du können musst, mit Ampel-Status. */
  studyChecklist?: StudyChecklistItem[];
  /** Ziel-Datum bis wann du die Checkliste durchhaben willst (ms timestamp). */
  studyDeadline?: number;
}

export interface Lesson {
  id: string;
  subjectId: string;
  weekday: Weekday;
  start: string;
  end: string;
  room?: string;
  weekParity?: 'A' | 'B' | 'ALL';
  /** Zugehöriges Schuljahr. Wird vom Subject geerbt beim Anlegen. */
  schoolYearId?: string;
}

export type ColorThemeId = 'indigo' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'crimson' | 'sunshine' | 'mono' | 'rainbow';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type DensityMode = 'comfortable' | 'compact';
export type FontScale = 0.9 | 1 | 1.1;
export type AnimationLevel = 'rich' | 'reduced' | 'minimal';
export type GreetingStyle = 'casual' | 'formal' | 'fun';

export interface Photo {
  id: string;
  refId: string;
  refType: 'grade' | 'task';
  /** Pfad in Supabase Storage, Form: "{userId}/{photoId}.jpg". Neue Fotos haben das. */
  storagePath?: string;
  /** Legacy: base64 Data-URL. Ältere Fotos vor der Cloud-Migration. */
  dataUrl?: string;
  createdAt: number;
  /** Falls schon vom Cloud-Sync gepushed. */
  userId?: string;
}

export interface AppSettings {
  id: 'app';
  name?: string;
  school?: string;
  classLevel?: string;
  system: GradingSystem;
  onboarded: boolean;
  demo: boolean;
  theme: ThemeMode;
  colorTheme: ColorThemeId;
  density: DensityMode;
  fontScale: FontScale;
  animationLevel: AnimationLevel;
  glassEffects: boolean;
  confettiOnGood: boolean;
  schoolStart: string;
  schoolEnd: string;
  weekStart: 0 | 1;
  dashboardGreetingStyle: GreetingStyle;
  quickButtons: TaskKind[];
  autoSelectActiveSubject: boolean;
  activeSubjectThresholdMin: number;
  defaultTaskPriority: 1 | 2 | 3;
  averageDigits: 1 | 2 | 3;
  trendThreshold: number;
  gradingConfig: GradingSystemConfig;
  /** Vom User angelegte Fächergruppen. */
  subjectGroups: SubjectGroup[];
  /** Push-Notification-Konfiguration. */
  notifications: NotificationSettings;
}

/** Konfiguration der Push-Benachrichtigungen – pro Event-Typ einzeln steuerbar. */
export interface NotificationSettings {
  /** Master-Switch. Wenn false, wird gar nichts gesendet. */
  enabled: boolean;
  /** Hausaufgaben-Erinnerung. */
  homework: {
    enabled: boolean;
    /** Wieviele Stunden vor `dueDate` benachrichtigen. */
    hoursBefore: number;
  };
  /** Klausuren & Tests. */
  exam: {
    enabled: boolean;
    /** Erste Benachrichtigung in X Tagen vorher (0 = aus). */
    daysBefore: number;
    /** Zweite Benachrichtigung in X Stunden vorher (0 = aus). */
    hoursBefore: number;
  };
  /** Stundenbeginn-Erinnerung. */
  lessonStart: {
    enabled: boolean;
    /** Minuten vor Stundenbeginn. */
    minutesBefore: number;
    /** Nur Montag–Freitag. */
    onlyWeekdays: boolean;
  };
  /** Lerncheckliste-Deadline (studyDeadline). */
  studyDeadline: {
    enabled: boolean;
    /** Stunden vor `studyDeadline`. */
    hoursBefore: number;
  };
  /** Stille Zeit – während dieses Fensters nicht benachrichtigen. */
  quietHours: {
    enabled: boolean;
    /** HH:MM Start (z. B. "22:00"). */
    from: string;
    /** HH:MM Ende (z. B. "07:00"). Wenn from > to, läuft das Fenster über Mitternacht. */
    to: string;
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  homework: { enabled: true, hoursBefore: 12 },
  exam: { enabled: true, daysBefore: 3, hoursBefore: 12 },
  lessonStart: { enabled: false, minutesBefore: 10, onlyWeekdays: true },
  studyDeadline: { enabled: true, hoursBefore: 24 },
  quietHours: { enabled: true, from: '22:00', to: '07:00' },
};

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
  customKinds: [],
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
  weekStart: 1,
  dashboardGreetingStyle: 'casual',
  quickButtons: DEFAULT_QUICK_BUTTONS,
  autoSelectActiveSubject: true,
  activeSubjectThresholdMin: 10,
  defaultTaskPriority: 2,
  averageDigits: 2,
  trendThreshold: 0.2,
  gradingConfig: DEFAULT_GRADING_CONFIG,
  subjectGroups: [],
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
