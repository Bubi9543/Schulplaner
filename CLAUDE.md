# CLAUDE.md – Schulplaner (Vibecoding-Modus)

Der Nutzer kann **fast nicht programmieren** und liest keinen Code. Er steuert das
Projekt über die fertige App, nicht über den Quellcode. Alle Regeln hier dienen
dazu, das sicher und nachvollziehbar zu machen. Diese Regeln sind nicht
verhandelbar.

## TIER 1 – Immer, ohne Ausnahme

1. **Auf Deutsch erklären.** Erkläre vor jeder Änderung in einfacher Sprache,
   was du tun wirst und warum. Nach jeder Änderung: kurz auf Deutsch, was sich
   für den Nutzer in der App ändert. Kein unnötiger Fachjargon.
2. **Plan zuerst.** Bei allem, was mehr als eine triviale Mini-Änderung ist
   (3+ Schritte oder eine Designentscheidung): erst Plan Mode, Plan erklären,
   auf „ok" warten. Nicht einfach losbauen.
3. **Nachfragen statt raten.** Wenn etwas unklar oder mehrdeutig ist, frag nach.
   Niemals stillschweigend eine Annahme treffen und durchziehen.
4. **Erst lesen, dann reden.** Mach nie Aussagen über Code, den du nicht
   geöffnet und gelesen hast. Erst die Dateien anschauen, dann antworten.
5. **Nichts kaputt machen.** Wenn eine Änderung Risiko birgt, sag es vorher
   deutlich. Lösche nie Daten oder Dateien ohne explizite Bestätigung.

## TIER 2 – Wie gearbeitet wird

### Git ist das Sicherheitsnetz
- Nach **jedem funktionierenden Schritt** automatisch committen, mit einer
  kurzen, verständlichen Beschreibung auf Deutsch.
- Vor riskanten Änderungen daran erinnern, dass man jederzeit zum letzten
  funktionierenden Stand zurück kann.
- Wenn der Nutzer „geh zurück" / „mach rückgängig" sagt: zum letzten guten
  Commit zurück, nicht versuchen, den Fehler von Hand zu flicken.

### Kleine Schritte
- Ein Feature nach dem anderen. Keine riesigen Komplettumbauten auf einmal.
- Nach jedem Schritt sagen, **wie der Nutzer es selbst testen kann**
  („Lade die Seite neu und trag eine Note ein – oben sollte der Schnitt
  erscheinen").

### Selbstkontrolle (weil der Nutzer Code nicht prüfen kann)
- Nach größeren Änderungen die eigene Arbeit mit frischem Blick durchgehen und
  ehrlich sagen, ob etwas fehlt oder Probleme machen könnte.
- Wo sinnvoll, Tests schreiben und laufen lassen, und das Ergebnis
  (grün/rot) auf Deutsch berichten – statt dass der Nutzer alles manuell
  durchklicken muss.

### Wenn der Nutzer einen Fehler meldet
- Er beschreibt, was er **sieht** („Button reagiert nicht", „Note doppelt
  gezählt"), nicht den technischen Fehler. Du findest die Ursache.
- Finde die **echte Ursache**, keine schnellen Pflaster oder Workarounds.

## TIER 3 – Code-Stil

- So einfach wie möglich. Nur das anfassen, was nötig ist.
- Keine temporären Hacks, keine auskommentierten Code-Leichen.
- Verständliche Namen, damit der Code auch für Außenstehende lesbar bleibt.

## Projekt-Kontext

- **Was:** Schulplaner-Web-App (Schulmanager) mit bayerischer Gymnasium-
  Notenlogik, inkl. Oberstufe-/Abitur-Berechnung.
- **Wichtige Regeln zur Notenlogik:** Bayern G9, Oberstufe/Abitur korrekt
  gewichtet.
- **Aktueller Stand / TODO:** das nächste mal bitte selber eintragen.

## Lessons (wächst mit der Zeit)

Nach jeder Korrektur durch den Nutzer hier eine kurze Regel ergänzen, damit
derselbe Fehler nicht wieder passiert.


