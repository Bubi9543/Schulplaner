import type { Grade, GradingSystem, Subject } from '@/types';

export const KIND_WEIGHTS: Record<string, { bayern: number; oberstufe: number; label: string }> = {
  schulaufgabe: { bayern: 2, oberstufe: 1, label: 'Schulaufgabe' },
  stegreif: { bayern: 1, oberstufe: 1, label: 'Stegreifaufgabe' },
  muendlich: { bayern: 1, oberstufe: 1, label: 'Mündlich' },
  projekt: { bayern: 1, oberstufe: 1, label: 'Projekt' },
  sonstige: { bayern: 1, oberstufe: 1, label: 'Sonstige' },
};

export function defaultWeight(kind: string, system: GradingSystem, category: 'haupt' | 'neben' = 'neben'): number {
  const base = KIND_WEIGHTS[kind]?.[system] ?? 1;
  if (system === 'bayern' && category === 'haupt' && kind === 'schulaufgabe') return 2;
  if (system === 'bayern' && category === 'neben' && kind === 'schulaufgabe') return 1;
  return base;
}

export function gradeLabel(value: number, system: GradingSystem): string {
  if (system === 'oberstufe') return `${Math.round(value)} P`;
  return value.toFixed(1).replace('.', ',');
}

export function gradeColor(value: number, system: GradingSystem): string {
  if (system === 'oberstufe') {
    if (value >= 13) return '#10b981';
    if (value >= 10) return '#22c55e';
    if (value >= 7) return '#f59e0b';
    if (value >= 4) return '#f97316';
    return '#ef4444';
  }
  if (value <= 1.5) return '#10b981';
  if (value <= 2.5) return '#22c55e';
  if (value <= 3.5) return '#f59e0b';
  if (value <= 4.5) return '#f97316';
  return '#ef4444';
}

export function average(grades: Grade[]): number | null {
  const valid = grades.filter(g => !g.isPending && typeof g.value === 'number');
  if (!valid.length) return null;
  const sum = valid.reduce((acc, g) => acc + g.value * (g.weight || 1), 0);
  const weight = valid.reduce((acc, g) => acc + (g.weight || 1), 0);
  if (!weight) return null;
  return sum / weight;
}

export function subjectAverage(grades: Grade[], subject: Subject): number | null {
  return average(grades.filter(g => g.subjectId === subject.id));
}

export function overallAverage(grades: Grade[], subjects: Subject[]): number | null {
  const sums: number[] = [];
  for (const s of subjects) {
    const avg = subjectAverage(grades, s);
    if (avg !== null) sums.push(avg);
  }
  if (!sums.length) return null;
  return sums.reduce((a, b) => a + b, 0) / sums.length;
}

export function gradeTrend(grades: Grade[]): 'up' | 'down' | 'flat' {
  const sorted = [...grades].filter(g => !g.isPending).sort((a, b) => a.date - b.date);
  if (sorted.length < 2) return 'flat';
  const half = Math.floor(sorted.length / 2) || 1;
  const older = sorted.slice(0, half);
  const newer = sorted.slice(half);
  const oa = average(older);
  const na = average(newer);
  if (oa === null || na === null) return 'flat';
  const diff = na - oa;
  const threshold = 0.2;
  if (diff < -threshold) return 'up';
  if (diff > threshold) return 'down';
  return 'flat';
}

export function needsAttention(grades: Grade[], subject: Subject): boolean {
  const avg = subjectAverage(grades, subject);
  if (avg === null) return false;
  if (subject.system === 'oberstufe') return avg < 5;
  if (subject.targetAverage) return avg > subject.targetAverage + 0.3;
  return avg > 3.5;
}

export function formatAverage(value: number | null, system: GradingSystem): string {
  if (value === null || Number.isNaN(value)) return '–';
  if (system === 'oberstufe') return value.toFixed(1).replace('.', ',');
  return value.toFixed(2).replace('.', ',');
}

export const GRADE_RANGES = {
  bayern: { min: 1, max: 6, step: 0.25, default: 2 },
  oberstufe: { min: 0, max: 15, step: 1, default: 10 },
} as const;
