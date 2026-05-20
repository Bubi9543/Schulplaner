export type GradingSystem = 'bayern' | 'oberstufe' | 'austria' | 'custom';

export type SubjectCategory = 'haupt' | 'neben';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type GradeKind = 'schulaufgabe' | 'stegreif' | 'muendlich' | 'projekt' | 'sonstige';

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

export interface Grade {
  id: string;
  subjectId: string;
  value: number;
  kind: GradeKind;
  title?: string;
  date: number;
  weight: number;
  weightMultiplier?: 0.5 | 1 | 2;
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

export type AccentName = 'indigo' | 'rose' | 'emerald' | 'amber' | 'sky' | 'violet';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type DensityMode = 'comfortable' | 'compact';
export type FontScale = 0.9 | 1 | 1.1;
export type AnimationLevel = 'rich' | 'reduced' | 'minimal';
export type GreetingStyle = 'casual' | 'formal' | 'fun';
export type DashboardLayout = 'rich' | 'list';

export interface AppSettings {
  id: 'app';
  name?: string;
  school?: string;
  classLevel?: string;
  avatarColor?: string;
  system: GradingSystem;
  onboarded: boolean;
  demo: boolean;
  theme: ThemeMode;
  accent: AccentName;
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

export const ACCENT_HEX: Record<AccentName, string> = {
  indigo: '#6366f1',
  rose: '#f43f5e',
  emerald: '#10b981',
  amber: '#f59e0b',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
};

export const DEFAULT_KIND_WEIGHTS: Record<GradeKind, GradeKindWeight> = {
  schulaufgabe: { haupt: 2, neben: 1 },
  stegreif: { haupt: 1, neben: 1 },
  muendlich: { haupt: 1, neben: 1 },
  projekt: { haupt: 1, neben: 1 },
  sonstige: { haupt: 1, neben: 1 },
};

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
  accent: 'indigo',
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
};

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}
