import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  X, RotateCcw, ArrowLeftRight, Shuffle, Layers, Trophy, Undo2, Flag,
  ThumbsUp, ThumbsDown, Equal, ChevronRight, PartyPopper,
  Keyboard, Check, ArrowRight, CornerDownLeft, ListChecks, Brain, ClipboardCheck,
  Flame, Heart, Crown,
} from 'lucide-react';
import type { Flashcard, ReviewDirection, ReviewMode, ReviewOutcome, TypoTolerance } from '@/types';
import { LEITNER_BOXES } from '@/types';
import { judgeTyped, outcomeFromTyped, buildChoices } from '@/lib/flashcards';

interface Props {
  open: boolean;
  onClose: () => void;
  deckName: string;
  cards: Flashcard[];
  /** Beschriftung der Vorder-/Rückseite (z. B. „Deutsch"/„Englisch"). Optional. */
  frontLabel?: string;
  backLabel?: string;
  /** Bewertung an den Store weiterreichen (Leitner). */
  onReview: (cardId: string, outcome: ReviewOutcome) => void;
  /** Setzt eine Karte auf einen früheren Stand zurück (für „Zurück"). */
  restoreCard: (cardId: string, snapshot: Partial<Flashcard>) => void;
}

type Phase = 'config' | 'flip' | 'match' | 'write' | 'choice' | 'learn' | 'test' | 'gravity' | 'done';

/** Modi, bei denen die Antwort getippt wird → Toleranz-Regler relevant. */
const TYPED_MODES: ReviewMode[] = ['write', 'learn', 'test'];

/** Mischt eine Kopie eines Arrays (Fisher–Yates). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Beschriftungen der beiden Seiten (Fallback: „Frage"/„Antwort"). */
interface SideLabels { front?: string; back?: string; }

/** Für eine Karte: was steht vorne (Prompt), was ist die Lösung – je nach Richtung. */
function sides(card: Flashcard, dir: ReviewDirection, labels?: SideLabels): {
  prompt: string; answer: string; promptLabel: string; answerLabel: string;
} {
  const flip = dir === 'back-front' || (dir === 'mixed' && hashFlip(card.id));
  const frontLabel = labels?.front?.trim() || 'Frage';
  const backLabel = labels?.back?.trim() || 'Antwort';
  return flip
    ? { prompt: card.back, answer: card.front, promptLabel: backLabel, answerLabel: frontLabel }
    : { prompt: card.front, answer: card.back, promptLabel: frontLabel, answerLabel: backLabel };
}
function hashFlip(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0;
}

/** Snapshot der Leitner-relevanten Felder (für „Zurück"/Undo). */
function snapshotOf(card: Flashcard): Partial<Flashcard> {
  return { box: card.box, reviewedAt: card.reviewedAt, correctCount: card.correctCount, wrongCount: card.wrongCount };
}

