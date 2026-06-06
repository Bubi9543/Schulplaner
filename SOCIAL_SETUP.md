# Social-Feed – Supabase-Setup

Damit die **Social-Seite** (`/social`) funktioniert, brauchst du drei Tabellen,
deren RLS-Policies und einen Storage-Bucket für die Lern-Fotos.

> Voraussetzung: `user_profiles` (aus `HOMEWORK_SHARING_SETUP.md`) und
> `friendships` (aus `FRIENDS_SETUP.md`) existieren bereits.
>
> Sichtbarkeit: Wie bei `shared_schedules` ist `SELECT` für alle eingeloggten
> Nutzer erlaubt – die Freundes-Filterung passiert clientseitig (der Feed lädt
> nur Posts von `[ich, ...meine Freunde]`). Geschrieben werden darf nur, was
> einem selbst gehört.

---

## 1. Tabellen + RLS

Im **SQL-Editor** ausführen:

```sql
-- ─── Posts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject    text,
  caption    text NOT NULL DEFAULT '',
  photo_url  text,
  study_min  integer NOT NULL DEFAULT 0,
  streak     integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_user_created_idx
  ON public.social_posts (user_id, created_at DESC);

-- ─── Reaktionen (genau eine pro Nutzer & Post) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_reactions (
  post_id    uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS social_reactions_post_idx ON public.social_reactions (post_id);

-- ─── Kommentare ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_comments_post_idx ON public.social_comments (post_id, created_at);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.social_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments  ENABLE ROW LEVEL SECURITY;

-- Posts: lesen alle Eingeloggten (Freunde-Filter im Client); schreiben nur als Owner.
CREATE POLICY "social_posts_select" ON public.social_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_posts_insert" ON public.social_posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_posts_update" ON public.social_posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_posts_delete" ON public.social_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Reaktionen: lesen alle; eigene anlegen/ändern/löschen.
CREATE POLICY "social_reactions_select" ON public.social_reactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_reactions_write" ON public.social_reactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Kommentare: lesen alle; eigene anlegen/löschen. Zusätzlich darf der Post-Besitzer
-- Kommentare auf seinem Post löschen (Moderation).
CREATE POLICY "social_comments_select" ON public.social_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_comments_insert" ON public.social_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_comments_delete" ON public.social_comments
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT p.user_id FROM public.social_posts p WHERE p.id = post_id)
  );
```

---

## 2. Foto-Bucket

**Storage → Create new bucket**
- Name: `social-photos`
- **Public bucket: ✅ an** (Lern-Fotos werden mit Freunden geteilt; öffentliche
  URL genügt, kein Signed-URL-Refresh nötig).

Dann die Storage-Policies (SQL-Editor):

```sql
-- Lesen: öffentlich.
CREATE POLICY "social_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-photos');

-- Schreiben/Löschen: nur im eigenen Ordner (social-photos/<user_id>/…).
CREATE POLICY "social_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "social_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'social-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 3. Realtime (optional)

Wenn Posts/Reaktionen/Kommentare bei Freunden live auftauchen sollen, unter
**Database → Replication → Tables** `social_posts`, `social_reactions` und
`social_comments` aktivieren. Aktuell lädt der Feed beim Öffnen und nach eigenen
Aktionen neu (Aktualisieren-Button oben rechts) – Realtime ist nicht nötig.

---

## Notizen

- **Eine Reaktion pro Person & Post** (PK `post_id, user_id`): eine neue Reaktion
  ersetzt die alte; dasselbe Emoji erneut antippen = abwählen.
- Fotos liegen unter `social-photos/<user_id>/<uuid>.jpg`, client-seitig auf max.
  1440 px (lange Kante) als JPEG komprimiert.
- Beim Löschen eines Posts werden Reaktionen, Kommentare (ON DELETE CASCADE) und
  – noch nicht automatisch – die Foto-Datei entfernt. (Die Datei bleibt im Bucket;
  bei Bedarf später per Edge Function aufräumen.)
```
