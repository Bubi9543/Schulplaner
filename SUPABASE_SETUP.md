# Supabase Setup für Notenapp

Diese Anleitung beschreibt, wie du dein Supabase-Projekt für die Notenapp einrichtest – inklusive **Cloud-Sync** und **Foto-Speicherung**.

## 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
2. Aus `Project Settings → API` notieren:
   - `Project URL`
   - `anon public` API-Key
3. In Notenapp-Repo `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```

## 2. Auth einrichten

`Authentication → Providers`:
- **Email** aktivieren (Standard)
- **Google** optional aktivieren

## 3. Datenbank-Tabellen

In `SQL Editor` ausführen:

```sql
-- Hilfstabelle, damit Policies sauber bleiben
create or replace function public.current_user_id()
returns uuid language sql stable as $$ select auth.uid() $$;

-- Generische Sync-Tabellen (subjects, grades, tasks, lessons, school_years)
create table if not exists subjects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists grades (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists lessons (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists school_years (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists photos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS einschalten
alter table subjects     enable row level security;
alter table grades       enable row level security;
alter table tasks        enable row level security;
alter table lessons      enable row level security;
alter table school_years enable row level security;
alter table photos       enable row level security;
alter table user_settings enable row level security;

-- Policies: User sieht/ändert nur eigene Zeilen
create policy "own subjects"      on subjects     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own grades"        on grades       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks"         on tasks        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lessons"       on lessons      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own school_years"  on school_years for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own photos"        on photos       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings"      on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime-Publication: Voraussetzung für Live-Sync zwischen Geräten.
-- (Ignoriert Fehler, falls Tabellen schon Teil der Publication sind.)
alter publication supabase_realtime add table subjects;
alter publication supabase_realtime add table grades;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table lessons;
alter publication supabase_realtime add table school_years;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table user_settings;
```

> Falls einzelne `alter publication`-Zeilen mit „relation … is already member of publication" fehlschlagen, ist das harmlos – einfach die restlichen Zeilen einzeln laufen lassen.

## 4. Storage Bucket für Fotos

In `Storage → Create new bucket`:

| Field | Value |
|-------|-------|
| Name | `photos` |
| Public | **❌ aus** (privat) |
| File size limit | 5 MB |
| Allowed MIME types | `image/jpeg, image/png, image/webp` |

Dann in `SQL Editor`:

```sql
-- Storage Policies: User darf nur eigene Dateien lesen/schreiben/löschen.
-- Pfad-Konvention in der App: "{user_id}/{photo_id}.jpg"
-- → Erstes Pfad-Segment muss user_id sein.

create policy "own storage read"
  on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own storage write"
  on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own storage update"
  on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own storage delete"
  on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

## 5. Fertig

Im Settings → Cloud Sync der App einloggen. Sobald du auf einem zweiten Gerät eingeloggt bist, **synchronisieren sich Änderungen automatisch in Echtzeit** – kein manueller Upload nötig. Fotos werden ab dem Login direkt in den `photos`-Bucket hochgeladen und beim Wechseln auf andere Geräte automatisch heruntergeladen.

### Free-Tier-Limits
- 500 MB Datenbank
- **1 GB Storage** (~3 000–5 000 Schul-Fotos)
- 50 000 Auth-User
- 2 GB Egress / Monat

Reicht für die meisten Nutzer locker.
