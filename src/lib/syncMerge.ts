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
  /** Vollständige, zusammengeführte Liste – dieser Stand soll lokal gespeichert werden. */
  merged: T[];
  /** Einträge, deren lokale Version gewonnen hat (neu oder neuer) – die müssen hochgeladen werden. */
  toUpload: T[];
}

/**
 * Führt lokale und Cloud-Einträge zusammen. Regeln:
 * - Gibt es einen Eintrag auf beiden Seiten, gewinnt der mit dem größeren
 *   `updatedAt`. Bei Gleichstand gewinnt die Cloud (vermeidet unnötige Uploads).
 * - Nur lokal vorhanden → behalten und hochladen (z. B. offline erstellt).
 * - Nur in der Cloud vorhanden → übernehmen.
 *
 * Wichtig: Ist die Cloud-Liste leer (z. B. weil der Abruf fehlschlug), bleiben
 * dadurch alle lokalen Einträge erhalten – es wird also NIE blind gelöscht.
 *
 * Der Gewinner bekommt immer einen konkreten Zahlen-Zeitstempel, damit ihn die
 * Datenbank-Automatik beim Speichern nicht versehentlich „neu" stempelt.
 */
export function mergeByUpdatedAt<T extends Syncable>(local: T[], cloud: T[]): MergeResult<T> {
  const ts = (x: T) => x.updatedAt ?? 0;
  const localById = new Map(local.map(l => [l.id, l]));
  const cloudById = new Map(cloud.map(c => [c.id, c]));

  const merged: T[] = [];
  const toUpload: T[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const l = localById.get(id);
    const c = cloudById.get(id);

    let winner: T;
    let localWon: boolean;
    if (l && c) {
      localWon = ts(l) > ts(c);
      winner = localWon ? l : c;
    } else if (l) {
      winner = l;
      localWon = true;
    } else {
      winner = c as T;
      localWon = false;
    }

    const normalized = winner.updatedAt == null ? { ...winner, updatedAt: ts(winner) } : winner;
    merged.push(normalized);
    if (localWon) toUpload.push(normalized);
  }

  return { merged, toUpload };
}
