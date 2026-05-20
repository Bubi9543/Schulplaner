import type { Grade, GradingSystem, GradingSystemConfig, Subject, GradeKind, SubjectCategory } from '@/types';

export const KIND_LABEL: Record<GradeKind, string> = {
  schulaufgabe: 'Schulaufgabe',
  stegreif:     'Stegreifaufgabe',
  muendlich:    'Mündlich',
  referat:      'Referat',
  klausur:      'Klausur',
  projekt:      'Projekt',
  sonstige:     'Sonstige',
};

export interface SystemMeta {
  min: number;
  max: number;
  step: number;
  reversed: boolean;
  goodIsLow: boolean;
  defaultValue: number;
  valueOptions: number[];
  formatValue: (v: number) => string;
  label: string;
}

export function getSystemMeta(system: GradingSystem, config: GradingSystemConfig): SystemMeta {
  switch (system) {
    case 'bayern':
      return {
        min: 1, max: 6, step: 1, reversed: true, goodIsLow: true,
        defaultValue: 2, valueOptions: [1, 2, 3, 4, 5, 6],
        formatValue: v => `${Math.round(v)}`,
        label: 'Bayern (1–6)',
      };
    case 'oberstufe':
      return {
        min: 0, max: 15, step: 1, reversed: false, goodIsLow: false,
        defaultValue: 10, valueOptions: Array.from({ length: 16 }, (_, i) => i),
        formatValue: v => `${Math.round(v)} P`,
        label: 'Oberstufe (0–15 P)',
      };
    case 'austria':
      return {
        min: 1, max: 5, step: 1, reversed: true, goodIsLow: true,
        defaultValue: 2, valueOptions: [1, 2, 3, 4, 5],
        formatValue: v => `${Math.round(v)}`,
        label: 'Österreich (1–5)',
      };
    case 'custom': {
      const c = config.custom;
      const opts: number[] = [];
      for (let v = c.min; v <= c.max + 1e-9; v += c.step) opts.push(+v.toFixed(3));
      return {
        min: c.min, max: c.max, step: c.step, reversed: c.goodIsLow, goodIsLow: c.goodIsLow,
        defaultValue: c.defaultValue, valueOptions: opts,
        formatValue: v => formatGermanNumber(v, opts.some(o => o !== Math.round(o)) ? 2 : 0),
        label: c.label || 'Frei',
      };
    }
  }
}

export function getKindWeight(system: GradingSystem, config: GradingSystemConfig, kind: GradeKind, category: SubjectCategory): number {
  switch (system) {
    case 'bayern': return config.bayern.kindWeights[kind][category];
    case 'oberstufe': return config.oberstufe.kindWeights[kind][category];
    case 'austria': return config.austria.kindWeights[kind][category];
    case 'custom': return config.custom.kindWeights[kind][category];
  }
}

export function defaultWeight(kind: GradeKind, system: GradingSystem, category: SubjectCategory, config: GradingSystemConfig): number {
  return getKindWeight(system, config, kind, category);
}

export function effectiveWeight(grade: Grade, subject: Subject | undefined, config: GradingSystemConfig): number {
  const baseFromKind = subject ? getKindWeight(subject.system, config, grade.kind, subject.category) : grade.weight;
  const base = baseFromKind ?? grade.weight ?? 1;
  const mul = subject?.system === 'oberstufe' && config.oberstufe.allowPerGradeWeight && grade.weightMultiplier ? grade.weightMultiplier : 1;
  return base * mul;
}

export function gradeColor(value: number, system: GradingSystem, config?: GradingSystemConfig): string {
  if (system === 'oberstufe') {
    if (value >= 13) return '#10b981';
    if (value >= 10) return '#22c55e';
    if (value >= 7) return '#f59e0b';
    if (value >= 4) return '#f97316';
    return '#ef4444';
  }
  if (system === 'austria') {
    if (value <= 1) return '#10b981';
    if (value <= 2) return '#22c55e';
    if (value <= 3) return '#f59e0b';
    if (value <= 4) return '#f97316';
    return '#ef4444';
  }
  if (system === 'custom' && config) {
    const c = config.custom;
    const range = c.max - c.min;
    const norm = range === 0 ? 0.5 : (value - c.min) / range;
    const score = c.goodIsLow ? 1 - norm : norm;
    if (score >= 0.85) return '#10b981';
    if (score >= 0.65) return '#22c55e';
    if (score >= 0.45) return '#f59e0b';
    if (score >= 0.25) return '#f97316';
    return '#ef4444';
  }
  if (value <= 1.5) return '#10b981';
  if (value <= 2.5) return '#22c55e';
  if (value <= 3.5) return '#f59e0b';
  if (value <= 4.5) return '#f97316';
  return '#ef4444';
}

