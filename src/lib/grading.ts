import type { Grade, GradingSystem, GradingSystemConfig, Subject, GradeKind, SubjectCategory } from '@/types';

export const BUILTIN_KIND_LABEL: Record<string, string> = {
  schulaufgabe: 'Schulaufgabe',
  stegreif:     'Stegreifaufgabe',
  muendlich:    'Mündlich',
  referat:      'Referat',
  klausur:      'Klausur',
  projekt:      'Projekt',
  sonstige:     'Sonstige',
};

/**
 * Legacy-Export: alte Aufrufer wie `KIND_LABEL[g.kind]` weiter unterstützt –
 * Wenn eine ID nicht in den Built-ins steht, wird sie 1:1 als Label
 * zurückgegeben. Für lokalisierte Labels von Custom-Kinds bitte
 * `getKindLabel(kind, config)` nutzen.
 */
export const KIND_LABEL = new Proxy(BUILTIN_KIND_LABEL, {
  get(target, prop: string) {
    return target[prop] ?? prop;
  },
}) as Record<string, string>;

/** Schlüssel-→-Label-Auflösung, kennt Built-ins UND User-Custom-Kinds. */
export function getKindLabel(kind: GradeKind, config?: GradingSystemConfig): string {
  if (BUILTIN_KIND_LABEL[kind]) return BUILTIN_KIND_LABEL[kind];
  const custom = config?.customKinds?.find(c => c.id === kind);
  return custom?.label ?? kind;
}

export const CATEGORY_LABEL: Record<SubjectCategory, string> = {
  'hauptfach':        'Hauptfach',
  'hauptfach-1zu1':   'Hauptfach (1:1)',
  'nebenfach':        'Nebenfach',
};

export const CATEGORY_DESCRIPTION: Record<SubjectCategory, string> = {
  'hauptfach':        'Schulaufgaben zählen doppelt: (SA × 2 + Rest) / 3',
  'hauptfach-1zu1':   'Schulaufgaben 1:1 mit Rest: (SA + Rest) / 2',
  'nebenfach':        'Einfacher gewichteter Mittelwert aller Noten',
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

/**
 * Gibt true zurück, wenn die Notenart als „Schulaufgabe / Klausur" gilt
 * (vs. „kleine LN / Rest"). Custom-Kinds mit `weighting: 'large'` werden
 * ebenfalls als groß behandelt.
 */
export function isLargeAssessmentKind(kind: GradeKind, config?: GradingSystemConfig): boolean {
  if (kind === 'schulaufgabe' || kind === 'klausur') return true;
  if (!config) return false;
  const custom = config.customKinds?.find(c => c.id === kind);
  return custom?.weighting === 'large';
}

/** Effektives Gewicht einer einzelnen Note: weightMultiplier (default 1). */
export function gradeWeight(g: Grade): number {
  const m = g.weightMultiplier;
  if (typeof m === 'number' && m > 0 && Number.isFinite(m)) return m;
  return 1;
}

/** Gewichteter Mittelwert einer Notengruppe (nutzt nur weightMultiplier). */
function weightedMean(grades: Grade[]): number | null {
  if (!grades.length) return null;
  let sum = 0, w = 0;
  for (const g of grades) {
    const m = gradeWeight(g);
    sum += g.value * m;
    w += m;
  }
  if (w <= 0) return null;
  return sum / w;
}

/** Berechnet den Schnitt eines Fachs nach Bayern-Logik (Kategorie + per-Note-Multiplikator). */
export function subjectAverage(grades: Grade[], subject: Subject, config?: GradingSystemConfig): number | null {
  const valid = grades.filter(g => g.subjectId === subject.id && !g.isPending && typeof g.value === 'number');
  if (!valid.length) return null;

  // Nebenfach + Oberstufe ohne Kategorie-Logik: einfacher gewichteter Mittelwert
  if (subject.category === 'nebenfach') {
    return weightedMean(valid);
  }

  // Hauptfach (mit oder ohne 1:1): Split in Schulaufgaben / Rest
  const sa   = valid.filter(g => isLargeAssessmentKind(g.kind, config));
  const rest = valid.filter(g => !isLargeAssessmentKind(g.kind, config));

  const saMean   = weightedMean(sa);
  const restMean = weightedMean(rest);

  // Edge Cases: nur eine der beiden Gruppen vorhanden
  if (saMean === null && restMean === null) return null;
  if (saMean === null) return restMean;
  if (restMean === null) return saMean;

  if (subject.category === 'hauptfach-1zu1') {
    return (saMean + restMean) / 2;
  }
  // hauptfach: Schulaufgaben doppelt → (SA × 2 + Rest) / 3
  return (saMean * 2 + restMean) / 3;
}

/** Generischer Mittelwert über mehrere Fächer (für Gesamtschnitt-Anzeigen). */
export function average(grades: Grade[], subjectFor: (g: Grade) => Subject | undefined, config: GradingSystemConfig): number | null {
  const bySubject = new Map<string, Grade[]>();
  for (const g of grades) {
    if (g.isPending) continue;
    const s = subjectFor(g);
    if (!s) continue;
    if (!bySubject.has(s.id)) bySubject.set(s.id, []);
    bySubject.get(s.id)!.push(g);
  }
  const subjAverages: number[] = [];
  for (const [sid, gs] of bySubject) {
    const subj = subjectFor(gs[0]);
    if (!subj || subj.id !== sid) continue;
    const a = subjectAverage(gs, subj, config);
    if (a !== null) subjAverages.push(a);
  }
  if (!subjAverages.length) return null;
  return subjAverages.reduce((a, b) => a + b, 0) / subjAverages.length;
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

/** Wird noch von älteren Stellen (Tabellen-Anzeige etc.) aufgerufen. Liefert das per-Note Gewicht zurück. */
export function effectiveWeight(grade: Grade, _subject: Subject | undefined, _config?: GradingSystemConfig): number {
  void _subject; void _config;
  return gradeWeight(grade);
}

/** Default-Multiplikator beim Anlegen einer neuen Note. */
export function defaultWeight(_kind: GradeKind, _system: GradingSystem, _category: SubjectCategory, _config?: GradingSystemConfig): number {
  void _kind; void _system; void _category; void _config;
  return 1;
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
