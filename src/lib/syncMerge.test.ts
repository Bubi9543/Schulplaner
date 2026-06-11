import { describe, it, expect } from 'vitest';
import { mergeByUpdatedAt } from './syncMerge';

interface Row { id: string; updatedAt?: number; label?: string }

describe('mergeByUpdatedAt', () => {
  it('neuere lokale Version gewinnt und wird hochgeladen (nicht lokal neu geschrieben)', () => {
    const local: Row[] = [{ id: 'a', updatedAt: 200, label: 'lokal-neu' }];
    const cloud: Row[] = [{ id: 'a', updatedAt: 100, label: 'cloud-alt' }];
    const { merged, toUpload, toApplyLocal } = mergeByUpdatedAt(local, cloud);
    expect(merged).toEqual([{ id: 'a', updatedAt: 200, label: 'lokal-neu' }]);
    expect(toUpload).toEqual([{ id: 'a', updatedAt: 200, label: 'lokal-neu' }]);
    expect(toApplyLocal).toEqual([]);
  });

  it('neuere Cloud-Version gewinnt: lokal übernehmen, nicht hochladen', () => {
    const local: Row[] = [{ id: 'a', updatedAt: 100, label: 'lokal-alt' }];
    const cloud: Row[] = [{ id: 'a', updatedAt: 300, label: 'cloud-neu' }];
    const { merged, toUpload, toApplyLocal } = mergeByUpdatedAt(local, cloud);
    expect(merged).toEqual([{ id: 'a', updatedAt: 300, label: 'cloud-neu' }]);
    expect(toUpload).toEqual([]);
    expect(toApplyLocal).toEqual([{ id: 'a', updatedAt: 300, label: 'cloud-neu' }]);
  });

  it('genau dieser Schul-Fall: alter lokaler Stand überschreibt die neuere Cloud NICHT', () => {
    // Schul-Gerät hatte einen alten Stand (Checkliste leer), zu Hause war sie befüllt.
    const local: Row[] = [{ id: 'note1', updatedAt: 1000, label: 'checkliste-leer' }];
    const cloud: Row[] = [{ id: 'note1', updatedAt: 5000, label: 'checkliste-voll' }];
    const { merged } = mergeByUpdatedAt(local, cloud);
    expect(merged[0].label).toBe('checkliste-voll');
  });

  it('nur lokal vorhanden (offline erstellt) → behalten und hochladen', () => {
    const local: Row[] = [{ id: 'b', updatedAt: 50, label: 'offline' }];
    const cloud: Row[] = [];
    const { merged, toUpload, toApplyLocal } = mergeByUpdatedAt(local, cloud);
    expect(merged).toEqual([{ id: 'b', updatedAt: 50, label: 'offline' }]);
    expect(toUpload).toEqual([{ id: 'b', updatedAt: 50, label: 'offline' }]);
    expect(toApplyLocal).toEqual([]);
  });

  it('nur in der Cloud vorhanden → lokal übernehmen, nicht hochladen', () => {
    const local: Row[] = [];
    const cloud: Row[] = [{ id: 'c', updatedAt: 50, label: 'aus-cloud' }];
    const { merged, toUpload, toApplyLocal } = mergeByUpdatedAt(local, cloud);
    expect(merged).toEqual([{ id: 'c', updatedAt: 50, label: 'aus-cloud' }]);
    expect(toUpload).toEqual([]);
    expect(toApplyLocal).toEqual([{ id: 'c', updatedAt: 50, label: 'aus-cloud' }]);
  });

  it('leere Cloud löscht NICHT die lokalen Daten', () => {
    const local: Row[] = [
      { id: 'a', updatedAt: 1 },
      { id: 'b', updatedAt: 2 },
    ];
    const { merged, toUpload, toApplyLocal } = mergeByUpdatedAt(local, []);
    expect(merged).toHaveLength(2);
    expect(toUpload).toHaveLength(2);
    expect(toApplyLocal).toEqual([]);
  });

  it('Gleichstand: bereits synchron – kein Upload, kein lokales Schreiben', () => {
    const local: Row[] = [{ id: 'a', updatedAt: 100, label: 'lokal' }];
    const cloud: Row[] = [{ id: 'a', updatedAt: 100, label: 'cloud' }];
    const { toUpload, toApplyLocal } = mergeByUpdatedAt(local, cloud);
    expect(toUpload).toEqual([]);
    expect(toApplyLocal).toEqual([]);
  });

  it('fehlender Zeitstempel gilt als uralt und bekommt einen konkreten Wert', () => {
    const local: Row[] = [{ id: 'a', label: 'ohne-ts' }];
    const cloud: Row[] = [];
    const { merged } = mergeByUpdatedAt(local, cloud);
    expect(merged[0].updatedAt).toBe(0);
  });

  it('fehlender Zeitstempel verliert gegen vorhandenen', () => {
    const local: Row[] = [{ id: 'a', label: 'ohne-ts' }];
    const cloud: Row[] = [{ id: 'a', updatedAt: 1, label: 'mit-ts' }];
    const { merged } = mergeByUpdatedAt(local, cloud);
    expect(merged[0].label).toBe('mit-ts');
  });
});