export function average(grades: Grade[], subjectFor: (g: Grade) => Subject | undefined, config: GradingSystemConfig): number | null {
  const valid = grades.filter(g => !g.isPending && typeof g.value === 'number');
  if (!valid.length) return null;
  let sum = 0, w = 0;
  for (const g of valid) {
    const subj = subjectFor(g);
    const weight = effectiveWeight(g, subj, config);
    sum += g.value * weight;
    w += weight;
  }
  if (!w) return null;
  return sum / w;
}

export function subjectAverage(grades: Grade[], subject: Subject, config: GradingSystemConfig): number | null {
  return average(grades.filter(g => g.subjectId === subject.id), () => subject, config);
}

export function overallAverage(grades: Grade[], subjects: Subject[], config: GradingSystemConfig): number | null {
  const sums: number[] = [];
  for (const s of subjects) {
    const avg = subjectAverage(grades, s, config);
    if (avg !== null) sums.push(avg);
  }
  if (!sums.length) return null;
  return sums.reduce((a, b) => a + b, 0) / sums.length;
}

export function gradeTrend(grades: Grade[], subjectFor: (g: Grade) => Subject | undefined, config: GradingSystemConfig, threshold = 0.2): 'up' | 'down' | 'flat' {
  const sorted = [...grades].filter(g => !g.isPending).sort((a, b) => a.date - b.date);
  if (sorted.length < 2) return 'flat';
  const half = Math.floor(sorted.length / 2) || 1;
  const older = sorted.slice(0, half);
  const newer = sorted.slice(half);
  const oa = average(older, subjectFor, config);
  const na = average(newer, subjectFor, config);
  if (oa === null || na === null) return 'flat';
  const diff = na - oa;
  const firstSubj = subjectFor(sorted[0]);
  const goodIsLow = firstSubj ? getSystemMeta(firstSubj.system, config).goodIsLow : true;
  if (goodIsLow) {
    if (diff < -threshold) return 'up';
    if (diff > threshold) return 'down';
  } else {
    if (diff > threshold) return 'up';
    if (diff < -threshold) return 'down';
  }
  return 'flat';
}

export function needsAttention(grades: Grade[], subject: Subject, config: GradingSystemConfig): boolean {
  const avg = subjectAverage(grades, subject, config);
  if (avg === null) return false;
  const meta = getSystemMeta(subject.system, config);
  if (subject.targetAverage !== undefined) {
    return meta.goodIsLow ? avg > subject.targetAverage + 0.3 : avg < subject.targetAverage - 0.3;
  }
  if (subject.system === 'oberstufe') return avg < 5;
  if (subject.system === 'austria') return avg > 3.5;
  if (subject.system === 'bayern') return avg > 3.5;
  return false;
}

export function formatAverage(value: number | null, system: GradingSystem, digits: number = 2): string {
  if (value === null || Number.isNaN(value)) return '–';
  return formatGermanNumber(value, system === 'oberstufe' ? Math.max(1, digits) : digits);
}

export function gradeLabel(value: number, system: GradingSystem): string {
  if (system === 'oberstufe') return `${Math.round(value)} P`;
  if (system === 'austria' || system === 'bayern') return `${Math.round(value)}`;
  return formatGermanNumber(value, 2);
}

export function isGoodGrade(value: number, system: GradingSystem): boolean {
  if (system === 'oberstufe') return value >= 12;
  if (system === 'austria') return value <= 2;
  if (system === 'bayern') return value <= 2;
  return false;
}

export function formatGermanNumber(v: number, digits = 2): string {
  if (Number.isNaN(v)) return '–';
  const fixed = digits === 0 ? Math.round(v).toString() : v.toFixed(digits);
  return fixed.replace('.', ',');
}
