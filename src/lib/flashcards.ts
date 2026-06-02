import { LEITNER_BOXES } from '@/types';
import type { Deck, CardTopic, Flashcard, DeckExport } from '@/types';
import { uid } from '@/lib/db';

// ─── Leitner-Algorithmus ─────────────────────────────────────────────────────
//
// Richtig beantwortet → Karte wandert ein Fach weiter (max LEITNER_BOXES).
// Falsch → Karte fällt komplett zurück in Fach 1.

/** Tage bis eine Karte je Leitner-Fach erneut fällig wird (Index = box-1). */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16] as const;

/** Liefert das neue Leitner-Fach nach einer Antwort. */
export function nextBox(box: number, correct: boolean): number {
  if (!correct) return 1;
  return Math.min(LEITNER_BOXES, Math.max(1, box) + 1);
}

/**
 * Baut den Update-Patch für eine bewertete Karte (Leitner-Schritt + Statistik).
 */
export function reviewPatch(card: Flashcard, correct: boolean): Partial<Flashcard> {
  return {
    box: nextBox(card.box, correct),
    reviewedAt: Date.now(),
    correctCount: (card.correctCount ?? 0) + (correct ? 1 : 0),
    wrongCount: (card.wrongCount ?? 0) + (correct ? 0 : 1),
  };
}

/** Ob eine Karte jetzt zur Wiederholung ansteht (nie gelernt = sofort fällig). */
export function isDue(card: Flashcard, now: number = Date.now()): boolean {
  if (!card.reviewedAt) return true;
  const days = BOX_INTERVALS_DAYS[Math.min(card.box, LEITNER_BOXES) - 1] ?? 0;
  return card.reviewedAt + days * 86_400_000 <= now;
}

/** Fällige Karten aus einer Menge, fällige-zuerst sortiert (niedriges Fach zuerst). */
export function dueCards(cards: Flashcard[], now: number = Date.now()): Flashcard[] {
  return cards.filter(c => isDue(c, now)).sort((a, b) => a.box - b.box);
}

/**
 * Beherrschungsgrad eines Stapels (0–1): gewichteter Mittelwert der Leitner-Fächer.
 * Leerer Stapel → 0.
 */
export function deckMastery(cards: Flashcard[]): number {
  if (cards.length === 0) return 0;
  const sum = cards.reduce((acc, c) => acc + (Math.min(c.box, LEITNER_BOXES) - 1), 0);
  return sum / (cards.length * (LEITNER_BOXES - 1));
}

/** Verteilung der Karten auf die Leitner-Fächer (Index 0 = Fach 1). */
export function boxDistribution(cards: Flashcard[]): number[] {
  const dist = new Array(LEITNER_BOXES).fill(0);
  for (const c of cards) {
    const i = Math.min(Math.max(1, c.box), LEITNER_BOXES) - 1;
    dist[i]++;
  }
  return dist;
}

// ─── KI-Import: System-Prompt ────────────────────────────────────────────────

/**
 * System-Prompt, den der Nutzer zusammen mit seinem Lernstoff an eine KI gibt.
 * Die KI antwortet mit JSON im DeckExport-Format, das der Importer einliest.
 */
export function buildAiPrompt(deckName?: string): string {
  const titel = deckName?.trim() ? deckName.trim() : 'das Thema deines Lernstoffs';
  return `Du bist ein Lern-Assistent, der aus Lernmaterial Karteikarten erstellt.

Ich gebe dir Lernstoff (Text, Foto von Notizen, PDF o. Ä.) zu „${titel}".
Erstelle daraus prägnante Frage-Antwort-Karteikarten und gruppiere sie in sinnvolle Themengebiete.

Regeln:
- Vorderseite ("front") = kurze, eindeutige Frage oder ein Begriff.
- Rückseite ("back") = knappe, korrekte Antwort/Definition (keine Romane).
- Pro wichtigem Fakt genau eine Karte. Keine Dubletten.
- Ordne jede Karte einem Themengebiet ("topic") zu.
- Antworte AUSSCHLIESSLICH mit gültigem JSON nach diesem Schema – kein Fließtext, kein Markdown, keine Code-Fences:

{
  "version": 1,
  "kind": "notenapp-deck",
  "name": "${deckName?.trim() || 'Name des Kastens'}",
  "topics": ["Themengebiet A", "Themengebiet B"],
  "cards": [
    { "topic": "Themengebiet A", "front": "Frage?", "back": "Antwort" }
  ]
}

Gib jetzt nur das JSON aus.`;
}

// ─── Import-Parser ───────────────────────────────────────────────────────────

/** Wirft eine sprechende Fehlermeldung, wenn etwas nicht passt. */
export class DeckImportError extends Error {}

/**
 * Liest rohen Text (von der KI / aus einer Datei) und validiert ihn zum
 * DeckExport. Toleriert versehentliche ```json-Fences und Vor-/Nachtext.
 */