export function StudySession({ open, onClose, deckName, cards, frontLabel, backLabel, onReview, restoreCard }: Props) {
  const [phase, setPhase] = useState<Phase>('config');
  const [direction, setDirection] = useState<ReviewDirection>('front-back');
  const [mode, setMode] = useState<ReviewMode>('flip');
  const [tolerance, setTolerance] = useState<TypoTolerance>('lenient');
  // Anzahl der Aufgaben in der Prüfung (0 = alle).
  const [testCount, setTestCount] = useState(0);
  const labels = useMemo<SideLabels>(() => ({ front: frontLabel, back: backLabel }), [frontLabel, backLabel]);

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
              tolerance={tolerance} setTolerance={setTolerance}
              testCount={testCount} setTestCount={setTestCount}
              onStart={() => setPhase(mode === 'flip' ? 'flip' : (mode as Phase))}
            />
          )}
          {phase === 'flip' && (
            <FlipRunner cards={cards} direction={direction} labels={labels} onReview={onReview} restoreCard={restoreCard} onDone={() => setPhase('done')} />
          )}
          {phase === 'match' && (
            <MatchRunner cards={cards} direction={direction} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'write' && (
            <WriteRunner cards={cards} direction={direction} labels={labels} tolerance={tolerance} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'choice' && (
            <ChoiceRunner cards={cards} direction={direction} labels={labels} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'learn' && (
            <LearnRunner cards={cards} direction={direction} labels={labels} tolerance={tolerance} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'test' && (
            <TestRunner cards={cards} direction={direction} labels={labels} tolerance={tolerance} limit={testCount} onReview={onReview} onDone={() => setPhase('done')} />
          )}
          {phase === 'gravity' && (
            <MeteorRunner cards={cards} direction={direction} labels={labels} tolerance={tolerance} onReview={onReview} onDone={() => setPhase('done')} />
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

function ConfigStep({ count, direction, setDirection, mode, setMode, tolerance, setTolerance, testCount, setTestCount, onStart }: {
  count: number;
  direction: ReviewDirection; setDirection: (d: ReviewDirection) => void;
  mode: ReviewMode; setMode: (m: ReviewMode) => void;
  tolerance: TypoTolerance; setTolerance: (t: TypoTolerance) => void;
  testCount: number; setTestCount: (n: number) => void;
  onStart: () => void;
}) {
  const dirs: { id: ReviewDirection; label: string; icon: typeof ArrowLeftRight }[] = [
    { id: 'front-back', label: 'Vorder → Rück', icon: ChevronRight },
    { id: 'back-front', label: 'Rück → Vorder', icon: RotateCcw },
    { id: 'mixed', label: 'Gemischt', icon: Shuffle },
  ];
  const modes: { id: ReviewMode; label: string; desc: string; icon: typeof Layers }[] = [
    { id: 'flip', label: 'Aufdecken', desc: 'Karte aufdecken & per Swipe bewerten', icon: Layers },
    { id: 'write', label: 'Schreiben', desc: 'Antwort selbst eintippen', icon: Keyboard },
    { id: 'choice', label: 'Multiple-Choice', desc: 'Aus 4 Antworten die richtige tippen', icon: ListChecks },
    { id: 'learn', label: 'Lernen', desc: 'Adaptiv: erst Auswahl, dann Tippen – bis alles sitzt', icon: Brain },
    { id: 'test', label: 'Prüfung', desc: 'Gemischte Prüfung mit Auswertung am Ende', icon: ClipboardCheck },
    { id: 'match', label: 'Zuordnen', desc: 'Begriffe einander zuordnen', icon: ArrowLeftRight },
    { id: 'gravity', label: 'Meteor', desc: 'Antwort tippen, bevor die Karte einschlägt', icon: Flame },
  ];
  const showTolerance = TYPED_MODES.includes(mode);
  const showCount = mode === 'test';
  // Auswahl-Knöpfe in 5er-Schritten (5, 10, 15 …) plus „Alle".
  const countSteps: number[] = [];
  for (let n = 5; n < count; n += 5) countSteps.push(n);
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

        <AnimatePresence initial={false}>
          {showTolerance && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ToleranceSlider tolerance={tolerance} setTolerance={setTolerance} />
            </motion.div>
          )}
          {showCount && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div>
                <label className="label">Wie viele Vokabeln abfragen?</label>
                <div className="flex flex-wrap gap-2">
                  {countSteps.map(n => (
                    <button key={n} onClick={() => setTestCount(n)}
                      className={`btn px-4 py-2 ${testCount === n ? 'btn-primary' : 'btn-ghost'}`}>
                      {n}
                    </button>
                  ))}
                  <button onClick={() => setTestCount(0)}
                    className={`btn px-4 py-2 ${testCount === 0 ? 'btn-primary' : 'btn-ghost'}`}>
                    Alle ({count})
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={onStart} className="btn-primary w-full py-3.5 text-base" disabled={count === 0}>
          Los geht's
        </button>
      </div>
    </div>
  );
}

/** Schieberegler für die erlaubte Fehlergröße beim Tippen. */
function ToleranceSlider({ tolerance, setTolerance }: {
  tolerance: TypoTolerance; setTolerance: (t: TypoTolerance) => void;
}) {
  const steps: { id: TypoTolerance; label: string; hint: string }[] = [
    { id: 'exact', label: 'Exakt', hint: 'Muss Buchstabe für Buchstabe stimmen.' },
    { id: 'lenient', label: 'Normal', hint: 'Kleine Vertipper, Groß/Klein & Akzente werden verziehen.' },
    { id: 'loose', label: 'Großzügig', hint: 'Auch mehrere Abweichungen gehen noch durch.' },
  ];
  const idx = steps.findIndex(s => s.id === tolerance);
  return (
    <div className="rounded-2xl bg-white/40 p-4">
      <div className="flex items-center justify-between mb-1">
        <label className="label !mb-0">Fehler erlaubt?</label>
        <span className="chip text-[11px]">{steps[idx].label}</span>
      </div>
      <input
        type="range" min={0} max={2} step={1} value={idx}
        onChange={e => setTolerance(steps[Number(e.target.value)].id)}
        className="w-full accent-theme-deep cursor-pointer"
      />
      <div className="flex justify-between text-[10px] font-semibold text-ink-400 mt-1">
        <span>Streng</span><span>Großzügig</span>
      </div>
      <p className="subtle text-xs mt-2">{steps[idx].hint}</p>
    </div>
  );
}

// ─── Schritt: Schreiben (Texteingabe) ────────────────────────────────────────

function WriteRunner({ cards, direction, labels, tolerance, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels; tolerance: TypoTolerance;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  // null = noch nicht geprüft; sonst das Ergebnis der aktuellen Karte.
  const [result, setResult] = useState<null | { outcome: ReviewOutcome }>(null);
  const [stats, setStats] = useState({ correct: 0, partial: 0, wrong: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const card = queue[index];
  const { prompt, answer, promptLabel, answerLabel } = useMemo(
    () => sides(card, direction, labels),
    [card, direction, labels],
  );

  // Nach jedem Kartenwechsel das Eingabefeld fokussieren.
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, [index]);

  const check = useCallback(() => {
    if (!card || result) return;
    const outcome = outcomeFromTyped(judgeTyped(input, answer, tolerance));
    onReview(card.id, outcome);
    setStats(s => ({ ...s, [outcome]: s[outcome] + 1 }));
    setResult({ outcome });
  }, [card, result, input, answer, tolerance, onReview]);

  // „Ich hatte recht": Fehlbewertung nachträglich auf richtig heben.
  const override = useCallback(() => {
    if (!card || !result || result.outcome === 'correct') return;
    onReview(card.id, 'correct');
    setStats(s => ({ ...s, [result.outcome]: Math.max(0, s[result.outcome] - 1), correct: s.correct + 1 }));
    setResult({ outcome: 'correct' });
  }, [card, result, onReview]);

  const next = useCallback(() => {
    if (index + 1 >= queue.length) { onDone(); return; }
    setIndex(i => i + 1);
    setInput('');
    setResult(null);
  }, [index, queue.length, onDone]);

  if (!card) return null;
  const progress = (index / queue.length) * 100;
  const tone = result?.outcome === 'correct' ? 'emerald' : result?.outcome === 'partial' ? 'amber' : 'rose';

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      {/* Fortschritt + Beenden */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="h-full theme-gradient rounded-full" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
        <span className="text-xs font-semibold text-ink-500 tabular-nums">{index + 1}/{queue.length}</span>
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition" title="Lernen beenden">
          <Flag className="size-3" /> Beenden
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center max-w-md w-full mx-auto">
        {/* Frage */}
        <div className="glass-strong rounded-[2rem] shadow-soft p-6 text-center mb-4">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{promptLabel}</span>
          <div className="font-display font-bold text-ink-900 text-xl md:text-2xl whitespace-pre-wrap break-words mt-2">{prompt}</div>
        </div>

        {/* Eingabe / Ergebnis */}
        {!result ? (
          <form onSubmit={e => { e.preventDefault(); check(); }} className="space-y-3">
            <label className="label">Deine Antwort{answerLabel ? ` (${answerLabel})` : ''}</label>
            <input
              ref={inputRef} className="input text-center text-lg" value={input}
              onChange={e => setInput(e.target.value)} placeholder="Antwort eintippen …"
              autoComplete="off" autoCorrect="off" spellCheck={false}
            />
            <div className="flex gap-2">
              <button type="button" onClick={check} className="btn-soft flex-1 py-3 text-ink-500">
                Weiß ich nicht
              </button>
              <button type="submit" className="btn-primary flex-1 py-3">
                <Check className="size-4" /> Prüfen
              </button>
            </div>
            <p className="subtle text-center text-[11px]"><CornerDownLeft className="size-3 inline" /> Enter zum Prüfen</p>
          </form>
        ) : (
          <Feedback
            tone={tone} outcome={result.outcome} expected={answer} given={input}
            onNext={next} onOverride={override}
          />
        )}
      </div>

      <div className="text-center subtle text-xs mt-3">
        <span className="text-emerald-600 font-semibold">{stats.correct}</span> gewusst · <span className="text-amber-600 font-semibold">{stats.partial}</span> fast · <span className="text-rose-600 font-semibold">{stats.wrong}</span> daneben
      </div>
    </div>
  );
}

/** Auswertung einer getippten Antwort mit „Weiter" (Enter) und Override. */
function Feedback({ tone, outcome, expected, given, onNext, onOverride }: {
  tone: 'emerald' | 'amber' | 'rose'; outcome: ReviewOutcome;
  expected: string; given: string; onNext: () => void; onOverride: () => void;
}) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setTimeout(() => nextRef.current?.focus(), 50); }, []);
  const ring = { emerald: 'border-emerald-500/50 bg-emerald-500/10', amber: 'border-amber-500/50 bg-amber-500/10', rose: 'border-rose-500/50 bg-rose-500/10' }[tone];
  const text = { emerald: 'text-emerald-700', amber: 'text-amber-700', rose: 'text-rose-700' }[tone];
  const heading = outcome === 'correct' ? 'Richtig!' : outcome === 'partial' ? 'Fast – kleiner Fehler' : 'Nicht ganz';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className={`rounded-2xl border p-4 ${ring}`}>
        <div className={`font-display font-bold ${text} flex items-center gap-2`}>
          {outcome === 'wrong' ? <X className="size-5" /> : <Check className="size-5" />} {heading}
        </div>
        {outcome !== 'correct' && (
          <div className="mt-2 text-sm">
            <div className="text-ink-500">Richtige Antwort:</div>
            <div className="font-semibold text-ink-900 whitespace-pre-wrap break-words">{expected}</div>
            {given.trim() && <div className="text-ink-400 text-xs mt-1">Du: „{given}"</div>}
          </div>
        )}
      </div>
      {outcome === 'wrong' && (
        <button onClick={onOverride} className="btn-soft w-full py-2 text-sm">
          Ich hatte doch recht (als gewusst werten)
        </button>
      )}
      <button ref={nextRef} onClick={onNext} className="btn-primary w-full py-3">
        Weiter <ArrowRight className="size-4" />
      </button>
    </motion.div>
  );
}

// ─── Schritt: Multiple-Choice ────────────────────────────────────────────────

function ChoiceRunner({ cards, direction, labels, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [stats, setStats] = useState({ correct: 0, wrong: 0 });

  const card = queue[index];
  const answerOf = useCallback((c: Flashcard) => sides(c, direction).answer, [direction]);
  const { prompt, promptLabel } = useMemo(() => sides(card, direction, labels), [card, direction, labels]);
  // Optionen je Karte einmal bauen (buildChoices mischt selbst).
  const { options, correctIndex } = useMemo(
    () => buildChoices(card, cards, answerOf, 4),
    [card, cards, answerOf],
  );

  const pick = useCallback((i: number) => {
    if (chosen !== null || !card) return;
    const outcome: ReviewOutcome = i === correctIndex ? 'correct' : 'wrong';
    onReview(card.id, outcome);
    setStats(s => ({ ...s, [outcome]: s[outcome] + 1 }));
    setChosen(i);
  }, [chosen, card, correctIndex, onReview]);

  // Nach der Auswahl kurz das Ergebnis zeigen, dann weiter.
  useEffect(() => {
    if (chosen === null) return;
    const t = setTimeout(() => {
      if (index + 1 >= queue.length) { onDone(); return; }
      setIndex(i => i + 1);
      setChosen(null);
    }, 1100);
    return () => clearTimeout(t);
  }, [chosen, index, queue.length, onDone]);

  if (!card) return null;
  const progress = (index / queue.length) * 100;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="h-full theme-gradient rounded-full" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
        <span className="text-xs font-semibold text-ink-500 tabular-nums">{index + 1}/{queue.length}</span>
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition" title="Lernen beenden">
          <Flag className="size-3" /> Beenden
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="glass-strong rounded-[2rem] shadow-soft p-6 text-center mb-4">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{promptLabel}</span>
          <div className="font-display font-bold text-ink-900 text-xl md:text-2xl whitespace-pre-wrap break-words mt-2">{prompt}</div>
        </div>

        <div className="grid gap-2.5">
          {options.map((opt, i) => {
            const isCorrect = i === correctIndex;
            const isChosen = chosen === i;
            const reveal = chosen !== null;
            const cls = reveal
              ? isCorrect
                ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-800'
                : isChosen
                  ? 'bg-rose-500/15 border-rose-500/60 text-rose-800'
                  : 'glass border-white/40 text-ink-400 opacity-60'
              : 'glass border-white/50 text-ink-800 hover:bg-white/80 active:scale-[0.99]';
            return (
              <button key={i} onClick={() => pick(i)} disabled={reveal}
                className={`w-full rounded-2xl p-4 text-left text-sm md:text-base border transition flex items-center gap-3 ${cls}`}>
                <span className="size-6 rounded-lg bg-white/60 grid place-items-center text-xs font-bold flex-shrink-0">
                  {reveal && isCorrect ? <Check className="size-4" /> : reveal && isChosen ? <X className="size-4" /> : String.fromCharCode(65 + i)}
                </span>
                <span className="whitespace-pre-wrap break-words">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center subtle text-xs mt-3">
        <span className="text-emerald-600 font-semibold">{stats.correct}</span> richtig · <span className="text-rose-600 font-semibold">{stats.wrong}</span> falsch
      </div>
    </div>
  );
}

// ─── Schritt: Lernen (adaptiv) ───────────────────────────────────────────────
//
// Jede Karte hat eine Stufe: 0 = neu → wird per Multiple-Choice gefragt,
// 1 = einmal erkannt → muss getippt werden, 2 = sitzt (raus). Richtig hebt die
// Stufe, falsch wirft auf 0 zurück. Fertig, wenn alle Karten Stufe 2 erreichen.
// Gelernt wird in 5er-Päckchen: erst Multiple-Choice, dann Tippen je Päckchen.

const LEARN_BATCH = 5;

function LearnRunner({ cards, direction, labels, tolerance, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels; tolerance: TypoTolerance;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [levels, setLevels] = useState<Record<string, number>>(
    () => Object.fromEntries(queue.map(c => [c.id, 0])),
  );
  const [pos, setPos] = useState(0);
  // Transienter Zustand der aktuellen Frage:
  const [chosen, setChosen] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<null | { outcome: ReviewOutcome }>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Neue Stufe der aktuellen Karte – wird erst beim Weitergehen übernommen,
  // damit Karte & Auswertung während der Anzeige stabil bleiben.
  const pendingLevel = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const mastered = useMemo(() => Object.values(levels).filter(l => l >= 2).length, [levels]);
  // Mindestens einmal per Multiple-Choice erkannt (Stufe 1+). Enthält auch die
  // schon gemeisterten Karten – für den helleren Fortschrittsbalken.
  const recognized = useMemo(() => Object.values(levels).filter(l => l >= 1).length, [levels]);
  const allDone = queue.length > 0 && mastered >= queue.length;

  // In 5er-Päckchen lernen: das erste Päckchen mit noch offenen Karten ist aktiv.
  // So werden 5 Karten erst per Multiple-Choice, dann sofort getippt – bevor das
  // nächste Päckchen kommt (man hat sie noch frisch im Kopf).
  let batchStart = 0;
  for (let b = 0; b < queue.length; b += LEARN_BATCH) {
    if (queue.slice(b, b + LEARN_BATCH).some(c => (levels[c.id] ?? 0) < 2)) { batchStart = b; break; }
  }
  const batch = queue.slice(batchStart, batchStart + LEARN_BATCH);

  // Aktuelle Karte: ab pos die erste offene Karte im Päckchen (mit Umlauf).
  let card: Flashcard | null = null;
  let ci = -1;
  for (let k = 0; k < batch.length; k++) {
    const idx = (pos + k) % batch.length;
    if ((levels[batch[idx].id] ?? 0) < 2) { card = batch[idx]; ci = idx; break; }
  }

  useEffect(() => { if (allDone) onDone(); }, [allDone, onDone]);
  const level = card ? (levels[card.id] ?? 0) : 0;
  const asChoice = level === 0;

  const answerOf = useCallback((c: Flashcard) => sides(c, direction).answer, [direction]);
  const view = useMemo(() => card ? sides(card, direction, labels) : null, [card, direction, labels]);
  const choices = useMemo(
    () => (card && asChoice ? buildChoices(card, cards, answerOf, 4) : null),
    [card, asChoice, cards, answerOf],
  );

  useEffect(() => { if (card && !asChoice) setTimeout(() => inputRef.current?.focus(), 50); }, [card?.id, asChoice]);

  if (!card || !view) return null;

  const curId = card.id;
  const curCi = ci;

  // Zur nächsten Karte: erst die vorgemerkte Stufe der aktuellen Karte übernehmen,
  // dann weiterrücken und die Auswertung zurücksetzen.
  function goNext() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = pendingLevel.current;
    pendingLevel.current = null;
    if (next !== null) setLevels(l => ({ ...l, [curId]: next }));
    setPos((curCi + 1) % Math.max(1, batch.length));
    setChosen(null); setInput(''); setResult(null);
  }

  // Multiple-Choice-Antwort: kurz die Auflösung zeigen, dann weiter.
  function pickChoice(i: number) {
    if (!choices || chosen !== null) return;
    const correct = i === choices.correctIndex;
    onReview(curId, correct ? 'correct' : 'wrong');
    pendingLevel.current = correct ? 1 : 0;
    setChosen(i);
    timer.current = setTimeout(goNext, 1050);
  }

  // Getippte Antwort prüfen (Auswertung bleibt stehen bis „Weiter").
  function checkTyped() {
    if (result) return;
    const outcome = outcomeFromTyped(judgeTyped(input, view!.answer, tolerance));
    onReview(curId, outcome);
    pendingLevel.current = outcome === 'wrong' ? 0 : 2;
    setResult({ outcome });
  }
  function overrideTyped() {
    if (!result || result.outcome === 'correct') return;
    onReview(curId, 'correct');
    pendingLevel.current = 2;
    setResult({ outcome: 'correct' });
  }

  const masteredPct = (mastered / queue.length) * 100;
  const recognizedPct = (recognized / queue.length) * 100;
  const tone = result?.outcome === 'correct' ? 'emerald' : result?.outcome === 'partial' ? 'amber' : 'rose';
  const spring = { type: 'spring' as const, stiffness: 200, damping: 30 };

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="flex items-center gap-3 mb-1.5">
        {/* Zweifarbig: heller Balken = per Multiple-Choice erkannt, kräftig = sitzt */}
        <div className="relative flex-1 h-2.5 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-theme-deep/25"
            animate={{ width: `${recognizedPct}%` }} transition={spring} />
          <motion.div className="absolute inset-y-0 left-0 rounded-full theme-gradient"
            animate={{ width: `${masteredPct}%` }} transition={spring} />
        </div>
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition" title="Lernen beenden">
          <Flag className="size-3" /> Beenden
        </button>
      </div>
      <div className="flex items-center justify-center gap-4 mb-3 text-[11px] font-semibold tabular-nums">
        <span className="flex items-center gap-1 text-theme-deep/70"><ListChecks className="size-3" /> {recognized}/{queue.length} erkannt</span>
        <span className="flex items-center gap-1 text-ink-700"><Check className="size-3" /> {mastered}/{queue.length} sitzt</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="chip text-[10px]">{asChoice ? <><ListChecks className="size-3" /> Erkennen</> : <><Keyboard className="size-3" /> Schreiben</>}</span>
        </div>
        <div className="glass-strong rounded-[2rem] shadow-soft p-6 text-center mb-4">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{view.promptLabel}</span>
          <div className="font-display font-bold text-ink-900 text-xl md:text-2xl whitespace-pre-wrap break-words mt-2">{view.prompt}</div>
        </div>

        {asChoice && choices ? (
          <div className="grid gap-2.5">
            {choices.options.map((opt, i) => {
              const isCorrect = i === choices.correctIndex;
              const isChosen = chosen === i;
              const reveal = chosen !== null;
              const cls = reveal
                ? isCorrect ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-800'
                  : isChosen ? 'bg-rose-500/15 border-rose-500/60 text-rose-800'
                  : 'glass border-white/40 text-ink-400 opacity-60'
                : 'glass border-white/50 text-ink-800 hover:bg-white/80 active:scale-[0.99]';
              return (
                <button key={i} onClick={() => pickChoice(i)} disabled={reveal}
                  className={`w-full rounded-2xl p-4 text-left text-sm md:text-base border transition flex items-center gap-3 ${cls}`}>
                  <span className="size-6 rounded-lg bg-white/60 grid place-items-center text-xs font-bold flex-shrink-0">
                    {reveal && isCorrect ? <Check className="size-4" /> : reveal && isChosen ? <X className="size-4" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="whitespace-pre-wrap break-words">{opt}</span>
                </button>
              );
            })}
          </div>
        ) : !result ? (
          <form onSubmit={e => { e.preventDefault(); checkTyped(); }} className="space-y-3">
            <label className="label">Deine Antwort{view.answerLabel ? ` (${view.answerLabel})` : ''}</label>
            <input ref={inputRef} className="input text-center text-lg" value={input}
              onChange={e => setInput(e.target.value)} placeholder="Antwort eintippen …"
              autoComplete="off" autoCorrect="off" spellCheck={false} />
            <div className="flex gap-2">
              <button type="button" onClick={checkTyped} className="btn-soft flex-1 py-3 text-ink-500">Weiß ich nicht</button>
              <button type="submit" className="btn-primary flex-1 py-3"><Check className="size-4" /> Prüfen</button>
            </div>
          </form>
        ) : (
          <Feedback tone={tone} outcome={result.outcome} expected={view.answer} given={input} onNext={goNext} onOverride={overrideTyped} />
        )}
      </div>
    </div>
  );
}

// ─── Schritt: Prüfung (gemischte Aufgaben mit Auswertung) ────────────────────

type TestQ =
  | { kind: 'choice'; card: Flashcard; prompt: string; label: string; answer: string; options: string[]; correctIndex: number }
  | { kind: 'write'; card: Flashcard; prompt: string; label: string; answer: string; answerLabel: string }
  | { kind: 'tf'; card: Flashcard; prompt: string; label: string; answer: string; shown: string; truth: boolean };

function TestRunner({ cards, direction, labels, tolerance, limit, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels; tolerance: TypoTolerance;
  /** Anzahl der Aufgaben; 0 = alle Karten. */
  limit: number;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
}) {
  const answerOf = useCallback((c: Flashcard) => sides(c, direction).answer, [direction]);

  // Prüfung einmalig zusammenstellen.
  const questions = useMemo<TestQ[]>(() => {
    const picked = shuffle(cards).slice(0, limit > 0 ? limit : cards.length);
    return picked.map((card, i): TestQ => {
      const v = sides(card, direction, labels);
      const kind = (['choice', 'write', 'tf'] as const)[i % 3];
      if (kind === 'choice') {
        const { options, correctIndex } = buildChoices(card, cards, answerOf, 4);
        return { kind, card, prompt: v.prompt, label: v.promptLabel, answer: v.answer, options, correctIndex };
      }
      if (kind === 'write') {
        return { kind, card, prompt: v.prompt, label: v.promptLabel, answer: v.answer, answerLabel: v.answerLabel };
      }
      // Wahr/Falsch: mal die echte Lösung, mal einen Ablenker zeigen.
      // Deterministisch aus der Karten-ID, damit der Render rein bleibt.
      const truth = hashFlip(card.id + ':tf');
      let shown = v.answer;
      if (!truth) {
        const pair = buildChoices(card, cards, answerOf, 2).options;
        shown = pair.find(o => o.trim() !== v.answer.trim()) ?? v.answer;
        if (shown.trim() === v.answer.trim()) return { kind, card, prompt: v.prompt, label: v.promptLabel, answer: v.answer, shown, truth: true };
      }
      return { kind, card, prompt: v.prompt, label: v.promptLabel, answer: v.answer, shown, truth };
    });
  }, [cards, direction, labels, answerOf, limit]);

  const [answers, setAnswers] = useState<Record<number, number | string | boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // Pro Frage: richtig?
  function isCorrect(q: TestQ, i: number): boolean {
    const a = answers[i];
    if (q.kind === 'choice') return a === q.correctIndex;
    if (q.kind === 'tf') return a === q.truth;
    return judgeTyped(typeof a === 'string' ? a : '', q.answer, tolerance).ok;
  }

  const score = useMemo(() => submitted ? questions.filter((q, i) => isCorrect(q, i)).length : 0, [submitted, questions, answers]);

  function submit() {
    if (submitted) return;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      let outcome: ReviewOutcome;
      if (q.kind === 'write') outcome = outcomeFromTyped(judgeTyped(typeof answers[i] === 'string' ? answers[i] as string : '', q.answer, tolerance));
      else outcome = isCorrect(q, i) ? 'correct' : 'wrong';
      onReview(q.card.id, outcome);
    }
    setSubmitted(true);
    document.querySelector('[data-test-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const answeredCount = Object.keys(answers).length;
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="font-display font-bold text-ink-900 flex-1">
          {submitted ? 'Auswertung' : `Prüfung · ${questions.length} Aufgaben`}
        </div>
        {!submitted && <span className="text-xs font-semibold text-ink-500 tabular-nums">{answeredCount}/{questions.length}</span>}
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition"><Flag className="size-3" /> Beenden</button>
      </div>

      {submitted && (
        <div className="rounded-2xl theme-gradient text-white p-4 mb-3 text-center shadow-glow">
          <div className="text-3xl font-display font-extrabold">{score} / {questions.length}</div>
          <div className="text-sm opacity-90">{pct}% richtig</div>
        </div>
      )}

      <div data-test-scroll className="flex-1 min-h-0 overflow-y-auto max-w-xl w-full mx-auto space-y-4 pb-4">
        {questions.map((q, i) => {
          const correct = submitted && isCorrect(q, i);
          const wrong = submitted && !isCorrect(q, i);
          return (
            <div key={i} className={`glass rounded-2xl p-4 border ${correct ? 'border-emerald-500/50' : wrong ? 'border-rose-500/50' : 'border-white/50'}`}>
              <div className="flex items-start gap-2 mb-3">
                <span className="size-6 rounded-lg bg-white/60 grid place-items-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{q.label}{q.kind === 'tf' ? ' · Wahr oder falsch?' : ''}</span>
                  <div className="font-semibold text-ink-900 whitespace-pre-wrap break-words">{q.prompt}</div>
                  {q.kind === 'tf' && <div className="mt-1 text-ink-700">→ <span className="font-medium">{q.shown}</span></div>}
                </div>
              </div>

              {q.kind === 'choice' && (
                <div className="grid gap-2">
                  {q.options.map((opt, oi) => {
                    const sel = answers[i] === oi;
                    const showRight = submitted && oi === q.correctIndex;
                    const showWrong = submitted && sel && oi !== q.correctIndex;
                    return (
                      <button key={oi} disabled={submitted}
                        onClick={() => setAnswers(a => ({ ...a, [i]: oi }))}
                        className={`w-full rounded-xl p-3 text-left text-sm border transition flex items-center gap-2
                          ${showRight ? 'bg-emerald-500/15 border-emerald-500/60' : showWrong ? 'bg-rose-500/15 border-rose-500/60' :
                            sel ? 'theme-gradient text-white border-transparent' : 'bg-white/50 border-white/50 hover:bg-white/80'}`}>
                        <span className="size-5 rounded-md bg-white/60 grid place-items-center text-[10px] font-bold flex-shrink-0 text-ink-700">{String.fromCharCode(65 + oi)}</span>
                        <span className="whitespace-pre-wrap break-words">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.kind === 'write' && (
                <div>
                  <input className="input" disabled={submitted} value={typeof answers[i] === 'string' ? answers[i] as string : ''}
                    onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                    placeholder="Antwort …" autoComplete="off" autoCorrect="off" spellCheck={false} />
                  {wrong && <div className="text-xs mt-2 text-ink-600">Richtig: <span className="font-semibold text-ink-900">{q.answer}</span></div>}
                </div>
              )}

              {q.kind === 'tf' && (
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map(val => {
                    const sel = answers[i] === val;
                    const showRight = submitted && val === q.truth;
                    const showWrong = submitted && sel && val !== q.truth;
                    return (
                      <button key={String(val)} disabled={submitted}
                        onClick={() => setAnswers(a => ({ ...a, [i]: val }))}
                        className={`rounded-xl p-3 text-sm font-semibold border transition
                          ${showRight ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-800' : showWrong ? 'bg-rose-500/15 border-rose-500/60 text-rose-800' :
                            sel ? 'theme-gradient text-white border-transparent' : 'bg-white/50 border-white/50 hover:bg-white/80'}`}>
                        {val ? 'Stimmt' : 'Stimmt nicht'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="max-w-xl w-full mx-auto pt-2">
        {!submitted ? (
          <button onClick={submit} className="btn-primary w-full py-3.5"><ClipboardCheck className="size-4" /> Abgeben &amp; auswerten</button>
        ) : (
          <button onClick={onDone} className="btn-primary w-full py-3.5">Fertig <ArrowRight className="size-4" /></button>
        )}
      </div>
    </div>
  );
}

// ─── Schritt: Meteor (Tipp-Spiel) ────────────────────────────────────────────
//
// Karten fallen herunter; die Antwort muss getippt werden, bevor die Karte unten
// einschlägt. Pro Treffer Punkte, bei Einschlag ein Leben weniger. Mit Highscore.

const METEOR_HIGHSCORE_KEY = 'notenapp-meteor-highscore';

function MeteorRunner({ cards, direction, labels, tolerance, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels; tolerance: TypoTolerance;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [seq, setSeq] = useState(0);
  const [input, setInput] = useState('');
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [over, setOver] = useState(false);
  const [flash, setFlash] = useState<null | 'hit' | 'miss'>(null);
  const [areaH, setAreaH] = useState(0);
  // Bei Fehler/Einschlag kurz die richtige Antwort zeigen, bevor es weitergeht.
  const [reveal, setReveal] = useState<null | { prompt: string; label: string; answer: string }>(null);
  const [highscore, setHighscore] = useState<number>(() => {
    try { return Number(localStorage.getItem(METEOR_HIGHSCORE_KEY)) || 0; } catch { return 0; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef(3);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const card = queue.length ? queue[seq % queue.length] : null;
  const view = useMemo(() => card ? sides(card, direction, labels) : null, [card, direction, labels]);
  const level = Math.floor(cleared / 5) + 1;
  const fallDuration = Math.max(3.5, 8 - (level - 1) * 0.6);

  // Spielfläche vermessen (für die Fall-Distanz).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => setAreaH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (!over) setTimeout(() => inputRef.current?.focus(), 50); }, [seq, over]);

  // Spiel beenden und ggf. Highscore speichern (aus einem Event-Handler aufgerufen).
  const endGame = useCallback((finalScore: number) => {
    setOver(true);
    setHighscore(hs => {
      if (finalScore > hs) {
        try { localStorage.setItem(METEOR_HIGHSCORE_KEY, String(finalScore)); } catch { /* ignore */ }
        return finalScore;
      }
      return hs;
    });
  }, []);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blink = useCallback((kind: 'hit' | 'miss') => {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 280);
  }, []);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);

  function nextMeteor() { setInput(''); setSeq(s => s + 1); }

  // Fehlschlag (falsch getippt ODER eingeschlagen): kurz die richtige Antwort
  // einblenden, Leben abziehen, dann weiter zur nächsten Karte (oder Game Over).
  function fail() {
    if (over || reveal || !card || !view) return;
    onReview(card.id, 'wrong');
    blink('miss');
    setInput('');
    setReveal({ prompt: view.prompt, label: view.promptLabel, answer: view.answer });
    const nl = Math.max(0, livesRef.current - 1);
    livesRef.current = nl;
    setLives(nl);
    revealTimer.current = setTimeout(() => {
      setReveal(null);
      if (nl <= 0) endGame(score);
      else nextMeteor();
    }, 1200);
  }

  // Antwort abschicken.
  function submit() {
    if (over || reveal || !card || !view) return;
    const j = judgeTyped(input, view.answer, tolerance);
    if (j.ok) {
      onReview(card.id, outcomeFromTyped(j));
      setScore(s => s + 10 * level);
      setCleared(c => c + 1);
      blink('hit');
      nextMeteor();
    } else {
      fail();
    }
  }

  function restart() {
    livesRef.current = 3;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setSeq(0); setInput(''); setLives(3); setScore(0); setCleared(0); setOver(false); setFlash(null); setReveal(null);
  }

  if (over) {
    const record = score >= highscore && score > 0;
    return (
      <div className="h-full grid place-items-center px-6 pb-8">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm w-full">
          <div className="size-20 rounded-3xl theme-gradient grid place-items-center mx-auto shadow-glow mb-4">
            <Flame className="size-10 text-white" />
          </div>
          <h2 className="h2">Game Over</h2>
          <div className="text-5xl font-display font-extrabold text-ink-900 mt-3">{score}</div>
          <p className="subtle mt-1 flex items-center justify-center gap-1">
            <Crown className="size-4 text-amber-500" /> Rekord: {Math.max(score, highscore)}
          </p>
          {record && <div className="chip mx-auto mt-3 text-amber-700 bg-amber-500/15"><Crown className="size-3" /> Neuer Rekord!</div>}
          <div className="flex flex-col gap-2 mt-6">
            <button onClick={restart} className="btn-primary w-full"><Flame className="size-4" /> Nochmal</button>
            <button onClick={onDone} className="btn-ghost w-full">Fertig</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!card || !view) return null;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      {/* Kopf: Punkte, Level, Leben */}
      <div className="flex items-center gap-3 mb-2">
        <span className="chip text-[11px] font-bold tabular-nums">{score} Pkt</span>
        <span className="chip text-[11px]">Level {level}</span>
        <div className="flex-1 flex items-center justify-center gap-1">
          {[0, 1, 2].map(i => (
            <Heart key={i} className={`size-5 ${i < lives ? 'text-rose-500 fill-rose-500' : 'text-ink-300'}`} />
          ))}
        </div>
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition"><Flag className="size-3" /> Beenden</button>
      </div>

      {/* Spielfläche */}
      <div ref={areaRef} className={`relative flex-1 min-h-0 overflow-hidden rounded-3xl transition-colors duration-200
        ${flash === 'hit' ? 'bg-emerald-500/15' : flash === 'miss' ? 'bg-rose-500/15' : 'bg-white/20'}`}>
        {/* Boden-Linie */}
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-rose-500/20 to-transparent border-t-2 border-dashed border-rose-400/40" />

        {/* Fallende Karte (nur solange keine Antwort eingeblendet wird) */}
        {areaH > 0 && !reveal && (
          <div className="absolute inset-x-0 top-0 flex justify-center px-4 pointer-events-none">
            <motion.div
              key={seq}
              className="w-[78%] max-w-sm"
              initial={{ y: -10 }}
              animate={{ y: Math.max(0, areaH - 96) }}
              transition={{ duration: fallDuration, ease: 'linear' }}
              onAnimationComplete={fail}
            >
              <div className="glass-strong rounded-2xl shadow-soft p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-ink-400">
                  <Flame className="size-3 text-orange-500" /> {view.promptLabel}
                </div>
                <div className="font-display font-bold text-ink-900 text-lg md:text-xl whitespace-pre-wrap break-words mt-1">{view.prompt}</div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Richtige Antwort kurz einblenden (blinkend) – unten, wo die Karte einschlägt */}
        {reveal && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="glass-strong rounded-2xl shadow-soft p-4 text-center w-[82%] max-w-sm border-2 border-rose-400/50">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-400">{reveal.label}</div>
              <div className="font-display font-bold text-ink-700 text-base whitespace-pre-wrap break-words mt-1">{reveal.prompt}</div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-rose-500 mt-3">Richtige Antwort</div>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.55, repeat: Infinity }}
                className="font-display font-extrabold text-emerald-600 text-xl md:text-2xl whitespace-pre-wrap break-words mt-1">
                {reveal.answer}
              </motion.div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Eingabe */}
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="mt-3 max-w-md w-full mx-auto flex gap-2">
        <input ref={inputRef} className="input text-center text-lg flex-1" value={input} disabled={!!reveal}
          onChange={e => setInput(e.target.value)} placeholder="Antwort tippen & Enter …"
          autoComplete="off" autoCorrect="off" spellCheck={false} />
        <button type="submit" className="btn-primary px-5" disabled={!!reveal}><ArrowRight className="size-5" /></button>
      </form>
      <p className="subtle text-center text-[11px] mt-1">Tippe die Antwort, bevor die Karte unten einschlägt!</p>
    </div>
  );
}

// ─── Schritt: Aufdecken + Swipe ──────────────────────────────────────────────

function FlipRunner({ cards, direction, labels, onReview, restoreCard, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection; labels?: SideLabels;
  onReview: (id: string, outcome: ReviewOutcome) => void;
  restoreCard: (id: string, snapshot: Partial<Flashcard>) => void;
  onDone: () => void;
}) {
  const queue = useMemo(() => shuffle(cards), [cards]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, partial: 0, wrong: 0 });
  const [history, setHistory] = useState<ReviewOutcome[]>([]);

  const card = queue[index];
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -40], [1, 0]);

  const advance = useCallback((outcome: ReviewOutcome) => {
    if (!card) return;
    onReview(card.id, outcome);
    setStats(s => ({ ...s, [outcome]: s[outcome] + 1 }));
    setHistory(h => [...h, outcome]);
    if (index + 1 >= queue.length) onDone();
    else { setIndex(i => i + 1); setFlipped(false); x.set(0); }
  }, [card, index, queue.length, onReview, onDone, x]);

  // Zur vorherigen Karte zurück: deren Bewertung rückgängig machen (Snapshot
  // vom Session-Start aus der Queue wiederherstellen) und Statistik korrigieren.
  const goBack = useCallback(() => {
    if (index === 0) return;
    const prev = queue[index - 1];
    restoreCard(prev.id, snapshotOf(prev));
    const last = history[history.length - 1];
    if (last) setStats(s => ({ ...s, [last]: Math.max(0, s[last] - 1) }));
    setHistory(h => h.slice(0, -1));
    setIndex(i => i - 1);
    setFlipped(false);
    x.set(0);
  }, [index, queue, restoreCard, history, x]);

  if (!card) return null;
  const { prompt, answer, promptLabel, answerLabel } = sides(card, direction, labels);
  const progress = (index / queue.length) * 100;

  return (
    <div className="h-full flex flex-col px-5 md:px-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
      {/* Fortschritt + Beenden */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 rounded-full bg-white/50 overflow-hidden">
          <motion.div className="h-full theme-gradient rounded-full" animate={{ width: `${progress}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
        </div>
        <span className="text-xs font-semibold text-ink-500 tabular-nums">{index + 1}/{queue.length}</span>
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition" title="Lernen beenden">
          <Flag className="size-3" /> Beenden
        </button>
      </div>

      {/* Kartenstapel */}
      <div className="flex-1 min-h-0 grid place-items-center relative">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={card.id}
            className="absolute w-full max-w-md aspect-[3/4] max-h-full cursor-pointer touch-none"
            style={{ x, rotate, perspective: 1200 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(_, info) => {
              if (info.offset.x > 110 || info.velocity.x > 600) advance('correct');
              else if (info.offset.x < -110 || info.velocity.x < -600) advance('wrong');
            }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setFlipped(f => !f)}
          >
            {/* Swipe-Indikatoren (liegen über der drehenden Karte) */}
            <motion.div style={{ opacity: likeOpacity }} className="absolute top-5 left-5 z-20 rotate-[-12deg] rounded-xl border-4 border-emerald-500 text-emerald-500 px-3 py-1 font-display font-extrabold text-xl pointer-events-none">
              GEWUSST
            </motion.div>
            <motion.div style={{ opacity: nopeOpacity }} className="absolute top-5 right-5 z-20 rotate-[12deg] rounded-xl border-4 border-rose-500 text-rose-500 px-3 py-1 font-display font-extrabold text-xl pointer-events-none">
              NOCHMAL
            </motion.div>

            {/* 3D-Flip-Container */}
            <motion.div
              className="relative size-full"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            >
              <CardFace label={promptLabel} text={prompt} box={card.box} hint="Tippen zum Aufdecken" />
              <CardFace label={answerLabel} text={answer} box={card.box} back />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bewerten-Buttons: nicht gewusst · fast · gewusst */}
      <div className="flex items-center justify-center gap-3 mt-4">
        <RatingButton color="rose" icon={ThumbsDown} label="Nochmal" onClick={() => advance('wrong')} />
        <RatingButton color="amber" icon={Equal} label="Fast" onClick={() => advance('partial')} />
        <RatingButton color="emerald" icon={ThumbsUp} label="Gewusst" onClick={() => advance('correct')} />
      </div>

      {/* Sekundär-Navigation */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button onClick={goBack} disabled={index === 0}
          className="btn-soft py-2 text-sm disabled:opacity-40">
          <Undo2 className="size-4" /> Zurück
        </button>
        <button onClick={() => setFlipped(f => !f)} className="btn-soft py-2 text-sm">
          <RotateCcw className="size-4" /> Drehen
        </button>
      </div>
      <div className="text-center subtle text-xs mt-2">
        Links wischen = nochmal · rechts = gewusst · <span className="text-emerald-600 font-semibold">{stats.correct}</span> / <span className="text-amber-600 font-semibold">{stats.partial}</span> / <span className="text-rose-600 font-semibold">{stats.wrong}</span>
      </div>
    </div>
  );
}

/** Eine Seite der Karte (Vorder- oder Rückseite, mit Backface-Hiding für den Flip). */
function CardFace({ label, text, box, hint, back = false }: {
  label: string; text: string; box: number; hint?: string; back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 glass-strong rounded-[2rem] shadow-soft p-6 flex flex-col items-center justify-center text-center overflow-hidden [backface-visibility:hidden]"
      style={back ? { transform: 'rotateY(180deg)' } : undefined}
    >
      <span className="absolute top-4 left-4 chip text-[10px]">Fach {box}/{LEITNER_BOXES}</span>
      <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider font-semibold text-ink-400">{label}</span>
      <div className="font-display font-bold text-ink-900 text-xl md:text-2xl whitespace-pre-wrap break-words">{text}</div>
      {hint && <div className="subtle text-xs mt-6 absolute bottom-5">{hint}</div>}
    </div>
  );
}

function RatingButton({ color, icon: Icon, label, onClick }: {
  color: 'rose' | 'amber' | 'emerald'; icon: typeof ThumbsUp; label: string; onClick: () => void;
}) {
  const tone = {
    rose: 'text-rose-500',
    amber: 'text-amber-500',
    emerald: 'text-emerald-500',
  }[color];
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-95 transition">
      <span className={`size-16 rounded-full bg-white/70 hover:bg-white shadow-soft grid place-items-center ${tone}`}>
        <Icon className="size-7" />
      </span>
      <span className="text-[11px] font-semibold text-ink-500">{label}</span>
    </button>
  );
}

// ─── Schritt: Zuordnen (Matching) ────────────────────────────────────────────

interface MatchItem { cardId: string; text: string; side: 'p' | 'a'; }

function MatchRunner({ cards, direction, onReview, onDone }: {
  cards: Flashcard[]; direction: ReviewDirection;
  onReview: (id: string, outcome: ReviewOutcome) => void; onDone: () => void;
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
      // Beim ersten Versuch richtig → correct, nach Fehlversuch → partial (war nicht ganz falsch).
      onReview(item.cardId, erred.has(item.cardId) ? 'partial' : 'correct');
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
        <button onClick={onDone} className="chip text-[11px] hover:bg-white/80 transition" title="Lernen beenden">
          <Flag className="size-3" /> Beenden
        </button>
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
        <p className="subtle mt-2">Du hast „{deckName}" gelernt. Dein Lernfortschritt wurde gespeichert.</p>
        <div className="flex flex-col gap-2 mt-6">
          <button onClick={onRestart} className="btn-primary w-full"><RotateCcw className="size-4" /> Nochmal lernen</button>
          <button onClick={onClose} className="btn-ghost w-full">Fertig</button>
        </div>
      </motion.div>
    </div>
  );
}
