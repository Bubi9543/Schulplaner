/**
 * Konfliktlösung für den Cloud-Sync: „neuester Stand gewinnt".
 *
 * Diese Datei enthält bewusst KEINE Datenbank- oder Supabase-Abhängigkeiten,
 * damit die Logik isoliert und automatisch testbar ist (siehe syncMerge.test.ts).
 *
 * Hintergrund: Früher hat jedes Gerät beim Start seinen kompletten lokalen
 * Stand blind hochgeladen und danach die Cloud blind über die lokalen Daten
 * geschrieben. Ein veraltetes Gerät konnte so neuere Daten überschreiben –
 * dabei sind z. B. Lernchecklisten verloren gegangen. Stattdessen führen wir
 * lokalen und Cloud-Stand jetzt pro Eintrag anhand des Zeitstempels zusammen.
 */

/** Minimal-Form, die ein synchronisierbarer Eintrag erfüllen muss. */
export interface Syncable {
  id: string;
  /** ms-Timestamp der letzten Änderung. Fehlt er, gilt der Eintrag als uralt. */
  updatedAt?: number;
}

export interface MergeResult<T> {
  /** Vollständige, zusammengeführte Liste (für Übersicht/Tests). */
  merged: T[];
  /** Einträge, deren lokale Version gewonnen hat (neu oder neuer) – die müssen in die Cloud hochgeladen werden. */
  toUpload: T[];
  /**
   * Einträge, deren Cloud-Version gewonnen hat (neuer oder nur in der Cloud) –
   * nur die müssen lokal gespeichert werden. Lokale Gewinner liegen ja schon
   * in der Datenbank und werden bewusst NICHT erneut geschrieben.
   */
  toApplyLocal: T[];
}

/**
 * Führt lokale und Cloud-Einträge zusammen. Regeln pro Eintrag (über die id):
 * - Auf beiden Seiten vorhanden → der mit dem größeren `updatedAt` gewinnt.
 *     · Lokal neuer  → hochladen (toUpload), lokal liegt er schon.
 *     · Cloud neuer  → lokal übernehmen (toApplyLocal).
 *     · Gleichstand  → bereits synchron, nichts tun.
 * - Nur lokal vorhanden (z. B. offline erstellt) → behalten und hochladen.
 * - Nur in der Cloud vorhanden → lokal übernehmen.
 *
 * Wichtig: Ist die Cloud-Liste leer (z. B. weil der Abruf fehlschlug), bleiben
 * alle lokalen Einträge erhalten – es wird also NIE blind gelöscht.
 *
 * Lokale Gewinner mit fehlendem Zeitstempel bekommen einen konkreten Wert,
 * damit die Datenbank-Automatik sie beim erneuten Speichern nicht „neu" stempelt.
 */
export function mergeByUpdatedAt<T extends Syncable>(local: T[], cloud: T[]): MergeResult<T> {
  const ts = (x: T) => x.updatedAt ?? 0;
  const localById = new Map(local.map(l => [l.id, l]));
  const cloudById = new Map(cloud.map(c => [c.id, c]));

  const merged: T[] = [];
  const toUpload: T[] = [];
  const toApplyLocal: T[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const l = localById.get(id);
    const c = cloudById.get(id);

    if (l && c) {
      if (ts(l) > ts(c)) {
        const norm = l.updatedAt == null ? { ...l, updatedAt: ts(l) } : l;
        merged.push(norm);
        toUpload.push(norm);
      } else if (ts(l) < ts(c)) {
        merged.push(c);
        toApplyLocal.push(c);
      } else {
        // Gleichstand: bereits synchron, keine Aktion nötig.
        merged.push(c);
      }
    } else if (l) {
      const norm = l.updatedAt == null ? { ...l, updatedAt: ts(l) } : l;
      merged.push(norm);
      toUpload.push(norm);
    } else {
      merged.push(c as T);
      toApplyLocal.push(c as T);
    }
  }

  return { merged, toUpload, toApplyLocal };
}
