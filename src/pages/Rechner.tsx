import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, History, X } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { evaluate, formatResult } from '@/lib/calc';
import { trySecretCode } from '@/lib/secretCodes';
import { cn } from '@/lib/utils';

interface HistItem { expr: string; result: string; }

type Variant = 'num' | 'op' | 'fn' | 'equals' | 'util';

interface Key {
  label: string;
  /** Was an die Eingabe angehängt wird (default: label). */
  insert?: string;
  /** Sonderaktion statt Einfügen. */
  action?: 'equals' | 'clear' | 'back';
  variant: Variant;
}

// 5-Spalten-Layout: links die wissenschaftlichen Funktionen,
// rechts der klassische Ziffernblock.
const KEYS: Key[] = [
  { label: 'AC', action: 'clear', variant: 'util' },
  { label: '(', variant: 'fn' },
  { label: ')', variant: 'fn' },
  { label: '%', variant: 'fn' },
  { label: '⌫', action: 'back', variant: 'util' },

  { label: 'sin', insert: 'sin(', variant: 'fn' },
  { label: 'cos', insert: 'cos(', variant: 'fn' },
  { label: 'tan', insert: 'tan(', variant: 'fn' },
  { label: 'xʸ', insert: '^', variant: 'fn' },
  { label: '÷', variant: 'op' },

  { label: 'ln', insert: 'ln(', variant: 'fn' },
  { label: '7', variant: 'num' },
  { label: '8', variant: 'num' },
  { label: '9', variant: 'num' },
  { label: '×', variant: 'op' },

  { label: 'log', insert: 'log(', variant: 'fn' },
  { label: '4', variant: 'num' },
  { label: '5', variant: 'num' },
  { label: '6', variant: 'num' },
  { label: '−', variant: 'op' },

  { label: '√', insert: '√(', variant: 'fn' },
  { label: '1', variant: 'num' },
  { label: '2', variant: 'num' },
  { label: '3', variant: 'num' },
  { label: '+', variant: 'op' },

  { label: 'π', variant: 'fn' },
  { label: 'e', variant: 'fn' },
  { label: '0', variant: 'num' },
  { label: ',', insert: '.', variant: 'num' },
  { label: '=', action: 'equals', variant: 'equals' },
];

