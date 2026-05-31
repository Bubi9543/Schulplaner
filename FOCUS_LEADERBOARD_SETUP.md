# Fokus-Rangliste – Supabase Setup

Die wöchentliche Lern-Rangliste vergleicht die fokussierte Lernzeit mit
Freunden (dieselben Leute wie beim Hausaufgaben-Sharing). Jeder Nutzer
veröffentlicht seine fokussierte Zeit pro ISO-Woche (Montag–Sonntag).

Führe die folgenden SQL-Befehle im Supabase SQL-Editor aus:
**Dashboard → SQL Editor → New query**

> Voraussetzung: Das Homework-Sharing-Setup (`HOMEWORK_SHARING_SETUP.md`)
> wurde bereits ausgeführt – die Rangliste nutzt dieselben `user_profiles`
> und `homeworkSubscriptions` zum Auflösen der Freundesliste.

---

## 1. Tabelle anlegen

```sql
-- ─── study_weekly: fokussierte Lernzeit pro Nutzer & Woche ────────────────
CREATE TABLE IF NOT EXISTS public.study_weekly (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start   date NOT NULL,           -- Montag der Woche (lokal), YYYY-MM-DD
  display_name text NOT NULL DEFAULT 'Anonym',
  total_ms     bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

-- Index für schnelle Wochen-Abfragen (Rangliste lädt nach week_start)
CREATE INDEX IF NOT EXISTS study_weekly_week_idx ON public.study_weekly(week_start);

-- Lern-Streak (aufeinanderfolgende Tage mit Lernzeit), für die Flamme in der
-- Rangliste. Bestehende Installationen einfach diese Zeile nachziehen lassen:
ALTER TABLE public.study_weekly ADD COLUMN IF NOT EXISTS streak integer NOT NULL DEFAULT 0;
```

> Die App funktioniert auch **ohne** die `streak`-Spalte weiter (sie fällt dann
> stillschweigend auf die reine Lernzeit zurück) – aber ohne die Spalte sehen
> Freunde die Flamme nicht. Führe das `ALTER TABLE` aus, um die Streaks zu teilen.

---

## 2. Row Level Security aktivieren

```sql
ALTER TABLE public.study_weekly ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte Nutzer darf alle Wochen-Totals lesen
-- (nötig, damit die Rangliste die Werte der Freunde anzeigen kann).
CREATE POLICY "study_weekly_select"
  ON public.study_weekly FOR SELECT
  TO authenticated
  USING (true);

-- Nur der Besitzer darf seine eigenen Zeilen einfügen …
CREATE POLICY "study_weekly_insert"
  ON public.study_weekly FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- … und aktualisieren (Upsert nach jeder Fokus-Session).
CREATE POLICY "study_weekly_update"
  ON public.study_weekly FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Fertig!

Nach dem Setup:
1. App laden → **Fokus**-Tab
2. Eine Fokus-Session starten (Pomodoro / Timer / Stoppuhr), optional ein Fach
   und einen Test wählen
3. Nach dem Beenden wird die Wochenzeit automatisch veröffentlicht
4. Die **Rangliste** im Fokus-Tab zeigt dich + alle Freunde, sortiert nach
   Lernzeit dieser Woche

### Hinweise
- Die Woche ist immer **Montag–Sonntag** (ISO), unabhängig von der
  persönlichen „Woche beginnt am"-Einstellung – so haben alle Freunde
  dieselbe Wocheneinteilung.
- `total_ms` ist die **fokussierte** Zeit (Pausen im Pomodoro zählen nicht mit).
- Freunde = `homeworkSubscriptions` (dieselben Codes wie beim
  Hausaufgaben-Sharing) + der eigene Account.
- Es wird pro Nutzer & Woche genau **eine Zeile** geführt (Upsert via
  `onConflict: 'user_id,week_start'`).
