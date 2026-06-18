import { useState } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';

// Vollständiger Emoji-Picker mit Kategorie-Reitern.
// Tippt man ein Emoji an, wird onPick aufgerufen.
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [cat, setCat] = useState(0);
  const active = EMOJI_CATEGORIES[cat];

  return (
    <div className="glass-strong rounded-2xl shadow-soft w-[300px] overflow-hidden flex flex-col">
      {/* Kategorie-Reiter */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 pb-1 border-b border-ink-100 overflow-x-auto">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCat(i)}
            title={c.label}
            className={`flex-shrink-0 size-8 grid place-items-center rounded-lg text-lg transition ${
              i === cat ? 'bg-theme/15' : 'hover:bg-ink-100'
            }`}
          >
            {c.tab}
          </button>
        ))}
      </div>

      {/* Emoji-Raster */}
      <div className="px-1.5 py-1.5">
        <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide px-1 mb-1">{active.label}</div>
        <div className="grid grid-cols-7 gap-0.5 max-h-[220px] overflow-y-auto">
          {active.emojis.map(e => (
            <button
              key={e}
              onClick={() => onPick(e)}
              className="size-9 grid place-items-center rounded-lg hover:bg-ink-100 text-xl transition hover:scale-110"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
