import { LEITNER_BOXES } from '@/types';
import type { Deck, CardTopic, Flashcard, DeckExport, ReviewOutcome, TypoTolerance } from '@/types';
import { uid } from '@/lib/db';

// ─── Leitner-Algorithmus ─────────────────────────────────────────────────────
//
// Richtig beantwortet → Karte wandert ein Fach weiter (max LEITNER_BOXES).
// Falsch → Karte fällt komplett zurück in Fach 1.

/** Tage bis eine Karte je Leitner-Fach erneut fällig wird (Index = box-1). */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16] as const;

/** Liefert das neue Leitner-Fach nach einer Bewertung. */
export function nextBox(box: number, outcome: ReviewOutcome): number {
  const cur = Math.max(1, Math.min(LEITNER_BOXES, box));
  if (outcome === 'wrong') return 1;
  if (outcome === 'partial') return cur; // bleibt im selben Fach
  return Math.min(LEITNER_BOXES, cur + 1);
}

/**
 * Baut den Update-Patch für eine bewertete Karte (Leitner-Schritt + Statistik).
 */
export function reviewPatch(card: Flashcard, outcome: ReviewOutcome): Partial<Flashcard> {
  return {
    box: nextBox(card.box, outcome),
    reviewedAt: Date.now(),
    correctCount: (card.correctCount ?? 0) + (outcome === 'correct' ? 1 : 0),
    wrongCount: (card.wrongCount ?? 0) + (outcome === 'wrong' ? 1 : 0),
  };
}

/**
 * Lern-Aktivität aus Karten für die Streak-Berechnung: jede zuletzt gelernte
 * Karte zählt als „Session" an ihrem Review-Tag. Format passt zu computeStreak().
 */
export function flashcardActivity(cards: Flashcard[]): { startedAt: number; focusedMs: number }[] {
  const out: { startedAt: number; focusedMs: number }[] = [];
  for (const c of cards) {
    if (c.reviewedAt) out.push({ startedAt: c.reviewedAt, focusedMs: 1 });
  }
  return out;
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
Erstelle daraus prägnante Frage-Antwort-Karteikarten.

Regeln:
- Vorderseite ("front") = kurze, eindeutige Frage oder ein Begriff.
- Rückseite ("back") = knappe, korrekte Antwort/Definition (keine Romane).
- Pro wichtigem Fakt genau eine Karte. Keine Dubletten.
- Erstelle KEINE Themen/Kategorien – die Einteilung mache ich selbst.
- Antworte AUSSCHLIESSLICH mit gültigem JSON nach diesem Schema – kein Fließtext, kein Markdown, keine Code-Fences:

{
  "version": 1,
  "kind": "notenapp-deck",
  "name": "${deckName?.trim() || 'Name des Kastens'}",
  "cards": [
    { "front": "Frage?", "back": "Antwort" }
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

// ─── Tipp-Antworten: Vergleich mit Fehlertoleranz ────────────────────────────
//
// Für die Modi „Schreiben", „Lernen", „Prüfung". Die gewünschte Strenge kommt
// über einen Schieberegler vom Nutzer (TypoTolerance).

/** Normalisiert Text für den Vergleich: trimmen, Mehrfach-Leerzeichen zu einem. */
function normalizeBasic(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Zusätzlich Groß/Klein + Akzente/diakritische Zeichen entfernen. */
function normalizeLoose(s: string): string {
  return normalizeBasic(s)
    .toLocaleLowerCase('de')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Levenshtein-Distanz (Anzahl Einfügungen/Löschungen/Ersetzungen). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Wie viele falsche Buchstaben je nach Toleranzstufe erlaubt sind.
 * Die erlaubte Anzahl skaliert mit der Antwortlänge (loose = großzügig).
 */
function allowedDistance(tol: TypoTolerance, len: number): number {
  if (tol === 'exact') return 0;
  if (tol === 'lenient') return len >= 8 ? 2 : len >= 4 ? 1 : 0;
  // loose: rund ein Drittel der Buchstaben darf abweichen.
  return Math.max(1, Math.floor(len / 3));
}

/** Bewertung einer getippten Antwort. */
export interface TypedJudgement {
  /** true = als richtig gewertet. */
  ok: boolean;
  /** Genau (0 Abweichung) oder „fast" (innerhalb der Toleranz). */
  exact: boolean;
}

/**
 * Prüft eine getippte Antwort gegen die erwartete Lösung.
 * Mehrere richtige Lösungen können mit „/", „;" oder „," getrennt sein –
 * eine Übereinstimmung genügt. Liefert das beste Ergebnis zurück.
 */
export function judgeTyped(input: string, expected: string, tol: TypoTolerance): TypedJudgement {
  const candidates = expected.split(/[/;,]/).map(s => s.trim()).filter(Boolean);
  if (candidates.length === 0) candidates.push(expected);

  let best: TypedJudgement = { ok: false, exact: false };
  for (const cand of candidates) {
    // Exakt (nur Leerzeichen normalisiert)?
    if (normalizeBasic(input) === normalizeBasic(cand)) return { ok: true, exact: true };
    if (tol === 'exact') continue;
    // Tolerant: klein/akzentfrei vergleichen, Tippfehler über Levenshtein zulassen.
    const a = normalizeLoose(input);
    const b = normalizeLoose(cand);
    if (a === b) { best = { ok: true, exact: true }; continue; }
    const dist = levenshtein(a, b);
    if (dist <= allowedDistance(tol, b.length)) best = { ok: true, exact: false };
  }
  return best;
}

/** Outcome aus einer getippten Antwort (für den Leitner-Schritt). */
export function outcomeFromTyped(j: TypedJudgement): ReviewOutcome {
  if (!j.ok) return 'wrong';
  return j.exact ? 'correct' : 'partial';
}

// ─── Multiple-Choice: Ablenker (falsche Antworten) ───────────────────────────

/** Mischt eine Kopie eines Arrays (Fisher–Yates). */
function shuffleArr<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Baut die Antwort-Optionen für eine Multiple-Choice-Frage: die richtige
 * Lösung plus bis zu (count-1) Ablenker aus den übrigen Karten. Es werden die
 * jeweils angezeigten Antwort-Seiten (`answerOf`) genutzt, Dubletten gefiltert.
 * Rückgabe ist bereits gemischt; `correctIndex` zeigt auf die richtige Option.
 */
export function buildChoices(
  card: Flashcard,
  pool: Flashcard[],
  answerOf: (c: Flashcard) => string,
  count = 4,
): { options: string[]; correctIndex: number } {
  const correct = answerOf(card);
  const seen = new Set([correct.trim().toLowerCase()]);
  const distractors: string[] = [];
  for (const c of shuffleArr(pool)) {
    if (c.id === card.id) continue;
    const a = answerOf(c);
    const key = a.trim().toLowerCase();
    if (!a.trim() || seen.has(key)) continue;
    seen.add(key);
    distractors.push(a);
    if (distractors.length >= count - 1) break;
  }
  const options = shuffleArr([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}
