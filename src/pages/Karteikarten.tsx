import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Layers, Sparkles, BookOpen, Play, Pencil, Trash2, Share2,
  ChevronLeft, FolderPlus, Folder, MoreHorizontal, RotateCcw, GraduationCap, Upload,
  Inbox, Check, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Empty } from '@/components/Empty';
import { SubjectIcon } from '@/components/SubjectIcon';
import { useStore } from '@/store/useStore';
import { dueCards, deckMastery, boxDistribution, decodeDeckShare } from '@/lib/flashcards';
import { LEITNER_BOXES } from '@/types';
import type { Deck, Flashcard, CardTopic, DeckFolder } from '@/types';
import { DeckDialog } from '@/components/flashcards/DeckDialog';
import { CardDialog } from '@/components/flashcards/CardDialog';
import { AiImportDialog } from '@/components/flashcards/AiImportDialog';
import { ShareDialog } from '@/components/flashcards/ShareDialog';
import { StudySession } from '@/components/flashcards/StudySession';

/** Laufende Lern-Session inkl. Seiten-Beschriftung des Kastens. */
interface StudyState { name: string; cards: Flashcard[]; frontLabel?: string; backLabel?: string; }

// ─── Übersicht (Deck-Grid) ───────────────────────────────────────────────────

export function KarteikartenPage() {
  const decks = useStore(s => s.decks);
  const folders = useStore(s => s.deckFolders);
  const flashcards = useStore(s => s.flashcards);
  const reviewCard = useStore(s => s.reviewCard);
  const updateCard = useStore(s => s.updateCard);
  const addDeckFolder = useStore(s => s.addDeckFolder);
  const updateDeckFolder = useStore(s => s.updateDeckFolder);
  const deleteDeckFolder = useStore(s => s.deleteDeckFolder);
  const updateDeck = useStore(s => s.updateDeck);
  const incomingDeckShares = useStore(s => s.incomingDeckShares);
  const loadDeckShares = useStore(s => s.loadDeckShares);
  const acceptDeckShare = useStore(s => s.acceptDeckShare);
  const dismissDeckShare = useStore(s => s.dismissDeckShare);
  const [params, setParams] = useSearchParams();

  // Erhaltene Kästen beim Öffnen der Seite frisch ziehen.
  useEffect(() => { void loadDeckShares(); }, [loadDeckShares]);

  const [deckDialog, setDeckDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [shareImport, setShareImport] = useState<{ text: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [study, setStudy] = useState<StudyState | null>(null);
  // Drag & Drop: aktuell gezogener Kasten.
  const [dragId, setDragId] = useState<string | null>(null);

  async function moveDeck(deckId: string, folderId: string | undefined) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck || (deck.folderId ?? undefined) === folderId) return;
    await updateDeck(deckId, { folderId });
  }

  // Geteilten Kasten aus ?import=<token> aufnehmen.
  useEffect(() => {
    const token = params.get('import');
    if (!token) return;
    try {
      const exp = decodeDeckShare(token);
      setShareImport({ text: JSON.stringify(exp) });
    } catch {
      setImportError('Der geteilte Link konnte nicht gelesen werden.');
    }
    params.delete('import');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardsByDeck = useMemo(() => {
    const map = new Map<string, Flashcard[]>();
    for (const c of flashcards) {
      const arr = map.get(c.deckId) ?? [];
      arr.push(c);
      map.set(c.deckId, arr);
    }
    return map;
  }, [flashcards]);

  const ungrouped = useMemo(() => decks.filter(d => !d.folderId), [decks]);

  async function addFolderPrompt() {
    const name = prompt('Name des neuen Ordners:');
    if (name?.trim()) await addDeckFolder({ name: name.trim() });
  }

  const renderDeck = (deck: Deck, i: number) => (
    <div
      key={deck.id}
      draggable
      onDragStart={e => { setDragId(deck.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deck.id); }}
      onDragEnd={() => setDragId(null)}
      className={`transition-opacity ${dragId === deck.id ? 'opacity-40' : ''}`}
    >
      <DeckCard
        deck={deck}
        cards={cardsByDeck.get(deck.id) ?? []}
        delay={i * 0.04}
        onQuickStudy={(d, cards) => setStudy({ name: d.name, cards, frontLabel: d.frontLabel, backLabel: d.backLabel })}
      />
    </div>
  );

  return (
    <PageShell
      title="Karteikarten"
      subtitle="Lerne mit dem Leitner-System – richtig Beantwortetes kommt seltener dran."
      actions={
        <>
          <button onClick={addFolderPrompt} className="btn-ghost">
            <FolderPlus className="size-4" /> Ordner
          </button>
          <button onClick={() => setImportDialog(true)} className="btn-ghost">
            <Sparkles className="size-4" /> KI-Import
          </button>
          <button onClick={() => setDeckDialog(true)} className="btn-primary">
            <Plus className="size-4" /> Neuer Kasten
          </button>
        </>
      }
    >
      {importError && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-700 mb-4">{importError}</div>
      )}

      {incomingDeckShares.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Inbox className="size-4 text-theme-deep" />
            <h2 className="font-display font-bold text-ink-900">Von Freunden erhalten</h2>
            <span className="text-xs text-ink-400">{incomingDeckShares.length}</span>
          </div>
          {incomingDeckShares.map(share => (
            <Card key={share.id} className="!p-3 flex items-center gap-3">
              <div className="size-10 rounded-2xl theme-gradient grid place-items-center text-white flex-shrink-0">
                <Layers className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 truncate">{share.deckName}</div>
                <div className="text-xs text-ink-500 truncate">von {share.senderName} · {share.cardCount} {share.cardCount === 1 ? 'Karte' : 'Karten'}</div>
              </div>
              <button onClick={() => acceptDeckShare(share.id)} className="btn-primary py-2 px-3 text-sm flex-shrink-0">
                <Check className="size-4" /> Übernehmen
              </button>
              <button onClick={() => dismissDeckShare(share.id)} title="Verwerfen"
                className="size-9 grid place-items-center rounded-full hover:bg-white/70 text-ink-400 transition flex-shrink-0">
                <X className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {decks.length === 0 && incomingDeckShares.length === 0 ? (
        <Card>
          <Empty
            icon={Layers}
            title="Noch keine Kästen"
            description="Leg einen Kasten an und füll ihn mit Karten – manuell oder per KI-Import aus deinen Notizen."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => setDeckDialog(true)} className="btn-primary"><Plus className="size-4" /> Neuer Kasten</button>
                <button onClick={() => setImportDialog(true)} className="btn-ghost"><Sparkles className="size-4" /> KI-Import</button>
              </div>
            }
          />
        </Card>
      ) : folders.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map(renderDeck)}
        </div>
      ) : (
        <div className="space-y-6">
          {folders.map(folder => {
            const folderDecks = decks.filter(d => d.folderId === folder.id);
            return (
              <FolderSection
                key={folder.id}
                folder={folder}
                count={folderDecks.length}
                canDrop={dragId !== null}
                onDropDeck={() => { if (dragId) { void moveDeck(dragId, folder.id); setDragId(null); } }}
                onRename={async () => { const n = prompt('Ordner umbenennen:', folder.name); if (n?.trim()) await updateDeckFolder(folder.id, { name: n.trim() }); }}
                onDelete={async () => { if (confirm(`Ordner „${folder.name}" löschen? Die Kästen bleiben erhalten.`)) await deleteDeckFolder(folder.id); }}
              >
                {folderDecks.length === 0 ? (
                  <p className="subtle text-sm px-1">Noch keine Kästen in diesem Ordner.</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{folderDecks.map(renderDeck)}</div>
                )}
              </FolderSection>
            );
          })}
          {(ungrouped.length > 0 || dragId) && (
            <FolderSection
              folder={null}
              count={ungrouped.length}
              canDrop={dragId !== null}
              onDropDeck={() => { if (dragId) { void moveDeck(dragId, undefined); setDragId(null); } }}
            >
              {ungrouped.length === 0 ? (
                <p className="subtle text-sm px-1">Kasten hierher ziehen, um ihn aus dem Ordner zu nehmen.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ungrouped.map(renderDeck)}</div>
              )}
            </FolderSection>
          )}
        </div>
      )}

      <DeckDialog open={deckDialog} onClose={() => setDeckDialog(false)} />
      <AiImportDialog open={importDialog} onClose={() => setImportDialog(false)} />
      <AiImportDialog
        open={!!shareImport}
        onClose={() => setShareImport(null)}
        initialText={shareImport?.text}
      />
      {study && (
        <StudySession
          open
          deckName={study.name}
          cards={study.cards}
          frontLabel={study.frontLabel}
          backLabel={study.backLabel}
          onClose={() => setStudy(null)}
          onReview={reviewCard}
          restoreCard={updateCard}
        />
      )}
    </PageShell>
  );
}

