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

-- Kalender-Abonnement: Tokens, mit denen Edge Function .ics-Feed ausliefert
create table if not exists calendar_tokens (
  token text primary key check (char_length(token) >= 24),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);
create index if not exists calendar_tokens_user_idx on calendar_tokens(user_id);

-- Shortcut-API: Tokens, mit denen Apple Shortcuts Aufgaben anlegen dürfen.
create table if not exists shortcut_tokens (
  token text primary key check (char_length(token) >= 24),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists shortcut_tokens_user_idx on shortcut_tokens(user_id);

-- Stundenplan-Sharing über 4-stellige Codes
create table if not exists schedule_shares (
  code text primary key check (char_length(code) between 4 and 12),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists schedule_shares_owner_idx on schedule_shares(owner_user_id);
create index if not exists schedule_shares_expires_idx on schedule_shares(expires_at);

-- Push-Notifications: Browser-Subscriptions pro Gerät.
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

-- Push-Notification-Log (Dedup): pro (user, event_key) nur einmal senden.
create table if not exists notification_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  sent_at timestamptz not null default now()
);
create unique index if not exists notification_log_unique on notification_log(user_id, event_key);
create index if not exists notification_log_sent_idx on notification_log(sent_at);

-- RLS einschalten
alter table subjects     enable row level security;
alter table grades       enable row level security;
alter table tasks        enable row level security;
alter table lessons      enable row level security;
alter table school_years enable row level security;
alter table photos       enable row level security;
alter table user_settings enable row level security;
alter table schedule_shares enable row level security;
alter table calendar_tokens enable row level security;
alter table shortcut_tokens enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_log enable row level security;

-- Policies: User sieht/ändert nur eigene Zeilen
create policy "own subjects"      on subjects     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own grades"        on grades       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tasks"         on tasks        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lessons"       on lessons      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own school_years"  on school_years for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own photos"        on photos       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings"      on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- schedule_shares: jeder authentifizierte User darf SELECT (er muss aber den
-- Code kennen, sonst sieht er nichts Sinnvolles); INSERT/UPDATE/DELETE nur Besitzer.
create policy "anyone can read by code" on schedule_shares for select
  to authenticated using (true);
create policy "owner insert" on schedule_shares for insert
  to authenticated with check (owner_user_id = auth.uid());
create policy "owner update" on schedule_shares for update
  to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "owner delete" on schedule_shares for delete
  to authenticated using (owner_user_id = auth.uid());

-- calendar_tokens: User verwaltet nur eigene Tokens. Der Token-→-User-Lookup
-- in der Edge Function läuft mit dem Service-Role-Key und umgeht RLS.
create policy "own calendar tokens" on calendar_tokens for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- shortcut_tokens: identische Logik. Lookup in Edge Function läuft mit Service-Role.
create policy "own shortcut tokens" on shortcut_tokens for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- push_subscriptions: User verwaltet nur eigene Geräte-Endpoints. Die
-- Edge Function push-runner liest mit Service-Role-Key über RLS hinweg.
create policy "own push subscriptions" on push_subscriptions for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_log: User sieht nur eigene Log-Einträge. INSERT macht
-- ohnehin nur die Edge Function mit Service-Role.
create policy "own notification log" on notification_log for select
  to authenticated using (user_id = auth.uid());

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

## 5. Edge Function: Kalender-Feed

Damit User ihren Stundenplan in Google/Apple Kalender abonnieren können, läuft
ein iCal-Generator als Supabase Edge Function (`supabase/functions/calendar/`).

**Einmaliges Deployment:**

```bash
# Supabase CLI installieren (falls noch nicht da)
brew install supabase/tap/supabase

# Im Projekt-Root einloggen + verlinken
supabase login
supabase link --project-ref <DEIN_PROJECT_REF>

# Function deployen – `--no-verify-jwt`, weil Kalender-Apps keine
# Auth-Header senden. Die Function nutzt intern den Service-Role-Key.
supabase functions deploy calendar --no-verify-jwt
```

Die Function ist danach erreichbar unter:
```
https://<PROJECT_REF>.supabase.co/functions/v1/calendar/<TOKEN>.ics
```

Die App generiert pro User einen zufälligen 32-Zeichen-Token (gespeichert
in `calendar_tokens`) und bietet den Link über die Einstellungen an.

## 6. Edge Function: Push-Benachrichtigungen

Damit die App Push-Notifications schicken kann (Hausaufgaben-Erinnerung,
Klausuren-Vorlauf, Stundenbeginn, Lerndeadline) brauchst du:

### 6.1 VAPID-Keys erzeugen

VAPID = Voluntary Application Server Identification. Ein einmaliges
Schlüsselpaar, mit dem dein Server sich gegenüber den Push-Diensten der
Browser ausweist. Im Projekt-Root:

```bash
npx web-push generate-vapid-keys
```

Du bekommst:
```
Public Key:  BLn... (87 Zeichen, beginnt mit B)
Private Key: K8h... (43 Zeichen)
```

**Public Key** kommt ins Frontend als `VITE_VAPID_PUBLIC_KEY`
(Vercel-Env-Var setzen + neu deployen, oder lokal in `.env.local`).

**Private Key** kommt nur in die Supabase-Function als Secret:

```bash
cd /Users/conorbecker/Documents/notenapp
supabase secrets set \
  VAPID_PUBLIC_KEY='BLn...' \
  VAPID_PRIVATE_KEY='K8h...' \
  VAPID_SUBJECT='mailto:du@deine-mail.de'
```

`VAPID_SUBJECT` muss ein gültiger `mailto:`-Link oder `https://`-URL sein
(Browser-Push-Dienste verlangen das).

### 6.2 Function deployen

```bash
supabase functions deploy push-runner
```

`push-runner` läuft mit Service-Role-Key, also kein `--no-verify-jwt`
nötig – sie wird nur intern via pg_cron getriggert.

### 6.3 pg_cron einrichten

In Supabase SQL-Editor (einmalig):

```sql
-- Extensions aktivieren (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper, der die Edge Function aufruft. Service-Role-Key liest er aus
-- dem Vault.
create or replace function trigger_push_runner()
returns void language plpgsql security definer as $$
declare
  result bigint;
begin
  select net.http_post(
    url := 'https://<DEIN_PROJECT_REF>.supabase.co/functions/v1/push-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  ) into result;
end $$;

-- Service-Role-Key im Vault speichern (mit deinem echten Key ersetzen)
select vault.create_secret('eyJhbGc...DEIN_SERVICE_ROLE_KEY...', 'service_role_key');

-- Alle 5 Minuten ausführen
select cron.schedule(
  'push-runner-every-5min',
  '*/5 * * * *',
  $$ select trigger_push_runner() $$
);
```

Du findest den Service-Role-Key unter **Project Settings → API → service_role secret**
(nicht den anon-key!).

Zum Stoppen später: `select cron.unschedule('push-runner-every-5min');`

### 6.4 Frontend-Env

In Vercel (oder lokal `.env.local`):
```
VITE_VAPID_PUBLIC_KEY=BLn...derselbe Public-Key wie oben...
```

Danach neu deployen. In den App-Einstellungen erscheint dann der neue
„Benachrichtigungen"-Tab.

## 7. Feedback-Tabelle

Damit User aus den Einstellungen Bug-Reports und Ideen schicken können:

```sql
create table if not exists feedback (
  id bigint generated always as identity primary key,
  type text not null default 'idee',
  title text not null,
  description text,
  email text,
  name text,
  school text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Jeder (auch nicht eingeloggt) darf Feedback schreiben
create policy "anyone can insert feedback" on feedback
  for insert to anon, authenticated
  with check (true);

-- Nur du (über Supabase Dashboard / Service Key) kannst lesen
-- Kein SELECT-Policy = kein User kann Feedback anderer lesen
```

Feedback lesen: über das Supabase Dashboard → Table Editor → `feedback`.

## 8. Fertig

Im Settings → Cloud Sync der App einloggen. Sobald du auf einem zweiten Gerät eingeloggt bist, **synchronisieren sich Änderungen automatisch in Echtzeit** – kein manueller Upload nötig. Fotos werden ab dem Login direkt in den `photos`-Bucket hochgeladen und beim Wechseln auf andere Geräte automatisch heruntergeladen.

### Free-Tier-Limits
- 500 MB Datenbank
- **1 GB Storage** (~3 000–5 000 Schul-Fotos)
- 50 000 Auth-User
- 2 GB Egress / Monat

Reicht für die meisten Nutzer locker.
