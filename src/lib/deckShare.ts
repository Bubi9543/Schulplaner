import { supabase } from './supabase';
import { uid } from './db';
import type { DeckExport } from '@/types';

/**
 * Direktes Verschicken eines Karteikarten-Kastens an Freunde (In-App).
 *
 * Anders als der teilbare Link landet ein Kasten hier gezielt in der Inbox
 * eines bestimmten Empfängers (`deck_shares`-Zeile pro Empfänger). Der
 * Empfänger kann den Kasten übernehmen (eigene Kopie) oder verwerfen.
 *
 * Benötigte Supabase-Tabelle → siehe SUPABASE_SETUP.md (Abschnitt 3a).
 */

export interface IncomingDeckShare {
  id: string;
  senderId: string;
  senderName: string;
  deckName: string;
  cardCount: number;
  payload: DeckExport;
  createdAt: number;
}

interface DeckShareRow {
  id: string;
  sender_id: string;
  sender_name: string | null;
  deck_name: string | null;
  card_count: number | null;
  payload: DeckExport;
  created_at: number;
}

/** Schickt einen Kasten an mehrere Freunde (eine Zeile pro Empfänger). */
export async function sendDeckToFriends(
  payload: DeckExport,
  recipientIds: string[],
  senderName: string,
): Promise<number> {
  if (!supabase || recipientIds.length === 0) return 0;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt – bitte erst anmelden.');

  const now = Date.now();
  const rows = recipientIds.map(rid => ({
    id: uid(),
    sender_id: user.id,
    sender_name: senderName,
    recipient_id: rid,
    deck_name: payload.name,
    card_count: payload.cards.length,
    payload,
    created_at: now,
  }));

  const { error } = await supabase.from('deck_shares').insert(rows);
  if (error) throw new Error('Senden fehlgeschlagen: ' + error.message);
  return rows.length;
}

/** Holt die an mich gerichteten, noch offenen Kasten-Sendungen. */
export async function fetchIncomingDeckShares(): Promise<IncomingDeckShare[]> {
  if (!supabase) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('deck_shares')
    .select('id, sender_id, sender_name, deck_name, card_count, payload, created_at')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('fetchIncomingDeckShares error:', error.message);
    return [];
  }

  return (data as DeckShareRow[]).map(r => ({
    id: r.id,
    senderId: r.sender_id,
    senderName: r.sender_name ?? 'Ein Freund',
    deckName: r.deck_name ?? r.payload?.name ?? 'Kasten',
    cardCount: r.card_count ?? r.payload?.cards?.length ?? 0,
    payload: r.payload,
    createdAt: r.created_at,
  }));
}

/** Löscht eine Sendung aus der Inbox (nach Übernehmen oder Verwerfen). */
export async function deleteDeckShare(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('deck_shares').delete().eq('id', id);
  if (error) console.warn('deleteDeckShare error:', error.message);
}
