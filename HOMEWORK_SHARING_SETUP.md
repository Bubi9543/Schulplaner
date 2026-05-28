# Homework Sharing – Supabase Setup

Führe die folgenden SQL-Befehle im Supabase SQL-Editor aus:
**Dashboard → SQL Editor → New query**

---

## 1. Tabellen anlegen

```sql
-- ─── user_profiles: permanente 6-stellige Freundecodes ───────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Anonym',
  friend_code text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Index für schnelle Code-Lookups
CREATE INDEX IF NOT EXISTS user_profiles_code_idx ON public.user_profiles(friend_code);

-- ─── shared_tasks: geteilte Hausaufgaben ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_tasks (
  id            text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  subject_name  text,
  kind          text NOT NULL DEFAULT 'hausaufgabe',
  due_date      bigint,
  created_at    bigint NOT NULL,
  updated_at    timestamptz DEFAULT now()
);

-- Indices für effiziente Abfragen
CREATE INDEX IF NOT EXISTS shared_tasks_owner_idx ON public.shared_tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS shared_tasks_due_idx   ON public.shared_tasks(due_date);
```

---

## 2. Row Level Security aktivieren

```sql
-- ─── user_profiles RLS ───────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Jeder eingeloggte Nutzer kann alle Profile lesen (für Code-Lookup)
CREATE POLICY "profiles_select"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Nur der Besitzer kann sein eigenes Profil schreiben
CREATE POLICY "profiles_insert"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── shared_tasks RLS ────────────────────────────────────────────────────
ALTER TABLE public.shared_tasks ENABLE ROW LEVEL SECURITY;

-- Besitzer: vollständiger Zugriff
CREATE POLICY "tasks_owner_all"
  ON public.shared_tasks FOR ALL
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Andere eingeloggte Nutzer: nur lesen (für Abonnenten)
CREATE POLICY "tasks_read"
  ON public.shared_tasks FOR SELECT
  TO authenticated
  USING (true);
```

---

## 3. Realtime aktivieren (optional, für spätere Push-Updates)

Im Supabase Dashboard:
**Database → Replication → Tables** → `shared_tasks` aktivieren

---

## Fertig!

Nach dem Setup:
1. App laden → **Einstellungen → Freunde**
2. „Code anzeigen" klicken → Supabase legt automatisch ein Profil an
3. Code an Mitschüler schicken → die abonnieren dich
4. Hausaufgaben erstellen und „Teilen"-Toggle aktivieren

### Hinweise
- Codes sind **permanent** (nicht wie der 7-Tage-Stundenplan-Code)
- Nur Aufgaben mit `kind = 'hausaufgabe'` und aktiviertem Toggle werden geteilt
- Abonnenten sehen Tasks der letzten 60 Tage + alle zukünftigen
- SubjectFilter im Abo: `null` = alle Fächer; `[]` = keine; `["Mathe", "Englisch"]` = nur diese
