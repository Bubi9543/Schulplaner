# Notenapp – Daten-Import-Format

Dieses Dokument beschreibt das **JSON-Format** für den Daten-Import in die Notenapp ([schulplaner.conor.at](https://schulplaner.conor.at)). Es ist so geschrieben, dass du es einer KI (Claude, ChatGPT, Gemini …) als Kontext geben kannst, damit sie dir aus deinen Bestandsdaten (Screenshots, Tabellen, Notizen, andere App-Exporte …) eine importfähige Datei generiert.

> **Wichtig:** Beim Import werden **ALLE bestehenden Daten** in der App ersetzt. Wenn du also schon Daten in der App hast, **exportier sie vorher** (Einstellungen → Daten → Komplett-Export) und führ die Dateien manuell zusammen.

---

## So nutzt du diesen Guide mit Claude/ChatGPT

1. Diesen Guide **komplett kopieren** und in den Chat einfügen.
2. Deine Quelldaten anhängen (Screenshot vom Notenheft, Excel-Export, Beschreibung deiner Fächer …).
3. Claude bitten: *„Erstell mir aus diesen Daten eine `notenapp-import.json` exakt nach dem Schema oben."*
4. Datei abspeichern, in der App unter **Einstellungen → Daten → Import aus Datei** hochladen.

---

## Struktur (Top-Level)

```jsonc
{
  "version": 3,
  "exportedAt": "2025-09-01T08:00:00.000Z",
  "settings": { /* AppSettings, optional */ },
  "schoolYears": [ /* SchoolYear[] */ ],
  "subjects": [ /* Subject[] */ ],
  "grades": [ /* Grade[] */ ],
  "tasks": [ /* AppTask[] */ ],
  "lessons": [ /* Lesson[] */ ]
}
```

- `version`: aktuell **3**. Wenn `version` höher ist, versucht die App trotzdem zu importieren.
- `exportedAt`: ISO-Timestamp, dient nur der Übersicht.
- Alle Listen sind optional, fehlende Listen werden als leer behandelt.
- `settings` kann komplett weggelassen werden (oder `null`) – dann werden Standardwerte verwendet bzw. bestehende Settings beibehalten. **Wichtig:** Wenn du eine frische App-Installation importierst, sollte mindestens `{ "onboarded": true, "system": "bayern" }` in `settings` stehen, sonst landet der User wieder im Onboarding.

## Settings (Minimal)

```jsonc
{
  "onboarded": true,         // sonst wird das Onboarding gezeigt
  "system": "bayern",        // Standard-Notensystem für neue Fächer
  "name": "Max Mustermann",  // optional
  "demo": false
}
```

Alle weiteren Felder (theme, colorTheme, density, …) sind optional und nutzen Defaults.

---

## SchoolYear

```jsonc
{
  "id": "y1",                       // beliebige eindeutige String-ID
  "name": "2025/26",                // sichtbarer Name
  "startDate": 1756684800000,       // Beginn als ms-Timestamp (oder ISO-String wird akzeptiert)
  "endDate": 1788220800000,         // optional - laufend wenn weggelassen
  "active": true,                   // exakt EIN Jahr sollte active=true sein
  "createdAt": 1756684800000        // ms-Timestamp, optional (Default: jetzt)
}
```

**Mindestens ein Schuljahr ist Pflicht.** Wenn keines geliefert wird, legt die App ein Default-Jahr an und ordnet alles dort ein.

---

## Subject (Fach)

```jsonc
{
  "id": "s1",                       // beliebige eindeutige String-ID
  "name": "Mathematik",             // Pflicht
  "short": "M",                     // 1-3 Buchstaben
  "color": "#6366f1",               // Hex-Code
  "category": "hauptfach",          // siehe unten
  "system": "bayern",               // siehe unten
  "teacher": "Frau Bauer",          // optional
  "room": "B204",                   // optional
  "targetAverage": 2.5,             // optional, Wunschnote
  "schoolYearId": "y1",             // Pflicht: muss zu einem SchoolYear passen
  "createdAt": 1756684800000        // optional
}
```

### `category`
- `"hauptfach"` → Schulaufgaben zählen doppelt: `(SA-Schnitt × 2 + Rest-Schnitt) / 3`
- `"hauptfach-1zu1"` → 1:1 mit Rest: `(SA-Schnitt + Rest-Schnitt) / 2` (typisch für Physik, Chemie in Bayern)
- `"nebenfach"` → einfacher gewichteter Mittelwert über alle Noten

### `system`
- `"bayern"` → Noten 1–6 (ganze Zahlen)
- `"oberstufe"` → Punkte 0–15 (Oberstufe/Abitur)
- `"austria"` → Noten 1–5
- `"custom"` → freie Skala

---

## Grade (Note)

```jsonc
{
  "id": "g1",                       // beliebige eindeutige String-ID
  "subjectId": "s1",                // Pflicht: muss zu einem Subject passen
  "value": 2,                       // Notenwert (Zahl)
  "kind": "schulaufgabe",           // siehe unten
  "title": "1. Schulaufgabe",       // optional
  "date": 1729900800000,            // ms-Timestamp oder ISO-String
  "weight": 1,                      // Legacy-Feld - immer 1 setzen
  "weightMultiplier": 1.5,          // optional - 0.5, 1, 1.5, 2 oder beliebige Zahl
  "isPending": false,               // true = Note steht noch aus (Termin)
  "schoolYearId": "y1"              // wird sonst vom Subject geerbt
}
```

### `kind`
Bestimmt ob die Note als „große" Leistung zählt (Schulaufgabe/Klausur) oder „kleine" (Rest):
- **Groß (zählt in der Hauptfach-Formel doppelt bzw. 1:1):**
  - `"schulaufgabe"` – Schulaufgabe (Bayern)
  - `"klausur"` – Klausur (Oberstufe)
- **Klein (kleine Leistungsnachweise):**
  - `"stegreif"` – Stegreifaufgabe / Ex
  - `"muendlich"` – Mündliche Note / Abfrage
  - `"referat"` – Referat
  - `"projekt"` – Projekt
  - `"sonstige"` – sonstige Leistung

### `weightMultiplier`
- Default ist `1`. Wirkt **innerhalb** der Gruppe (Schulaufgaben oder Rest).
- Beispiel: Eine Schulaufgabe mit `value: 2` und `weightMultiplier: 0.5` + eine mit `value: 5` und `weightMultiplier: 1` ergeben Schulaufgaben-Schnitt **4** (statt 3.5).

### `value`-Werte je System
- `bayern`: ganze Zahlen 1–6 (1 = sehr gut)
- `oberstufe`: 0–15 (15 = sehr gut)
- `austria`: 1–5

### `value` bei `isPending: true`
Wenn die Note noch aussteht, ist `value` irrelevant – setz ihn auf `0`.

---

## AppTask (Aufgabe)

```jsonc
{
  "id": "t1",                       // beliebige eindeutige String-ID
  "title": "Übungen S. 42-45",      // Pflicht
  "description": "Nr. 1-7",         // optional
  "subjectId": "s1",                // optional - Aufgabe kann fachlos sein
  "kind": "hausaufgabe",            // siehe unten
  "dueDate": 1729900800000,         // optional, ms-Timestamp
  "reminder": 1729814400000,        // optional, ms-Timestamp
  "done": false,
  "doneAt": null,                   // ms-Timestamp wenn erledigt
  "priority": 2,                    // 1=niedrig, 2=normal, 3=hoch
  "createdAt": 1728604800000,
  "schoolYearId": "y1"              // wird sonst vom Subject geerbt
}
```

### `kind`
- `"hausaufgabe"` – Hausaufgabe
- `"test"` – Test/Kurzarbeit (Termin)
- `"schulaufgabe"` – Schulaufgaben-Termin
- `"projekt"` – Projekt
- `"todo"` – Allgemeines Todo

---

## Lesson (Stundenplan-Eintrag)

```jsonc
{
  "id": "l1",                       // beliebige eindeutige String-ID
  "subjectId": "s1",                // Pflicht
  "weekday": 1,                     // 0=Sonntag, 1=Montag, ..., 6=Samstag
  "start": "08:00",                 // HH:MM
  "end": "08:45",                   // HH:MM
  "room": "B204",                   // optional
  "weekParity": "ALL",              // "A" = A-Woche, "B" = B-Woche, "ALL" = jede Woche (Default)
  "schoolYearId": "y1"              // wird sonst vom Subject geerbt
}
```

---

## Vollständiges Mini-Beispiel

```json
{
  "version": 3,
  "exportedAt": "2025-10-15T08:00:00.000Z",
  "schoolYears": [
    { "id": "y1", "name": "2025/26", "startDate": 1756684800000, "active": true, "createdAt": 1756684800000 }
  ],
  "subjects": [
    { "id": "s_math", "name": "Mathematik", "short": "M", "color": "#6366f1", "category": "hauptfach", "system": "bayern", "schoolYearId": "y1", "createdAt": 1756684800000, "teacher": "Frau Bauer", "room": "B204", "targetAverage": 2 },
    { "id": "s_phys", "name": "Physik",     "short": "Ph","color": "#3b82f6", "category": "hauptfach-1zu1", "system": "bayern", "schoolYearId": "y1", "createdAt": 1756684800000 },
    { "id": "s_geo",  "name": "Geographie", "short": "Geo","color":"#84cc16", "category": "nebenfach", "system": "bayern", "schoolYearId": "y1", "createdAt": 1756684800000 }
  ],
  "grades": [
    { "id": "g1", "subjectId": "s_math", "value": 2, "kind": "schulaufgabe", "title": "1. SA",       "date": 1729900800000, "weight": 1, "schoolYearId": "y1" },
    { "id": "g2", "subjectId": "s_math", "value": 3, "kind": "muendlich",    "title": "Abfrage",     "date": 1730505600000, "weight": 1, "weightMultiplier": 1.5, "schoolYearId": "y1" },
    { "id": "g3", "subjectId": "s_phys", "value": 2, "kind": "schulaufgabe", "title": "1. SA",       "date": 1731110400000, "weight": 1, "schoolYearId": "y1" }
  ],
  "tasks": [
    { "id": "t1", "title": "Übungen S. 42", "subjectId": "s_math", "kind": "hausaufgabe", "dueDate": 1731715200000, "done": false, "priority": 2, "createdAt": 1731628800000, "schoolYearId": "y1" }
  ],
  "lessons": [
    { "id": "l1", "subjectId": "s_math", "weekday": 1, "start": "08:00", "end": "08:45", "room": "B204", "weekParity": "ALL", "schoolYearId": "y1" },
    { "id": "l2", "subjectId": "s_math", "weekday": 3, "start": "10:40", "end": "11:25", "room": "B204", "weekParity": "ALL", "schoolYearId": "y1" },
    { "id": "l3", "subjectId": "s_phys", "weekday": 2, "start": "09:50", "end": "10:35", "weekParity": "ALL", "schoolYearId": "y1" }
  ]
}
```

---

## Regeln für die KI beim Generieren

Wenn du eine KI bittest, dir eine Import-Datei zu erzeugen, gib ihr diese Hinweise mit:

1. **JSON-Syntax muss korrekt sein** – kein trailing comma, doppelte Anführungszeichen, keine JS-Kommentare im finalen Output.
2. **IDs müssen eindeutig** innerhalb ihres Typs sein (`s1`, `s2`, …). Strings mit beliebigem Inhalt sind ok, solange sie konsistent referenziert werden.
3. **Referenzen prüfen**: jedes `subjectId` muss in `subjects[].id` existieren, jedes `schoolYearId` in `schoolYears[].id`.
4. **Daten als ms-Timestamp** (`Date.now()`-Style) oder ISO-String. ISO-Strings funktionieren überall.
5. **Notensystem konsistent**: Bayern-Fächer haben ganzzahlige Noten 1–6, Oberstufe 0–15.
6. **Kategorie korrekt setzen**: Mathe/Deutsch/Sprachen meist `"hauptfach"`, Physik/Chemie in Bayern meist `"hauptfach-1zu1"`, Sport/Kunst/Musik/Geo/Geschichte/Bio meist `"nebenfach"`.
7. **Fehlende Felder weglassen** statt `null` – außer wo explizit `null` erlaubt ist.

### Standard-Farben (sinnvoll für Fächer)

```
Mathematik #6366f1   Deutsch    #ec4899   Englisch   #06b6d4   Latein     #a855f7
Französisch #f43f5e  Physik     #3b82f6   Chemie     #14b8a6   Biologie   #10b981
Geschichte #f59e0b   Geographie #84cc16   Kunst      #f43f5e   Musik      #8b5cf6
Sport      #f97316   Informatik #6366f1   Religion   #fbbf24   Ethik      #f97316
```

---

## Beispielprompt für Claude/ChatGPT

> Ich migriere aus *[deine alte App]* in die Notenapp. Generier mir eine `import.json` nach dem unten beschriebenen Schema. Hier meine Daten:
>
> *[Hier deine Daten einfügen: Liste der Fächer, Noten, Stundenplan, …]*
>
> Stell sicher:
> - Schuljahr 2025/26 ist aktiv.
> - Alle `id`s sind eindeutig.
> - Alle `subjectId`-Referenzen passen.
> - Notenwerte sind ganzzahlig (Bayern 1–6).
> - Kategorien stimmen: Mathe/Deutsch/Sprachen → `"hauptfach"`, Physik/Chemie → `"hauptfach-1zu1"`, Rest → `"nebenfach"`.
>
> Gib nur das fertige JSON aus, kein Drumherum.