export function parseDeckImport(raw: string): DeckExport {
  const text = stripFences(raw).trim();
  if (!text) throw new DeckImportError('Es wurde kein Text eingegeben.');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Versuch: das erste {...}-Objekt aus dem Text herausschneiden.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new DeckImportError('Das ist kein gültiges JSON. Kopiere die komplette Antwort der KI.');
    }
    try {
      json = JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new DeckImportError('Das JSON konnte nicht gelesen werden. Bitte die KI-Antwort unverändert einfügen.');
    }
  }

  if (!json || typeof json !== 'object') {
    throw new DeckImportError('Unerwartetes Format – ein JSON-Objekt wird erwartet.');
  }
  const obj = json as Record<string, unknown>;

  const rawCards = Array.isArray(obj.cards) ? obj.cards : null;
  if (!rawCards || rawCards.length === 0) {
    throw new DeckImportError('Es wurden keine Karten gefunden ("cards" fehlt oder ist leer).');
  }

  const cards: DeckExport['cards'] = [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') continue;
    const cc = c as Record<string, unknown>;
    const front = typeof cc.front === 'string' ? cc.front.trim()
      : typeof cc.question === 'string' ? (cc.question as string).trim() : '';
    const back = typeof cc.back === 'string' ? cc.back.trim()
      : typeof cc.answer === 'string' ? (cc.answer as string).trim() : '';
    if (!front || !back) continue;
    const topic = typeof cc.topic === 'string' && cc.topic.trim() ? cc.topic.trim() : undefined;
    cards.push({ front, back, topic });
  }
  if (cards.length === 0) {
    throw new DeckImportError('Keine vollständige Karte gefunden – jede Karte braucht "front" und "back".');
  }

  const topicsFromCards = Array.from(new Set(cards.map(c => c.topic).filter((t): t is string => !!t)));
  const declaredTopics = Array.isArray(obj.topics)
    ? (obj.topics as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
    : [];
  const topics = Array.from(new Set([...declaredTopics, ...topicsFromCards]));

  return {
    version: 1,
    kind: 'notenapp-deck',
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Importierter Kasten',
    description: typeof obj.description === 'string' ? obj.description.trim() || undefined : undefined,
    color: typeof obj.color === 'string' ? obj.color : undefined,
    icon: typeof obj.icon === 'string' ? obj.icon : undefined,
    topics: topics.length ? topics : undefined,
    cards,
  };
}

/** Entfernt umschließende Markdown-Code-Fences (```json … ```). */
function stripFences(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = s.trim().match(fence);
  return m ? m[1] : s;
}

// ─── DeckExport → Entitäten ──────────────────────────────────────────────────

export interface BuiltDeck {
  deck: Deck;
  topics: CardTopic[];
  cards: Flashcard[];
}

/**
 * Materialisiert ein DeckExport zu konkreten Deck/Topic/Card-Objekten mit
 * frischen IDs. Optional kann in einen bestehenden Kasten importiert werden
 * (`existingDeckId` + `existingTopics` für Topic-Wiederverwendung per Name).
 */
export function deckExportToEntities(
  exp: DeckExport,
  opts: {
    schoolYearId?: string;
    subjectId?: string;
    existingDeck?: Deck;
    existingTopics?: CardTopic[];
  } = {},
): BuiltDeck {
  const now = Date.now();
  const deck: Deck = opts.existingDeck ?? {
    id: uid(),
    name: exp.name,
    description: exp.description,
    color: exp.color || randomDeckColor(),
    icon: exp.icon,
    subjectId: opts.subjectId,
    schoolYearId: opts.schoolYearId,
    createdAt: now,
  };

  // Topic-Namen → CardTopic (bestehende per Name wiederverwenden).
  const topicByName = new Map<string, CardTopic>();
  const existingTopics = opts.existingTopics ?? [];
  for (const t of existingTopics) topicByName.set(t.name.toLowerCase().trim(), t);

  const newTopics: CardTopic[] = [];
  const ensureTopic = (name?: string): string | undefined => {
    if (!name) return undefined;
    const key = name.toLowerCase().trim();
    const hit = topicByName.get(key);
    if (hit) return hit.id;
    const topic: CardTopic = {
      id: uid(),
      deckId: deck.id,
      name: name.trim(),
      position: existingTopics.length + newTopics.length,
      createdAt: now,
    };
    topicByName.set(key, topic);
    newTopics.push(topic);
    return topic.id;
  };

  // Erst die explizit deklarierten Topics anlegen (Reihenfolge erhalten).
  for (const name of exp.topics ?? []) ensureTopic(name);

  const cards: Flashcard[] = exp.cards.map(c => ({
    id: uid(),
    deckId: deck.id,
    topicId: ensureTopic(c.topic),
    front: c.front,
    back: c.back,
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    createdAt: now,
    schoolYearId: opts.schoolYearId,
  }));

  return { deck, topics: newTopics, cards };
}

/** Baut ein teilbares DeckExport aus einem Kasten + seinen Karten. */
export function buildDeckExport(deck: Deck, topics: CardTopic[], cards: Flashcard[]): DeckExport {
  const topicName = new Map(topics.map(t => [t.id, t.name]));
  return {
    version: 1,
    kind: 'notenapp-deck',
    name: deck.name,
    description: deck.description,
    color: deck.color,
    icon: deck.icon,
    topics: topics.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(t => t.name),
    cards: cards.map(c => ({
      front: c.front,
      back: c.back,
      topic: c.topicId ? topicName.get(c.topicId) : undefined,
    })),
  };
}

// ─── Share-Link (URL-safe Base64, UTF-8-fest) ────────────────────────────────

export function encodeDeckShare(exp: DeckExport): string {
  const json = JSON.stringify(exp);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDeckShare(token: string): DeckExport {
  let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return parseDeckImport(json);
}

// ─── Sonstiges ───────────────────────────────────────────────────────────────

const DECK_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#16a34a',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7',
];

export function randomDeckColor(): string {
  return DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)];
}
