import { describe, it, expect } from 'vitest';
import { computeAbitur, pointsToAbiNote } from './abitur';
import type { Subject, Grade } from '@/types';

// Baut n Fächer mit je 4 Oberstufen-Halbjahren, alle Noten = points (0–15).
function makeData(n: number, halbjahre: number, points: number) {
  const subjects: Subject[] = [];
  const grades: Grade[] = [];
  for (let i = 0; i < n; i++) {
    const id = `s${i}`;
    subjects.push({
      id, name: `Fach ${i}`, short: `F${i}`, color: '#000',
      category: 'hauptfach-1zu1', system: 'oberstufe',
    } as unknown as Subject);
    for (let t = 1; t <= halbjahre; t++) {
      grades.push({
        id: `g${i}-${t}`, subjectId: id, term: t,
        // Oberstufe: Punkte direkt als "Note" – halfYearPoints rundet daraus die HJL.
        value: points, type: 'schulaufgabe', date: '2026-01-01',
      } as unknown as Grade);
    }
  }
  return { subjects, grades };
}

describe('Abitur-Prognose', () => {
  it('rechnet fehlende HJL + Prüfungen aus dem Schnitt hoch statt 4,0 zu zeigen', () => {
    // 2 Fächer × 4 HJ = 8 HJL, alle 12 Punkte. Keine Prüfungen eingetragen.
    const { subjects, grades } = makeData(2, 4, 12);
    const r = computeAbitur(subjects, grades, { examSubjectIds: [], examPoints: {}, fullSubjectIds: [], struckKeys: [] }, undefined, [12, 13]);

    // Ist-Stand: nur 8 vorhandene HJL.
    expect(r.hjlVorhanden).toBe(8);
    expect(r.hjlSchnitt).toBe(12);
    expect(r.note).toBe(4); // Ist-Stand wäre weiterhin 4,0 (zu wenig Punkte)

    // Prognose: Schnitt 12 → Block I 480, Block II 12*5*4=240 → 720 → Note 1,7.
    expect(r.prognoseBlockI).toBe(480);
    expect(r.prognoseBlockII).toBe(240);
    expect(r.prognoseTotal).toBe(720);
    expect(r.prognoseNote).toBe(pointsToAbiNote(720));
    expect(r.prognoseNote).toBe(1.7);
    expect(r.prognosePassed).toBe(true);
  });

  it('ohne vorhandene HJL keine Prognose (null)', () => {
    const r = computeAbitur([], [], { examSubjectIds: [], examPoints: {}, fullSubjectIds: [], struckKeys: [] }, undefined, [12, 13]);
    expect(r.hjlSchnitt).toBeNull();
    expect(r.prognoseNote).toBeNull();
  });
});