function FolderSection({ folder, count, children, onRename, onDelete, canDrop, onDropDeck }: {
  folder: DeckFolder | null;
  count: number;
  children: React.ReactNode;
  onRename?: () => void;
  onDelete?: () => void;
  canDrop?: boolean;
  onDropDeck?: () => void;
}) {
  const [over, setOver] = useState(false);
  const dropProps = onDropDeck ? {
    onDragOver: (e: React.DragEvent) => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); onDropDeck(); },
  } : {};
  return (
    <section
      {...dropProps}
      className={`rounded-3xl transition-colors ${over ? 'ring-2 ring-theme-deep/60 bg-theme-deep/5 -m-2 p-2' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <Folder className="size-4 flex-shrink-0" style={{ color: folder?.color ?? 'rgb(var(--ink-400))' }} />
        <h2 className="font-display font-bold text-ink-900">{folder ? folder.name : 'Ohne Ordner'}</h2>
        <span className="text-xs text-ink-400">{count}</span>
        {folder && onRename && (
          <button onClick={onRename} className="size-7 grid place-items-center rounded-full hover:bg-white/70 text-ink-400 transition ml-1" title="Ordner umbenennen">
            <Pencil className="size-3.5" />
          </button>
        )}
        {folder && onDelete && (
          <button onClick={onDelete} className="size-7 grid place-items-center rounded-full hover:bg-white/70 text-rose-400 transition" title="Ordner löschen">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function DeckCard({ deck, cards, delay, onQuickStudy }: {
  deck: Deck; cards: Flashcard[]; delay: number;
  onQuickStudy: (deck: Deck, cards: Flashcard[]) => void;
}) {
  const due = dueCards(cards);
  const mastery = Math.round(deckMastery(cards) * 100);
  return (
    <Card hoverable delay={delay} className="flex flex-col gap-3 !p-0 overflow-hidden">
      <Link to={`/karteikarten/${deck.id}`} className="block">
        <div className="h-20 flex items-center gap-3 px-5" style={{ background: `linear-gradient(135deg, ${deck.color}, ${deck.color}bb)` }}>
          <div className="size-12 rounded-2xl bg-white/25 grid place-items-center text-white flex-shrink-0">
            <SubjectIcon subject={{ icon: deck.icon, name: deck.name }} className="size-6" strokeWidth={2.25} />
          </div>
          <div className="text-white min-w-0">
            <div className="font-display font-bold truncate">{deck.name}</div>
            <div className="text-xs opacity-85">{cards.length} {cards.length === 1 ? 'Karte' : 'Karten'}</div>
          </div>
        </div>
      </Link>
      <div className="px-5 pb-4 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
            <span>Beherrschung</span>
            <span className="font-semibold tabular-nums">{mastery}%</span>
          </div>
          <div className="h-2 rounded-full bg-ink-900/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${mastery}%`, background: deck.color }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onQuickStudy(deck, due.length ? due : cards)}
            disabled={cards.length === 0}
            className="btn-primary flex-1 py-2"
          >
            <Play className="size-4" />
            {due.length ? `Lernen (${due.length})` : 'Lernen'}
          </button>
          <Link to={`/karteikarten/${deck.id}`} className="btn-ghost py-2 px-3">
            <Pencil className="size-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ─── Detail / Manager ────────────────────────────────────────────────────────

