import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, BookOpen, CheckCircle2 } from 'lucide-react';
import type { StudyChecklistItem, StudyStatus } from '@/types';

/**
 * Lerncheckliste mit Ampel-Status pro Punkt.
 * - 🟢 grün = bereit
 * - 🟡 gelb = verstanden, aber noch nicht sicher
 * - 🔴 rot  = nicht verstanden
 *
 * Oben ein gestapelter Fortschrittsbalken, der die Verteilung über alle
 * Punkte zeigt (z. B. 30 % grün, 50 % gelb, 20 % rot).
 *
 * Komponente ist „dumm": bekommt items + onChange-Callback, persistiert nicht
 * selber. Aufrufer kümmert sich um Speichern (z. B. in updateTask).
 */

const STATUS_META: Record<StudyStatus, { color: string; bg: string; label: string; ring: string }> = {
  red:    { color: '#ef4444', bg: 'bg-rose-500',    label: 'Nicht verstanden', ring: 'ring-rose-500' },
  yellow: { color: '#f59e0b', bg: 'bg-amber-400',   label: 'Verstanden',       ring: 'ring-amber-400' },
  green:  { color: '#10b981', bg: 'bg-emerald-500', label: 'Bereit',           ring: 'ring-emerald-500' },
};

const STATUS_ORDER: StudyStatus[] = ['green', 'yellow', 'red'];

interface Props {
  items: StudyChecklistItem[];
  onChange: (items: StudyChecklistItem[]) => void;
  /** Optionaler Titel oben — Default: „Lerncheckliste". */
  title?: string;
  /** Wenn true, hat die Komponente eine helle Karten-Umrandung. */
  framed?: boolean;
}

export function StudyChecklist({ items, onChange, title = 'Lerncheckliste', framed = true }: Props) {
  const [newLabel, setNewLabel] = useState('');

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    const item: StudyChecklistItem = {
      id: 'sc-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
      label,
      status: 'red',
    };
    onChange([...items, item]);
    setNewLabel('');
  }

  function updateItem(id: string, patch: Partial<StudyChecklistItem>) {
    onChange(items.map(it => it.id === id ? { ...it, ...patch } : it));
  }

  function removeItem(id: string) {
    onChange(items.filter(it => it.id !== id));
  }

  function cycleStatus(id: string, current: StudyStatus) {
    // rot → gelb → grün → rot
    const next: Record<StudyStatus, StudyStatus> = { red: 'yellow', yellow: 'green', green: 'red' };
    updateItem(id, { status: next[current] });
  }

  // ─── Statistik ─────────────────────────────────────────────────────────
  const counts = items.reduce(
    (acc, it) => { acc[it.status]++; return acc; },
    { red: 0, yellow: 0, green: 0 } as Record<StudyStatus, number>,
  );
  const total = items.length;
  const pct = (n: number) => total === 0 ? 0 : (n / total) * 100;
  const readyPct = Math.round(pct(counts.green));

  return (
    <div className={framed ? 'rounded-2xl bg-white/60 p-4' : ''}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-theme" />
          <h4 className="font-semibold text-sm text-ink-800">{title}</h4>
          {total > 0 && (
            <span className="text-xs text-ink-500">
              {counts.green}/{total} bereit
            </span>
          )}
        </div>
        {total > 0 && counts.green === total && (
          <motion.span
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold"
          >
            <CheckCircle2 className="size-3" />Alles bereit!
          </motion.span>
        )}
      </div>

      {/* Stacked Progress Bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="relative h-3 w-full rounded-full bg-ink-100 overflow-hidden flex">
            <motion.div
              className="bg-emerald-500 h-full"
              animate={{ width: `${pct(counts.green)}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
            <motion.div
              className="bg-amber-400 h-full"
              animate={{ width: `${pct(counts.yellow)}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
            <motion.div
              className="bg-rose-500 h-full"
              animate={{ width: `${pct(counts.red)}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1.5 text-ink-500 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {counts.green > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" />{counts.green} bereit
                </span>
              )}
              {counts.yellow > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400" />{counts.yellow} verstanden
                </span>
              )}
              {counts.red > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-500" />{counts.red} offen
                </span>
              )}
            </div>
            <span className="font-semibold text-ink-700">{readyPct}%</span>
          </div>
        </div>
      )}

      {/* Items */}
      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.ul
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-1.5 mb-3"
          >
            {items.map(item => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                layout
                className="flex items-center gap-2 rounded-xl bg-white/70 px-2.5 py-2"
              >
                {/* Ampel-Buttons */}
                <div className="flex gap-1 flex-shrink-0">
                  {STATUS_ORDER.map(s => (
                    <button
                      key={s}
                      onClick={() => updateItem(item.id, { status: s })}
                      className={`size-5 rounded-full transition ${STATUS_META[s].bg} ${
                        item.status === s ? 'ring-2 ring-offset-1 ring-offset-white ' + STATUS_META[s].ring : 'opacity-40 hover:opacity-80'
                      }`}
                      title={STATUS_META[s].label}
                      aria-label={STATUS_META[s].label}
                    />
                  ))}
                </div>
                {/* Klickbarer Label-Bereich: cyclet auch den Status (Quick-Action) */}
                <input
                  value={item.label}
                  onChange={e => updateItem(item.id, { label: e.target.value })}
                  onDoubleClick={() => cycleStatus(item.id, item.status)}
                  className="flex-1 min-w-0 bg-transparent text-sm text-ink-800 outline-none border-b border-transparent focus:border-ink-300 transition py-0.5"
                  placeholder="Thema beschreiben"
                />
                <button
                  onClick={() => removeItem(item.id)}
                  className="size-7 grid place-items-center rounded-full text-ink-400 hover:text-rose-500 hover:bg-rose-50 transition flex-shrink-0"
                  title="Punkt entfernen"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Eingabe für neuen Punkt */}
      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="z. B. Integralrechnung, Vokabeln Unit 5 …"
          className="flex-1 px-3 py-2 rounded-xl bg-white/70 border border-white/60 text-sm text-ink-800 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-theme-soft transition"
        />
        <button
          onClick={add}
          disabled={!newLabel.trim()}
          className="btn-primary text-xs"
        >
          <Plus className="size-3.5" />Punkt
        </button>
      </div>

      {total === 0 && (
        <div className="text-[11px] text-ink-400 mt-2 leading-relaxed">
          💡 Trag ein, was du bis zur Klausur können musst. Tippe einen Punkt an, dann auf eine Ampel – grün heißt bereit, gelb verstanden, rot offen.
        </div>
      )}
    </div>
  );
}
