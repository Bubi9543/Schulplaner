import type { Grade, Subject, GradingSystemConfig, AbiturConfig } from '@/types';
import { oberstufeTermsFor } from '@/types';
import { halfYearPoints } from './grading';

/**
 * Abitur-Berechnung für die bayerische gymnasiale Oberstufe (G9, Abitur ab 2026).
 *
 * Vereinfachtes, transparentes Modell (Prognose):
 * - Block I: bis zu 40 eingebrachte Halbjahresleistungen (HJL) × max 15 = max 600 P.
 *   Eingebracht werden automatisch die 40 besten HJL (optimistische Schätzung).
 * - Block II: 5 Abiturprüfungsfächer × 4-fache Wertung × max 15 = max 300 P.
 * - Gesamt max 900 → Abinote N = 17/3 − P/180, begrenzt auf 1,0–4,0.
 *
 * Die exakten Einbringungsregeln (GSO Anlage 10: Pflichtfächer, je ≥4 HJL aus
 * Fremdsprachen/Naturwissenschaften) sind hier NICHT abgebildet – daher Prognose.
 */

export const MAX_EINGEBRACHT = 40;
export const NUM_ABITURFAECHER = 5;
export const MAX_BLOCK_I = 600;
export const MAX_BLOCK_II = 300;
export const MAX_TOTAL = 900;
export const MIN_BLOCK_I = 200;
export const MIN_BLOCK_II = 100;
export const MIN_TOTAL = 300;

/** Eine einzelne Halbjahresleistung (Fach × Ausbildungsabschnitt). */
export interface HjlEntry {
  subjectId: string;
  subjectName: string;
  term: number;
  termLabel: string;
  points: number; // 0–15 (gerundete HJL)
}

/** Berechnet alle vorhandenen Halbjahresleistungen eines Oberstufen-Jahres. */
export function computeAllHjl(
  subjects: Subject[],
  allYearGrades: Grade[],
  config?: GradingSystemConfig,
  jahrgaenge?: [number, number],
): HjlEntry[] {
  const terms = oberstufeTermsFor(jahrgaenge);
  const out: HjlEntry[] = [];
  for (const s of subjects) {
    if (s.system !== 'oberstufe') continue;
    for (const t of terms) {
      const termGrades = allYearGrades.filter(g => g.subjectId === s.id && (g.term ?? 1) === t.term);
      const pts = halfYearPoints(termGrades, s, config);
      if (pts !== null) {
        out.push({ subjectId: s.id, subjectName: s.name, term: t.term, termLabel: t.label, points: pts });
      }
    }
  }
  return out;
}

export interface AbiResult {
  /** Alle HJL, sortiert (beste zuerst). */
  hjl: HjlEntry[];
  /** Die (bis zu 40) eingebrachten HJL. */
  eingebracht: HjlEntry[];
  /** IDs der eingebrachten HJL (subjectId:term) – für Markierung in der UI. */
  eingebrachtKeys: Set<string>;
  /** Pflicht-HJL (Abiturfächer + als komplett markierte Fächer) – nicht streichbar. */
  pflichtKeys: Set<string>;
  /** Manuell gestrichene HJL. */
  struckKeys: Set<string>;
  blockI: number;
  blockII: number;
  total: number;
  /** Abiturnote 1,0–4,0 oder null, wenn keine Berechnung möglich. */
  note: number | null;
  /** Erfüllt die Bestehensgrenzen (Block I ≥ 200, Block II ≥ 100, Gesamt ≥ 300). */
  passed: boolean;
  warnings: string[];
}

export function hjlKey(e: { subjectId: string; term: number }): string {
  return `${e.subjectId}:${e.term}`;
}

/** Wandelt eine Gesamtpunktzahl (0–900) in die Abiturnote 1,0–4,0 um. */
export function pointsToAbiNote(total: number): number {
  // KMK-Formel: N = 5 2/3 − P/180, gerundet auf 1 Nachkommastelle, begrenzt auf [1,0; 4,0].
  const raw = 17 / 3 - total / 180;
  const clamped = Math.max(1, Math.min(4, raw));
  return Math.round(clamped * 10) / 10;
}

