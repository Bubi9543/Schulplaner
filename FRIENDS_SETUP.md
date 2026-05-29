# Freunde-System v2 – Supabase Setup

Das neue Freunde-System nutzt **gegenseitige Freundschaften mit Anfragen**, **Profilbilder**
und **friend-basiertes Stundenplan-Teilen**. Führe die folgenden Schritte im Supabase-Dashboard
aus.

> Voraussetzung: `HOMEWORK_SHARING_SETUP.md` (Tabelle `user_profiles`) und
> `FOCUS_LEADERBOARD_SETUP.md` (`study_weekly`) wurden bereits ausgeführt.

---

## 1. SQL (Dashboard → SQL Editor → New query)

```sql
-- ─── Profilbild-Spalte ────────────────────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ─── friendships: Anfrage UND Freundschaft in einer Tabelle ────────────────
-- status='pending'  → offene Anfrage (requester → addressee)
-- status='accepted' → bestätigte Freundschaft
CREATE TABLE IF NOT EXISTS public.friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at   timestamptz DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester <> addressee)
);

-- Genau ein Paar – egal aus welcher Richtung die Anfrage kam.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON public.friendships (LEAST(requester, addressee), GREATEST(requester, addressee));

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee);

-- ─── shared_schedules: friend-basierter Stundenplan (eine Zeile pro Nutzer) ─
CREATE TABLE IF NOT EXISTS public.shared_schedules (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
```

---

## 2. Row Level Security

```sql
-- ─── friendships RLS ───────────────────────────────────────────────────────
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Lesen: beide Beteiligten sehen die Zeile (Freundesliste + eigene Anfragen).
CREATE POLICY "friendships_select"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester OR auth.uid() = addressee);

-- Anlegen: nur als Absender einer Anfrage.
CREATE POLICY "friendships_insert"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester);

-- Annehmen: nur der Empfänger darf die Anfrage aktualisieren (status → accepted).
CREATE POLICY "friendships_update"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee)
  WITH CHECK (auth.uid() = addressee);

-- Ablehnen / Zurückziehen / Entfreunden: beide dürfen löschen.
CREATE POLICY "friendships_delete"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester OR auth.uid() = addressee);

-- ─── shared_schedules RLS ──────────────────────────────────────────────────
ALTER TABLE public.shared_schedules ENABLE ROW LEVEL SECURITY;

-- Lesen: jeder eingeloggte Nutzer (der Freundes-Check passiert client-seitig
-- über die Freundesliste; der Payload enthält keine sensiblen Daten).
CREATE POLICY "shared_schedules_select"
  ON public.shared_schedules FOR SELECT
  TO authenticated
  USING (true);

-- Schreiben: nur der Besitzer.
CREATE POLICY "shared_schedules_write"
  ON public.shared_schedules FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 3. Avatar-Storage-Bucket

**Storage → Create new bucket**
- Name: `avatars`
- **Public bucket: ✅ an** (Profilbilder sind nicht sensibel; so genügt eine öffentliche URL
  ohne Signed-URL-Refresh, und Freunde sehen das Bild in Liste & Rangliste sofort).

Dann die Storage-Policies (SQL Editor):

```sql
-- Lesen: öffentlich (Bucket ist public – diese Policy macht es explizit).
CREATE POLICY "avatars_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Schreiben/Ändern/Löschen: nur im eigenen Ordner (avatars/<user_id>/…).
CREATE POLICY "avatars_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 4. Realtime (optional)

Für sofortige Anfrage-/Freundschafts-Updates:
**Database → Replication → Tables** → `friendships` aktivieren.
(Ohne Realtime werden Freunde/Anfragen beim Öffnen des Freunde-Tabs sowie nach jeder Aktion neu geladen.)

---

## Fertig!

Danach im App-Tab **Freunde**:
1. Profilbild hochladen + Anzeigename setzen, eigenen Freundecode kopieren.
2. Code eines Freundes eingeben → **Freundschaftsanfrage** wird gesendet.
3. Der Freund nimmt die Anfrage an → ihr seid gegenseitig Freunde.
4. Hausaufgaben- und Stundenplan-Teilen + die wöchentliche Lern-Rangliste laufen automatisch
   über die Freundesliste.

### Hinweise
- Eine Freundschaft = **eine** Zeile in `friendships` (Paar-Unique-Index, richtungsunabhängig).
- Ablehnen/Zurückziehen/Entfreunden = Zeile löschen → man kann sich später erneut anfragen.
- Stundenplan-Teilen ist friend-basiert (kein 4-stelliger Code mehr nötig); der alte
  Code-Flow bleibt nur fürs Onboarding/Fremde erhalten.
