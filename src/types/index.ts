export type GradingSystem = 'bayern' | 'oberstufe';

export type SubjectCategory = 'haupt' | 'neben';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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

export type GradeKind = 'schulaufgabe' | 'stegreif' | 'muendlich' | 'projekt' | 'sonstige';

export interface Grade {
  id: string;
  subjectId: string;
  value: number;
  kind: GradeKind;
  title?: string;
  date: number;
  weight: number;
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

export interface AppSettings {
  id: 'app';
  name?: string;
  system: GradingSystem;
  onboarded: boolean;
  demo: boolean;
  theme: 'light' | 'dark' | 'auto';
  schoolStart: string;
  weekStart: 0 | 1;
}

export const SUBJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#f59e0b', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#a855f7', '#84cc16',
] as const;
