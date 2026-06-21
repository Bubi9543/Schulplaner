import { supabase } from './supabase';
import { lookupByFriendCode } from './homeworkShare';
import { notifySocial } from './socialNotify';

/**
 * Gegenseitiger Freundes-Graph mit Anfragen.
 *
 * Eine `friendships`-Zeile dient gleichzeitig als Anfrage und als Freundschaft:
 * - status='pending'  → offene Anfrage (requester → addressee)
 * - status='accepted' → bestätigte, gegenseitige Freundschaft
 *
 * Ablehnen / Zurückziehen / Entfreunden = Zeile löschen.
 * Annehmen = status auf 'accepted' setzen (nur der addressee darf das).
 *
 * Benötigte Supabase-Tabellen → siehe FRIENDS_SETUP.md
 */

export interface Friend {
  /** friendships.id der zugrundeliegenden Zeile (für Entfernen). */
  friendshipId: string;
  userId: string;
  displayName: string;
  friendCode: string;
  avatarUrl?: string;
  /** ms-Timestamp, seit wann die Freundschaft besteht. Begrenzt, welche Hausaufgaben man sieht. */
  friendsSince: number;
}

export interface FriendRequest {
  /** friendships.id. */
  id: string;
  /** Die andere Person (Absender bei eingehend, Empfänger bei ausgehend). */
  userId: string;
  displayName: string;
  friendCode: string;
  avatarUrl?: string;
  createdAt: number;
}

interface FriendshipRow {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string;
  friend_code: string;
  avatar_url: string | null;
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Holt Profile (Name, Code, Avatar) für eine Menge von User-IDs als Map. */
async function fetchProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  if (!supabase || userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, friend_code, avatar_url')
    .in('user_id', userIds);
  if (error) {
    console.warn('fetchProfiles error:', error.message);
    return map;
  }
  for (const row of (data as ProfileRow[])) map.set(row.user_id, row);
  return map;
}

/** Lädt alle friendships-Zeilen, in denen der aktuelle Nutzer beteiligt ist. */
async function fetchMyFriendships(): Promise<FriendshipRow[]> {
  if (!supabase) return [];
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester, addressee, status, created_at')
    .or(`requester.eq.${me},addressee.eq.${me}`)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('fetchMyFriendships error:', error.message);
    return [];
  }
  return data as FriendshipRow[];
}

export interface FriendGraph {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/**
 * Lädt den kompletten Freundes-Graph (Freunde + ein-/ausgehende Anfragen) in
 * einem Rutsch, inklusive der Profildaten der jeweils anderen Person.
 */
export async function loadFriendGraph(): Promise<FriendGraph> {
  const empty: FriendGraph = { friends: [], incoming: [], outgoing: [] };
  if (!supabase) return empty;
  const me = await currentUserId();
  if (!me) return empty;

  const rows = await fetchMyFriendships();
  const otherIds = rows.map(r => (r.requester === me ? r.addressee : r.requester));
  const profiles = await fetchProfiles([...new Set(otherIds)]);

  const friends: Friend[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];

  for (const r of rows) {
    const otherId = r.requester === me ? r.addressee : r.requester;
    const p = profiles.get(otherId);
    const displayName = p?.display_name ?? 'Unbekannt';
    const friendCode = p?.friend_code ?? '';
    const avatarUrl = p?.avatar_url ?? undefined;
    const createdAt = new Date(r.created_at).getTime();

    if (r.status === 'accepted') {
      friends.push({ friendshipId: r.id, userId: otherId, displayName, friendCode, avatarUrl, friendsSince: createdAt });
    } else if (r.addressee === me) {
      // Eingehende Anfrage: jemand will mich adden.
      incoming.push({ id: r.id, userId: otherId, displayName, friendCode, avatarUrl, createdAt });
    } else {
      // Ausgehende Anfrage: ich habe jemanden angefragt.
      outgoing.push({ id: r.id, userId: otherId, displayName, friendCode, avatarUrl, createdAt });
    }
  }

  friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { friends, incoming, outgoing };
}

/**
 * Sendet eine Freundschaftsanfrage anhand des 6-stelligen Freundecodes.
 * Wirft mit sprechender Meldung bei Selbst-Code, unbekanntem Code oder wenn
 * bereits eine Anfrage/Freundschaft existiert.
 */
export async function sendFriendRequestByCode(rawCode: string): Promise<Friend | FriendRequest> {
  if (!supabase) throw new Error('Cloud-Sync nicht eingerichtet – bitte erst anmelden.');
  const me = await currentUserId();
  if (!me) throw new Error('Nicht eingeloggt – bitte erst anmelden.');

  const profile = await lookupByFriendCode(rawCode);
  if (!profile) throw new Error('Freundecode nicht gefunden. Tippfehler?');
  if (profile.userId === me) throw new Error('Das ist dein eigener Code.');

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester: me, addressee: profile.userId, status: 'pending' })
    .select('id, requester, addressee, status, created_at')
    .single();

  if (error) {
    // 23505 = unique_violation → es gibt schon ein Paar (Anfrage oder Freundschaft).
    if (error.code === '23505') {
      throw new Error(`Mit ${profile.displayName} besteht schon eine Anfrage oder Freundschaft.`);
    }
    throw new Error('Anfrage konnte nicht gesendet werden: ' + error.message);
  }

  const row = data as FriendshipRow;
  // Empfänger der Anfrage sofort benachrichtigen (im Hintergrund).
  notifySocial({ type: 'friend_request', friendshipId: row.id });
  return {
    id: row.id,
    userId: profile.userId,
    displayName: profile.displayName,
    friendCode: profile.friendCode,
    avatarUrl: profile.avatarUrl,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** Nimmt eine eingehende Anfrage an (nur der Empfänger darf das). */
export async function acceptRequest(friendshipId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw new Error('Annehmen fehlgeschlagen: ' + error.message);
  // Ursprünglichen Anfrager benachrichtigen, dass angenommen wurde.
  notifySocial({ type: 'friend_accept', friendshipId });
}

/**
 * Löscht eine friendships-Zeile – für Ablehnen (eingehend), Zurückziehen
 * (ausgehend) und Entfreunden (accepted). RLS erlaubt beiden Beteiligten DELETE.
 */
export async function deleteFriendship(friendshipId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw new Error('Aktion fehlgeschlagen: ' + error.message);
}
