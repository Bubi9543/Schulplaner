// Geheim-Codes: versteckte Menüs/Features, die über eine bestimmte
// Eingabe im Taschenrechner + "=" geöffnet werden (z.B. Developer-Dashboard).
//
// → Nächster Schritt: hier echte Codes + Aktionen registrieren.
//   Der Taschenrechner ruft trySecretCode() beim Drücken von "=" auf,
//   BEVOR der Ausdruck normal berechnet wird. Trifft ein Code zu, wird
//   die Aktion ausgeführt und die Berechnung übersprungen.

export interface SecretContext {
  navigate: (to: string) => void;
}

export interface SecretCode {
  /** Exakte Eingabe im Display, die den Code auslöst, z.B. "1337". */
  code: string;
  /** Kurzbeschreibung – nur intern/für Debugging. */
  label: string;
  /** Was beim Treffer passiert. */
  run: (ctx: SecretContext) => void;
}

export const SECRET_CODES: SecretCode[] = [
  // 8549 → versteckter "Anstupsen"-Screen: Freunde antippen → Push.
  { code: '8549', label: 'Anstupsen', run: ({ navigate }) => navigate('/anstupsen') },

  // Weitere Codes für den nächsten Schritt (Routen existieren noch nicht):
  // { code: '1337', label: 'Developer-Dashboard', run: ({ navigate }) => navigate('/dev') },
];

/**
 * Prüft, ob die aktuelle Eingabe ein Geheim-Code ist. Führt bei Treffer
 * die Aktion aus und gibt den Code zurück, sonst null.
 */
export function trySecretCode(input: string, ctx: SecretContext): SecretCode | null {
  const norm = input.trim();
  if (!norm) return null;
  const hit = SECRET_CODES.find(c => c.code === norm);
  if (hit) {
    hit.run(ctx);
    return hit;
  }
  return null;
}
