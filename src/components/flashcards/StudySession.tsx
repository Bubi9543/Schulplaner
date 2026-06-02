import { useMemo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  X, RotateCcw, ArrowLeftRight, Shuffle, Layers, Trophy,
  ThumbsUp, ThumbsDown, ChevronRight, PartyPopper,
} from 'lucide-react';
import type { Flashcard, ReviewDirection, ReviewMode } from '@/types';
import { LEITNER_BOXES } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  deckName: string;
  cards: Flashcard[];
  /** Bewertung an den Store weiterreichen (Leitner). */
  onReview: (cardId: string, correct: boolean) => void;
}

type Phase = 'config' | 'flip' | 'match' | 'done';

/** Mischt eine Kopie eines Arrays (Fisher–Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Für eine Karte: was steht vorne (Prompt), was ist die Lösung – je nach Richtung. */
function sides(card: Flashcard, dir: ReviewDirection): { prompt: string; answer: string } {
  const flip = dir === 'back-front' || (dir === 'mixed' && hashFlip(card.id));
  return flip ? { prompt: card.back, answer: card.front } : { prompt: card.front, answer: card.back };
}
function hashFlip(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0;
}

export function StudySession({ open, onClose, deckName, cards, onReview }: Props) {
  const [phase, setPhase] = useState<Phase>('config');
  const [direction, setDirection] = useState<ReviewDirection>('front-back');
  const [mode, setMode] = useState<ReviewMode>('flip');

  // Beim Öffnen Konfig zurücksetzen.
  useEffect(() => { if (open) setPhase('config'); }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex flex-col"
        style={{ background: 'linear-gradient(180deg, var(--theme-bg-start), var(--theme-bg-end))' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 -z-10 theme-aurora" />
        <div className="absolute inset-0 -z-10 page-veil" />
        {/* Kopfzeile */}
        <div className="flex items-center justify-between px-4 md:px-8 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">Lernen</div>
            <div className="font-display font-bold text-ink-900 truncate">{deckName}</div>
          </div>
          <button onClick={onClose} className="size-10 grid place-items-center rounded-full bg-white/60 hover:bg-white/90 transition flex-shrink-0">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {phase === 'config' && (
            <ConfigStep
              count={cards.length}
              direction={direction} setDirection={setDirection}
              mode={mode} setMode={setMode}
              onStart={() => setPhase(mode === 'match' ? 'match' : 'flip')}
            />
          )}
          {phase === 'flip' && (
            <FlipRunner cards={cards} direction={direction} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'match' && (
            <MatchRunner cards={cards} direction={direction} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'done' && (
            <DoneStep deckName={deckName} onRestart={() => setPhase('config')} onClose={onClose} />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Schritt: Konfiguration ──────────────────────────────────────────────────

function ConfigStep({ count, direction, setDirection, mode, setMode, onStart }: {
  count: number;
  direction: ReviewDirection; setDirection: (d: ReviewDirection) => void;
  mode: ReviewMode; setMode: (m: ReviewMode) => void;
  onStart: () => void;
}) {
  const dirs: { id: ReviewDirection; label: string; icon: typeof ArrowLeftRight }[] = [
    { id: 'front-back', label: 'Vorder → Rück', icon: ChevronRight },
    { id: 'back-front', label: 'Rück → Vorder', icon: RotateCcw },
    { id: 'mixed', label: 'Gemischt', icon: Shuffle },
  ];
  const modes: { id: ReviewMode; label: string; desc: string; icon: typeof Layers }[] = [
    { id: 'flip', label: 'Aufdecken', desc: 'Karte aufdecken & per Swipe bewerten', icon: Layers },
    { id: 'match', label: 'Zuordnen', desc: 'Begriffe einander zuordnen', icon: ArrowLeftRight },
  ];
  return (
    <div className="h-full overflow-y-auto px-5 md:px-8 pb-8 flex items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="size-16 rounded-3xl theme-gradient grid place-items-center mx-auto shadow-glow mb-3">
            <Layers className="size-8 text-white" />
          </div>
          <h2 className="h2">Bereit zum Lernen?</h2>
          <p className="subtle mt-1">{count} {count === 1 ? 'Karte' : 'Karten'} warten auf dich.</p>
        </div>

        <div>
          <label className="label">Abfragerichtung</label>
          <div className="grid grid-cols-3 gap-2">
            {dirs.map(d => (
              <button key={d.id} onClick={() => setDirection(d.id)}
                className={`btn flex-col h-auto py-3 gap-1 ${direction === d.id ? 'btn-primary' : 'btn-ghost'}`}>
                <d.icon className="size-4" />
                <span className="text-[11px] font-semibold leading-tight text-center">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Modus</label>
          <div className="grid grid-cols-1 gap-2">
            {modes.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`btn justify-start h-auto py-3 text-left ${mode === m.id ? 'btn-primary' : 'btn-ghost'}`}>
                <m.icon className="size-5 flex-shrink-0" />
                <span className="flex flex-col">
                  <span className="font-semibold text-sm">{m.label}</span>
                  <span className={`text-[11px] font-normal ${mode === m.id ? 'text-white/85' : 'text-ink-500'}`}>{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={onStart} className="btn-primary w-full py-3.5 text-base" disabled={count === 0}>
          Los geht's
        </button>
      </div>
    </div>
  );
}

// ─── Schritt: Aufdecken + Swipe ──────────────────────────────────────────────

function FlipRunner({ cards, direction, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection;
  onReview: (id: string, correct: boolean) => void; onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correctN, setCorrectN] = useState(0);

  const card = queue[index];
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -40], [1, 0]);

  const advance = useCallback((correct: boolean) => {
    if (!card) return;
    onReview(card.id, correct);
    if (correct) setCorrectN(n => n + 1);
    if (index + 1 >= queue.length) onDone();
    else { setIndex(i => i + 1); setFlipped(false); x.set(0); }
  }, [card, index, queue.length, onReview, onDone, x]);

  if (!card) return null;
  const { prompt, answer } = sides(card, direction);
  const progress = (index / queue.length) * 100;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      {/* Fortschritt */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="h-full theme-gradient rounded-full" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
        <span className="text-xs font-semibold text-ink-500 tabular-nums">{index + 1}/{queue.length}</span>
      </div>

      {/* Kartenstapel */}
      <div className="flex-1 min-h-0 grid place-items-center relative">
        <AnimatePresence>
          <motion.div
            key={card.id}
            className="absolute w-full max-w-md aspect-[3/4] max-h-full cursor-pointer touch-none"
            style={{ x, rotate }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(_, info) => {
              if (info.offset.x > 110 || info.velocity.x > 600) advance(true);
              else if (info.offset.x < -110 || info.velocity.x < -600) advance(false);
            }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => setFlipped(f => !f)}
          >
            {/* Swipe-Indikatoren */}
            <motion.div style={{ opacity: likeOpacity }} className="absolute top-5 left-5 z-10 rotate-[-12deg] rounded-xl border-4 border-emerald-500 text-emerald-500 px-3 py-1 font-display font-extrabold text-xl">
              GEWUSST
            </motion.div>
            <motion.div style={{ opacity: nopeOpacity }} className="absolute top-5 right-5 z-10 rotate-[12deg] rounded-xl border-4 border-rose-500 text-rose-500 px-3 py-1 font-display font-extrabold text-xl">
              NOCHMAL
            </motion.div>

            <div className="size-full glass-strong rounded-[2rem] shadow-soft p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <span className="absolute top-4 left-4 chip text-[10px]">Fach {card.box}/{LEITNER_BOXES}</span>
              <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider font-semibold text-ink-400">
                {flipped ? 'Antwort' : 'Frage'}
              </span>
              <motion.div
                key={flipped ? 'a' : 'q'}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="font-display font-bold text-ink-900 text-xl md:text-2xl whitespace-pre-wrap break-words"
              >
                {flipped ? answer : prompt}
              </motion.div>
              {!flipped && <div className="subtle text-xs mt-6 absolute bottom-5">Tippen zum Aufdecken</div>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bewerten-Buttons */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button onClick={() => advance(false)}
          className="size-16 rounded-full bg-white/70 hover:bg-white shadow-soft grid place-items-center text-rose-500 active:scale-95 transition">
          <ThumbsDown className="size-7" />
        </button>
        <button onClick={() => setFlipped(f => !f)}
          className="size-12 rounded-full bg-white/70 hover:bg-white shadow-soft grid place-items-center text-ink-500 active:scale-95 transition">
          <RotateCcw className="size-5" />
        </button>
        <button onClick={() => advance(true)}
          className="size-16 rounded-full bg-white/70 hover:bg-white shadow-soft grid place-items-center text-emerald-500 active:scale-95 transition">
          <ThumbsUp className="size-7" />
        </button>
      </div>
      <div className="text-center subtle text-xs mt-2">
        Nach links wischen = nochmal · nach rechts = gewusst · {correctN} richtig
      </div>
    </div>
  );
}

// ─── Schritt: Zuordnen (Matching) ────────────────────────────────────────────

interface MatchItem { cardId: string; text: string; side: 'p' | 'a'; }

function MatchRunner({ cards, direction, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection;
  onReview: (id: string, correct: boolean) => void; onDone: () => void;
}) {
  const BATCH = 5;
  const batches = useMemo(() => {
    const chunks: Flashcard[][] = [];
    const shuffled = shuffle(cards);
    for (let i = 0; i < shuffled.length; i += BATCH) chunks.push(shuffled.slice(i, i + BATCH));
    return chunks;
  }, [cards]);

  const [batchIdx, setBatchIdx] = useState(0);
  const batch = batches[batchIdx] ?? [];

  const prompts = useMemo(() => batch.map(c => ({ cardId: c.id, text: sides(c, direction).prompt, side: 'p' as const })), [batch, direction]);
  const answers = useMemo(() => shuffle(batch.map(c => ({ cardId: c.id, text: sides(c, direction).answer, side: 'a' as const }))), [batch, direction]);

  const [selected, setSelected] = useState<MatchItem | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [erred, setErred] = useState<Set<string>>(new Set());

  // Wenn alle Karten des Batches zugeordnet → nächster Batch oder fertig.
  useEffect(() => {
    if (batch.length > 0 && matched.size === batch.length) {
      const t = setTimeout(() => {
        if (batchIdx + 1 >= batches.length) onDone();
        else {
          setBatchIdx(i => i + 1);
          setSelected(null); setMatched(new Set()); setErred(new Set()); setWrongPair(null);
        }
      }, 450);
      return () => clearTimeout(t);
    }
  }, [matched, batch.length, batchIdx, batches.length, onDone]);

  function pick(item: MatchItem) {
    if (matched.has(item.cardId)) return;
    if (!selected) { setSelected(item); return; }
    if (selected.side === item.side) { setSelected(item); return; } // gleiche Spalte → Auswahl wechseln
    // Paar prüfen
    if (selected.cardId === item.cardId) {
      const correctFirstTry = !erred.has(item.cardId);
      onReview(item.cardId, correctFirstTry);
      setMatched(m => new Set(m).add(item.cardId));
      setSelected(null);
    } else {
      // Falsch: beide kurz rot markieren, beide Karten als „verhauen" merken.
      setErred(e => new Set(e).add(selected.cardId).add(item.cardId));
      setWrongPair([selected.cardId + selected.side, item.cardId + item.side]);
      setTimeout(() => { setWrongPair(null); setSelected(null); }, 550);
    }
  }

  function Tile({ item }: { item: MatchItem }) {
    const key = item.cardId + item.side;
    const isSel = selected?.cardId === item.cardId && selected?.side === item.side;
    const isMatched = matched.has(item.cardId);
    const isWrong = wrongPair?.includes(key);
    return (
      <button
        onClick={() => pick(item)}
        disabled={isMatched}
        className={`w-full rounded-2xl p-3 text-sm text-left transition border min-h-[64px] flex items-center
          ${isMatched ? 'opacity-0 pointer-events-none scale-95' :
            isWrong ? 'bg-rose-500/15 border-rose-500/50 text-rose-700' :
            isSel ? 'theme-gradient text-white border-transparent shadow-glow scale-[1.02]' :
            'glass border-white/50 text-ink-800 hover:bg-white/80'}`}
      >
        <span className="whitespace-pre-wrap break-words line-clamp-4">{item.text}</span>
      </button>
    );
  }

  const totalProgress = ((batchIdx + (batch.length ? matched.size / batch.length : 0)) / Math.max(1, batches.length)) * 100;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="h-full theme-gradient rounded-full" animate={{ width: `${totalProgress}%` }} />
        </div>
        <span className="text-xs font-semibold text-ink-500">Runde {batchIdx + 1}/{batches.length}</span>
      </div>
      <p className="subtle text-center text-xs mb-3">Tippe einen Begriff und seine passende Antwort an.</p>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
          <div className="space-y-2.5">
            {prompts.map(p => <Tile key={p.cardId + p.side} item={p} />)}
          </div>
          <div className="space-y-2.5">
            {answers.map(a => <Tile key={a.cardId + a.side} item={a} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Schritt: Fertig ─────────────────────────────────────────────────────────

function DoneStep({ deckName, onRestart, onClose }: { deckName: string; onRestart: () => void; onClose: () => void }) {
  return (
    <div className="h-full grid place-items-center px-6 pb-8">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
        <div className="size-20 rounded-3xl theme-gradient grid place-items-center mx-auto shadow-glow mb-4">
          <Trophy className="size-10 text-white" />
        </div>
        <h2 className="h2 flex items-center justify-center gap-2"><PartyPopper className="size-6 text-amber-500" /> Geschafft!</h2>
        <p className="subtle mt-2">Du hast „{deckName}" durchgearbeitet. Dein Lernfortschritt wurde gespeichert.</p>
        <div className="flex flex-col gap-2 mt-6">
          <button onClick={onRestart} className="btn-primary w-full"><RotateCcw className="size-4" /> Nochmal lernen</button>
          <button onClick={onClose} className="btn-ghost w-full">Fertig</button>
        </div>
      </motion.div>
    </div>
  );
}
