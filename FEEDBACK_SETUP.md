# Feedback → Google Sheet Setup

Das Feedback-Formular in den Einstellungen schickt Daten an ein Google Apps Script,
das die Einträge in ein Google Sheet schreibt.

## 1. Google Sheet anlegen

1. Neues Google Sheet erstellen: [sheets.new](https://sheets.new)
2. Erste Zeile (Header) eintragen:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | Zeitstempel | Typ | Titel | Beschreibung | Email | Name | Schule |

3. Sheet-Name: `Feedback` (unten im Tab)

## 2. Apps Script erstellen

1. Im Sheet: **Erweiterungen → Apps Script**
2. Den generierten Code komplett ersetzen mit:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Feedback');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  }

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Invalid JSON' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.type || '',
    data.title || '',
    data.description || '',
    data.email || '',
    data.name || '',
    data.school || '',
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Speichern** (Strg+S)

## 3. Als Web-App deployen

1. **Deploy → Neue Bereitstellung**
2. Typ: **Web-App**
3. Einstellungen:
   - Beschreibung: `Schulplaner Feedback`
   - Ausführen als: **Ich** (dein Google-Account)
   - Zugriff: **Jeder** (auch ohne Google-Konto)
4. **Bereitstellen** klicken
5. **URL kopieren** — sieht so aus:
   `https://script.google.com/macros/s/AKfycb.../exec`

## 4. URL in der App hinterlegen

In deiner `.env` (oder Vercel Environment Variables):

```
VITE_FEEDBACK_SHEET_URL=https://script.google.com/macros/s/AKfycb.../exec
```

Bei Vercel: Settings → Environment Variables → `VITE_FEEDBACK_SHEET_URL` → die URL eintragen.

Danach neu deployen — fertig.