export function RechnerPage() {
  const navigate = useNavigate();
  const [expr, setExpr] = useState('');
  const [deg, setDeg] = useState(true);
  const [history, setHistory] = useState<HistItem[]>([]);
  // "justEvaluated": nach "=" startet die nächste Ziffer eine neue Rechnung,
  // ein Operator rechnet hingegen mit dem Ergebnis weiter.
  const justEvaluated = useRef(false);

  // Live-Vorschau des Ergebnisses während der Eingabe.
  const preview = useMemo(() => {
    if (!expr.trim()) return '';
    try {
      return formatResult(evaluate(expr, { deg }));
    } catch {
      return '';
    }
  }, [expr, deg]);

  function append(text: string) {
    setExpr(prev => {
      // Nach einem Ergebnis: Ziffer/Funktion → neu beginnen.
      if (justEvaluated.current) {
        justEvaluated.current = false;
        const isOperator = /^[+\-×÷^%)]$/.test(text);
        return (isOperator ? prev : '') + text;
      }
      return prev + text;
    });
  }

  function clearAll() {
    justEvaluated.current = false;
    setExpr('');
  }

  function backspace() {
    justEvaluated.current = false;
    setExpr(prev => prev.slice(0, -1));
  }

  function equals() {
    if (!expr.trim()) return;
    // Erst Geheim-Codes prüfen (nächster Schritt: Dev-Dashboard etc.).
    if (trySecretCode(expr, { navigate })) {
      clearAll();
      return;
    }
    try {
      const value = formatResult(evaluate(expr, { deg }));
      setHistory(h => [{ expr, result: value }, ...h].slice(0, 20));
      setExpr(value);
      justEvaluated.current = true;
    } catch {
      // Kurz "wackeln" als Fehlersignal.
      setExpr(prev => prev);
      shake();
    }
  }

  const [shaking, setShaking] = useState(false);
  function shake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 350);
  }

  function press(key: Key) {
    if (key.action === 'equals') return equals();
    if (key.action === 'clear') return clearAll();
    if (key.action === 'back') return backspace();
    append(key.insert ?? key.label);
  }

  // Tastatur-Unterstützung.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (k >= '0' && k <= '9') { append(k); return; }
      if (k === '.' || k === ',') { append('.'); return; }
      if (k === '+') { append('+'); return; }
      if (k === '-') { append('−'); return; }
      if (k === '*') { append('×'); return; }
      if (k === '/') { e.preventDefault(); append('÷'); return; }
      if (k === '^') { append('^'); return; }
      if (k === '(' || k === ')') { append(k); return; }
      if (k === '%') { append('%'); return; }
      if (k === 'Enter' || k === '=') { e.preventDefault(); equals(); return; }
      if (k === 'Backspace') { backspace(); return; }
      if (k === 'Escape') { clearAll(); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, deg]);

  return (
    <PageShell
      title="Rechner"
      subtitle="Wissenschaftlicher Taschenrechner"
      actions={
        <button
          onClick={() => setDeg(d => !d)}
          className="chip"
          title="Zwischen Grad und Bogenmaß wechseln"
        >
          <span className={cn('font-semibold', deg ? 'text-theme-deep' : 'text-ink-400')}>DEG</span>
          <span className="text-ink-300">/</span>
          <span className={cn('font-semibold', !deg ? 'text-theme-deep' : 'text-ink-400')}>RAD</span>
        </button>
      }
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 max-w-4xl">
        {/* Rechner */}
        <div className="card !p-4 md:!p-5">
          {/* Display */}
          <motion.div
            animate={shaking ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl theme-gradient-soft border border-white/40 px-5 py-4 mb-4 text-right overflow-hidden"
          >
            <div className="text-ink-500 text-sm h-5 truncate font-mono">
              {deg ? 'DEG' : 'RAD'}
            </div>
            <div className="font-display font-extrabold text-ink-900 text-3xl md:text-4xl leading-tight min-h-[2.5rem] break-all">
              {expr || '0'}
            </div>
            <div className="text-theme-deep/80 font-semibold text-lg h-7 truncate">
              {preview && preview !== expr ? `= ${preview}` : ''}
            </div>
          </motion.div>

          {/* Tastenfeld */}
          <div className="grid grid-cols-5 gap-2">
            {KEYS.map(key => (
              <CalcButton key={key.label} k={key} onPress={() => press(key)} />
            ))}
          </div>
        </div>

        {/* Verlauf */}
        <div className="card !p-4 hidden lg:flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-ink-700">
              <History className="size-4" />
              <span className="font-semibold text-sm">Verlauf</span>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="size-7 grid place-items-center rounded-full hover:bg-white/70 text-ink-400 hover:text-ink-700 transition"
                title="Verlauf löschen"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar -mx-1 px-1">
            <AnimatePresence initial={false}>
              {history.length === 0 ? (
                <p className="subtle text-center mt-8">Noch keine Rechnungen.</p>
              ) : (
                history.map((h, i) => (
                  <motion.button
                    key={`${h.expr}-${i}`}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => { setExpr(h.result); justEvaluated.current = true; }}
                    className="w-full text-right py-2 px-2 rounded-xl hover:bg-white/60 transition group"
                  >
                    <div className="text-ink-400 text-xs truncate group-hover:text-ink-500">{h.expr}</div>
                    <div className="text-ink-800 font-semibold truncate">= {h.result}</div>
                  </motion.button>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function CalcButton({ k, onPress }: { k: Key; onPress: () => void }) {
  const base =
    'h-14 md:h-16 rounded-2xl font-semibold text-lg flex items-center justify-center transition active:scale-[.94] select-none';

  const styles: Record<Variant, string> = {
    num: 'bg-white/70 hover:bg-white text-ink-900 border border-white/60 shadow-sm',
    op: 'text-theme-deep border border-white/50 hover:brightness-95',
    fn: 'bg-white/40 hover:bg-white/70 text-ink-600 text-base border border-white/40',
    util: 'bg-white/40 hover:bg-white/70 text-ink-500 border border-white/40',
    equals: 'theme-gradient text-white shadow-glow hover:brightness-105',
  };

  // Operatoren bekommen einen dezenten Akzent-Hintergrund.
  const opStyle =
    k.variant === 'op'
      ? { background: 'rgb(var(--theme-primary-rgb) / 0.12)' }
      : undefined;

  return (
    <button
      onClick={onPress}
      style={opStyle}
      className={cn(base, styles[k.variant])}
    >
      {k.action === 'back' ? <Delete className="size-5" /> : k.label}
    </button>
  );
}
