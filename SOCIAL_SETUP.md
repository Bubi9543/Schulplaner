# Social-Feed – Supabase-Setup

Damit die **Social-Seite** (`/social`) funktioniert, brauchst du drei Tabellen
(+ eine Audience-Tabelle), deren RLS-Policies und einen Storage-Bucket für die
Lern-Fotos.

> Voraussetzung: `user_profiles` (aus `HOMEWORK_SHARING_SETUP.md`) und
> `friendships` (aus `FRIENDS_SETUP.md`) existieren bereits.
>
> **Sichtbarkeit pro Post:** Beim Posten wählt man aus, welche Freunde den Post
> sehen dürfen. Diese Auswahl wird als **Snapshot** in `social_post_audience`
> gespeichert. Wer später Freund wird, sieht alte Posts **nicht**. Erzwungen wird
> das per RLS (sichtbar = eigener Post **oder** ich stehe in der Audience).

---

## ⚡️ Bereits Tabellen angelegt? Update ausführen

Wenn du die erste Version schon installiert hast, reicht dieser Block
(im **SQL-Editor**) – er ergänzt Audience + Fachfarbe und stellt die
Sichtbarkeits-Policies um:

```sql
-- Fachfarbe am Post (für konsistente Chips bei allen Betrachtern).
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS subject_color text;

-- Audience-Snapshot: wer einen Post sehen darf.
CREATE TABLE IF NOT EXISTS public.social_post_audience (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS social_post_audience_user_idx ON public.social_post_audience (user_id);
ALTER TABLE public.social_post_audience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_audience_select" ON public.social_post_audience
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_audience_insert" ON public.social_post_audience
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT p.user_id FROM public.social_posts p WHERE p.id = post_id));
CREATE POLICY "social_audience_delete" ON public.social_post_audience
  FOR DELETE TO authenticated
  USING (auth.uid() = (SELECT p.user_id FROM public.social_posts p WHERE p.id = post_id));

-- Posts: Sichtbarkeit auf eigene + Audience umstellen.
DROP POLICY IF EXISTS "social_posts_select" ON public.social_posts;
CREATE POLICY "social_posts_select" ON public.social_posts
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.social_post_audience a WHERE a.post_id = id AND a.user_id = auth.uid())
  );

-- Reaktionen/Kommentare: nur für sichtbare Posts lesbar.
DROP POLICY IF EXISTS "social_reactions_select" ON public.social_reactions;
CREATE POLICY "social_reactions_select" ON public.social_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));

DROP POLICY IF EXISTS "social_comments_select" ON public.social_comments;
CREATE POLICY "social_comments_select" ON public.social_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));
```

> Hinweis: Posts, die du **vor** diesem Update angelegt hast, haben keine
> Audience-Einträge – Freunde sehen sie danach nicht mehr (nur du). Das sind eh
> nur deine Test-Posts.

Fertig – der Rest dieser Datei ist die vollständige Referenz für eine
**Neuinstallation**.

---

## 1. Tabellen + RLS (Neuinstallation)

```sql
-- ─── Posts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject       text,
  subject_color text,
  caption       text NOT NULL DEFAULT '',
  photo_url     text,
  study_min     integer NOT NULL DEFAULT 0,
  streak        integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_posts_user_created_idx
  ON public.social_posts (user_id, created_at DESC);

-- ─── Audience: wer einen Post sehen darf (Snapshot beim Posten) ─────────────
CREATE TABLE IF NOT EXISTS public.social_post_audience (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS social_post_audience_user_idx ON public.social_post_audience (user_id);

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
ALTER TABLE public.social_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_audience  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments       ENABLE ROW LEVEL SECURITY;

-- Posts: sichtbar = eigener Post ODER ich stehe in der Audience. Schreiben nur als Owner.
CREATE POLICY "social_posts_select" ON public.social_posts
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.social_post_audience a WHERE a.post_id = id AND a.user_id = auth.uid())
  );
CREATE POLICY "social_posts_insert" ON public.social_posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_posts_update" ON public.social_posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_posts_delete" ON public.social_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Audience: lesbar für Eingeloggte; anlegen/löschen nur der Post-Besitzer.
CREATE POLICY "social_audience_select" ON public.social_post_audience
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_audience_insert" ON public.social_post_audience
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT p.user_id FROM public.social_posts p WHERE p.id = post_id));
CREATE POLICY "social_audience_delete" ON public.social_post_audience
  FOR DELETE TO authenticated
  USING (auth.uid() = (SELECT p.user_id FROM public.social_posts p WHERE p.id = post_id));

-- Reaktionen: lesen nur für sichtbare Posts; eigene anlegen/ändern/löschen.
CREATE POLICY "social_reactions_select" ON public.social_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));
CREATE POLICY "social_reactions_write" ON public.social_reactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));

-- Kommentare: lesen nur für sichtbare Posts; eigene anlegen; löschen darf der
-- Autor ODER der Post-Besitzer (Moderation).
CREATE POLICY "social_comments_select" ON public.social_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));
CREATE POLICY "social_comments_insert" ON public.social_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id = post_id));
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
- **Public bucket: ✅ an** (Lern-Fotos werden mit ausgewählten Freunden geteilt;
  öffentliche URL genügt, kein Signed-URL-Refresh nötig).

Dann die Storage-Policies (SQL-Editor):

```sql
CREATE POLICY "social_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-photos');
CREATE POLICY "social_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "social_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'social-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 3. Realtime (optional)

Für Live-Updates unter **Database → Replication → Tables** `social_posts`,
`social_reactions`, `social_comments` aktivieren. Aktuell lädt der Feed beim
Öffnen und nach eigenen Aktionen neu (Aktualisieren-Button) – Realtime ist nicht
nötig.

---

## Notizen

- **Sichtbarkeit ist ein Snapshot:** Beim Posten gewählte Freunde landen in
  `social_post_audience`. Später hinzugefügte Freunde sehen den Post nicht.
- **Eine Reaktion pro Person & Post** (PK `post_id, user_id`): neue Reaktion
  ersetzt die alte; dasselbe Emoji erneut = abwählen.
- Fotos: `social-photos/<user_id>/<uuid>.jpg`, client-seitig auf max. 1440 px
  (lange Kante) als JPEG komprimiert.
- Beim Löschen eines Posts werden Audience, Reaktionen & Kommentare per
  `ON DELETE CASCADE` mitentfernt; die Foto-Datei bleibt vorerst im Bucket.
```
