# Anstupsen-Status – Supabase Setup

Die **Freundesliste** auf der Social-Seite zeigt den Anstupsen-Button nur bei
Freunden, die **auf mindestens einem Gerät** Push-Benachrichtigungen aktiviert
haben (sonst käme der Anstupser nie an).

Aus Datenschutzgründen darf niemand die Geräte-Daten (`push_subscriptions`)
anderer direkt lesen. Darum gibt es eine kleine, sichere Datenbank-Funktion, die
**nur** zurückgibt, *welche deiner Freunde* push-bereit sind – keine
Geräte-Details, keine Endpoints.

> Voraussetzung: `FRIENDS_SETUP.md` (Tabelle `friendships`) und der Push-Teil aus
> `SUPABASE_SETUP.md` (Tabelle `push_subscriptions`) wurden bereits ausgeführt.

---

## SQL (Dashboard → SQL Editor → New query)

```sql
-- Gibt die User-IDs der akzeptierten Freunde des Aufrufers zurück,
-- die mindestens ein Gerät mit aktivem Push-Abo haben.
-- SECURITY DEFINER umgeht RLS, liefert aber bewusst NUR die user_id –
-- niemals Endpoints oder Schlüssel. auth.uid() bleibt der echte Aufrufer.
create or replace function public.friends_with_push()
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  select distinct ps.user_id
  from public.push_subscriptions ps
  where ps.user_id in (
    select case when f.requester = auth.uid() then f.addressee else f.requester end
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
$$;

-- Nur eingeloggte Nutzer dürfen die Funktion aufrufen.
revoke all on function public.friends_with_push() from public;
grant execute on function public.friends_with_push() to authenticated;
```

---

## Fertig!

Danach zeigt die Freundesliste den 👋-Button automatisch nur bei push-bereiten
Freunden. Solange dieses SQL **nicht** eingefügt ist, blendet die App alle
Anstupsen-Buttons sicherheitshalber aus (kein Fehler, kein Absturz) – die Liste
mit Profilbild, Name und Streak funktioniert trotzdem.