export function DeckDetailPage() {
  const { deckId = '' } = useParams();
  const navigate = useNavigate();
  const decks = useStore(s => s.decks);
  const allCards = useStore(s => s.flashcards);
  const allTopics = useStore(s => s.cardTopics);
  const subjects = useStore(s => s.subjects);
  const reviewCard = useStore(s => s.reviewCard);
  const updateCard = useStore(s => s.updateCard);
  const deleteTopic = useStore(s => s.deleteTopic);
  const updateTopic = useStore(s => s.updateTopic);
  const addTopic = useStore(s => s.addTopic);
  const resetDeckProgress = useStore(s => s.resetDeckProgress);

  const deck = decks.find(d => d.id === deckId);
  const cards = useMemo(() => allCards.filter(c => c.deckId === deckId), [allCards, deckId]);
  const topics = useMemo(
    () => allTopics.filter(t => t.deckId === deckId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [allTopics, deckId],
  );

  const [editDeck, setEditDeck] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cardDialog, setCardDialog] = useState<{ topicId?: string; card?: Flashcard } | null>(null);
  const [study, setStudy] = useState<StudyState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!deck) {
    return (
      <PageShell title="Kasten nicht gefunden">
        <Card><Empty icon={Layers} title="Dieser Kasten existiert nicht" description="Vielleicht wurde er gelöscht oder gehört zu einem anderen Schuljahr."
          action={<Link to="/karteikarten" className="btn-primary">Zurück zur Übersicht</Link>} /></Card>
      </PageShell>
    );
  }

  const due = dueCards(cards);
  const subject = subjects.find(s => s.id === deck.subjectId);
  const dist = boxDistribution(cards);

  const cardsForTopic = (topicId?: string) => cards.filter(c => (c.topicId ?? undefined) === topicId);
  const untopiced = cardsForTopic(undefined);

  async function addTopicPrompt() {
    const name = prompt('Name des neuen Themas:');
    if (name?.trim()) await addTopic({ deckId: deck!.id, name: name.trim() });
  }

  return (
    <PageShell title={
      <span className="flex items-center gap-2">
        <Link to="/karteikarten" className="size-9 grid place-items-center rounded-full hover:bg-white/70 transition -ml-1">
          <ChevronLeft className="size-5" />
        </Link>
        {deck.name}
      </span>
    }>
      {/* Kopf-Karte */}
      <Card className="!p-0 overflow-hidden mb-4">
        <div className="p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${deck.color}, ${deck.color}bb)` }}>
          <div className="size-14 rounded-2xl bg-white/25 grid place-items-center text-white flex-shrink-0">
            <SubjectIcon subject={{ icon: deck.icon, name: deck.name }} className="size-7" strokeWidth={2.25} />
          </div>
          <div className="text-white min-w-0 flex-1">
            <div className="font-display font-bold text-lg truncate">{deck.name}</div>
            <div className="text-xs opacity-85 flex items-center gap-2 flex-wrap">
              <span>{cards.length} Karten · {topics.length} Themen</span>
              {subject && <span className="inline-flex items-center gap-1"><GraduationCap className="size-3" /> {subject.name}</span>}
            </div>
          </div>
          <button onClick={() => setEditDeck(true)} className="size-9 grid place-items-center rounded-full bg-white/20 hover:bg-white/35 text-white transition flex-shrink-0">
            <Pencil className="size-4" />
          </button>
        </div>

        {/* Leitner-Verteilung */}
        {cards.length > 0 && (
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between text-xs text-ink-500 mb-1.5">
              <span>Leitner-Fächer</span>
              <span>{due.length} fällig</span>
            </div>
            <div className="flex gap-1.5">
              {dist.map((n, i) => {
                const pct = cards.length ? (n / cards.length) * 100 : 0;
                return (
                  <div key={i} className="flex-1 text-center">
                    <div className="h-16 rounded-xl bg-ink-900/5 flex items-end overflow-hidden">
                      <motion.div className="w-full rounded-xl" style={{ background: deck.color }}
                        initial={{ height: 0 }} animate={{ height: `${Math.max(pct, n ? 8 : 0)}%` }} transition={{ delay: i * 0.05 }} />
                    </div>
                    <div className="text-[10px] text-ink-400 mt-1">{i + 1}{i === LEITNER_BOXES - 1 ? ' ✓' : ''}</div>
                    <div className="text-[11px] font-semibold text-ink-600 tabular-nums">{n}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Aktionen */}
        <div className="p-5 flex flex-wrap gap-2">
          <button onClick={() => setStudy({ name: deck.name, cards: due.length ? due : cards, frontLabel: deck.frontLabel, backLabel: deck.backLabel })}
            disabled={cards.length === 0} className="btn-primary">
            <Play className="size-4" /> {due.length ? `${due.length} fällige lernen` : 'Lernen'}
          </button>
          {due.length > 0 && due.length < cards.length && (
            <button onClick={() => setStudy({ name: deck.name, cards, frontLabel: deck.frontLabel, backLabel: deck.backLabel })} className="btn-ghost">
              Alle {cards.length} lernen
            </button>
          )}
          <button onClick={() => setCardDialog({})} className="btn-ghost"><Plus className="size-4" /> Karte</button>
          <button onClick={() => setImportOpen(true)} className="btn-ghost"><Upload className="size-4" /> Importieren</button>
          <button onClick={() => setShareOpen(true)} className="btn-ghost"><Share2 className="size-4" /> Teilen</button>
          <div className="relative">
            <button onClick={() => setMenuOpen(v => !v)} className="btn-ghost px-3"><MoreHorizontal className="size-4" /></button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute right-0 mt-1 z-20 w-52 glass-strong rounded-2xl shadow-soft p-1.5">
                    <button onClick={() => { setMenuOpen(false); addTopicPrompt(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-ink-700 hover:bg-white/70 transition text-left">
                      <FolderPlus className="size-4" /> Thema hinzufügen
                    </button>
                    <button onClick={async () => { setMenuOpen(false); if (confirm('Lernfortschritt aller Karten zurücksetzen?')) await resetDeckProgress(deck.id); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-ink-700 hover:bg-white/70 transition text-left">
                      <RotateCcw className="size-4" /> Fortschritt zurücksetzen
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Card>

      {/* Karten-Manager nach Themen */}
      {cards.length === 0 ? (
        <Card>
          <Empty icon={BookOpen} title="Noch keine Karten"
            description="Füge manuell Karten hinzu oder importiere sie per KI/Datei."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => setCardDialog({})} className="btn-primary"><Plus className="size-4" /> Karte hinzufügen</button>
                <button onClick={() => setImportOpen(true)} className="btn-ghost"><Sparkles className="size-4" /> Importieren</button>
              </div>
            } />
        </Card>
      ) : (
        <div className="space-y-4">
          {topics.map(topic => (
            <TopicSection
              key={topic.id} topic={topic} cards={cardsForTopic(topic.id)} deckColor={deck.color}
              onAddCard={() => setCardDialog({ topicId: topic.id })}
              onEditCard={card => setCardDialog({ card })}
              onStudy={tc => setStudy({ name: `${deck.name} · ${topic.name}`, cards: tc, frontLabel: deck.frontLabel, backLabel: deck.backLabel })}
              onRename={async () => { const n = prompt('Thema umbenennen:', topic.name); if (n?.trim()) await updateTopic(topic.id, { name: n.trim() }); }}
              onDelete={async () => {
                const c = cardsForTopic(topic.id).length;
                if (c === 0) { await deleteTopic(topic.id); return; }
                const wipe = confirm(`Thema „${topic.name}" hat ${c} Karten.\n\nOK = Karten mitlöschen\nAbbrechen = Karten behalten (ohne Thema)`);
                await deleteTopic(topic.id, wipe ? 'wipe' : 'orphan');
              }}
            />
          ))}
          {untopiced.length > 0 && (
            <TopicSection
              topic={null} cards={untopiced} deckColor={deck.color}
              onAddCard={() => setCardDialog({})}
              onEditCard={card => setCardDialog({ card })}
              onStudy={tc => setStudy({ name: `${deck.name} · Ohne Thema`, cards: tc, frontLabel: deck.frontLabel, backLabel: deck.backLabel })}
            />
          )}
        </div>
      )}

      <DeckDialog open={editDeck} onClose={() => setEditDeck(false)} initial={deck} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} deck={deck} />
      <AiImportDialog open={importOpen} onClose={() => setImportOpen(false)} deckName={deck.name} intoDeckId={deck.id} />
      {cardDialog && (
        <CardDialog
          open
          onClose={() => setCardDialog(null)}
          deckId={deck.id}
          defaultTopicId={cardDialog.topicId}
          initial={cardDialog.card}
        />
      )}
      {study && (
        <StudySession open deckName={study.name} cards={study.cards} frontLabel={study.frontLabel} backLabel={study.backLabel} onClose={() => setStudy(null)} onReview={reviewCard} restoreCard={updateCard} />
      )}
    </PageShell>
  );
}

function TopicSection({ topic, cards, deckColor, onAddCard, onEditCard, onStudy, onRename, onDelete }: {
  topic: CardTopic | null;
  cards: Flashcard[];
  deckColor: string;
  onAddCard: () => void;
  onEditCard: (card: Flashcard) => void;
  onStudy: (cards: Flashcard[]) => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/40">
        <span className="size-2.5 rounded-full flex-shrink-0" style={{ background: deckColor }} />
        <h3 className="font-display font-bold text-ink-900 flex-1 min-w-0 truncate">
          {topic ? topic.name : 'Ohne Thema'}
        </h3>
        <span className="text-xs text-ink-400">{cards.length}</span>
        <button onClick={() => onStudy(cards)} className="size-8 grid place-items-center rounded-full hover:bg-white/70 text-ink-500 transition" title="Dieses Thema lernen">
          <Play className="size-4" />
        </button>
        {topic && onRename && (
          <button onClick={onRename} className="size-8 grid place-items-center rounded-full hover:bg-white/70 text-ink-500 transition" title="Umbenennen">
            <Pencil className="size-3.5" />
          </button>
        )}
        {topic && onDelete && (
          <button onClick={onDelete} className="size-8 grid place-items-center rounded-full hover:bg-white/70 text-rose-500 transition" title="Thema löschen">
            <Trash2 className="size-3.5" />
          </button>
        )}
        <button onClick={onAddCard} className="size-8 grid place-items-center rounded-full hover:bg-white/70 text-ink-500 transition" title="Karte hinzufügen">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="divide-y divide-white/30">
        {cards.map(card => (
          <button key={card.id} onClick={() => onEditCard(card)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition text-left">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900 truncate">{card.front}</div>
              <div className="text-xs text-ink-500 truncate">{card.back}</div>
            </div>
            <span className="chip text-[10px] flex-shrink-0" title={`Leitner-Fach ${card.box}`}>{card.box}/{LEITNER_BOXES}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