export function computeAbitur(
  subjects: Subject[],
  allYearGrades: Grade[],
  abitur: AbiturConfig | undefined,
  config?: GradingSystemConfig,
  jahrgaenge?: [number, number],
): AbiResult {
  const hjl = computeAllHjl(subjects, allYearGrades, config, jahrgaenge).sort((a, b) => b.points - a.points);

  const examIds = abitur?.examSubjectIds ?? [];
  // Pflicht-Fächer: Abiturfächer (immer komplett) + vom Nutzer markierte Fächer.
  const fullSet = new Set<string>([...examIds, ...(abitur?.fullSubjectIds ?? [])]);
  const struckKeys = new Set(abitur?.struckKeys ?? []);

  // HJL-Auswahl: Pflicht-HJL zuerst (außer manuell gestrichen), dann beste der übrigen
  // bis 40 erreicht sind. Gestrichene werden nie eingebracht.
  const pflicht = hjl.filter(h => fullSet.has(h.subjectId) && !struckKeys.has(hjlKey(h)));
  const pflichtKeySet = new Set(pflicht.map(hjlKey));
  const rest = hjl.filter(h => !pflichtKeySet.has(hjlKey(h)) && !struckKeys.has(hjlKey(h)));
  // rest ist bereits absteigend sortiert (beste zuerst).
  const slots = Math.max(0, MAX_EINGEBRACHT - pflicht.length);
  let eingebrachtList = [...pflicht, ...rest.slice(0, slots)];
  // Falls mehr als 40 Pflicht-HJL: nur die 40 besten in die Summe (Modell-Deckel).
  if (eingebrachtList.length > MAX_EINGEBRACHT) {
    eingebrachtList = [...eingebrachtList].sort((a, b) => b.points - a.points).slice(0, MAX_EINGEBRACHT);
  }
  const eingebracht = eingebrachtList;
  const eingebrachtKeys = new Set(eingebracht.map(hjlKey));
  const blockI = Math.min(MAX_BLOCK_I, eingebracht.reduce((sum, e) => sum + e.points, 0));

  const examPointsSum = examIds.reduce((sum, id) => sum + (abitur?.examPoints?.[id] ?? 0), 0);
  const blockII = examPointsSum * 4;

  const total = blockI + blockII;

  const warnings: string[] = [];
  if (hjl.length < MAX_EINGEBRACHT) {
    warnings.push(`Erst ${hjl.length} von ${MAX_EINGEBRACHT} Halbjahresleistungen vorhanden – Prognose noch unvollständig.`);
  }
  if (pflicht.length > MAX_EINGEBRACHT) {
    warnings.push(`Mehr als ${MAX_EINGEBRACHT} Pflicht-Halbjahresleistungen markiert – bitte Auswahl prüfen.`);
  }
  if (examIds.length < NUM_ABITURFAECHER) {
    warnings.push(`Wähle ${NUM_ABITURFAECHER} Abiturprüfungsfächer (aktuell ${examIds.length}).`);
  }
  if (blockI < MIN_BLOCK_I) warnings.push(`Block I unter der Mindestgrenze (${blockI}/${MIN_BLOCK_I} P).`);
  if (examIds.length === NUM_ABITURFAECHER && blockII < MIN_BLOCK_II) {
    warnings.push(`Block II unter der Mindestgrenze (${blockII}/${MIN_BLOCK_II} P).`);
  }

  const note = total > 0 ? pointsToAbiNote(total) : null;
  const passed = blockI >= MIN_BLOCK_I && blockII >= MIN_BLOCK_II && total >= MIN_TOTAL;

  return { hjl, eingebracht, eingebrachtKeys, pflichtKeys: pflichtKeySet, struckKeys, blockI, blockII, total, note, passed, warnings };
}
