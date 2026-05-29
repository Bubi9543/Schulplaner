import { useMemo, useState } from 'react';
import { Search, Sparkles, Check } from 'lucide-react';
import { ICON_GROUPS, searchIcons, iconComponent } from '@/lib/subjectIcons';

interface Props {
  /** Aktuell manuell gewähltes Icon (undefined = automatisch nach Name). */
  value?: string;
  /** Das automatisch erkannte Icon (für die „Automatisch"-Kachel). */
  autoIcon: string;
  /** undefined = zurück auf Automatisch. */
  onChange: (icon: string | undefined) => void;
  /** Fachfarbe für den ausgewählten Zustand. */
  color: string;
}

export function IconPicker({ value, autoIcon, onChange, color }: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? searchIcons(query) : null), [query]);

  function Tile({ name, selected }: { name: string; selected: boolean }) {
    const Icon = iconComponent(name);
    return (
      <button
        type="button"
        onClick={() => onChange(name)}
        title={name}
        className={`relative size-10 rounded-xl grid place-items-center transition ${
          selected ? 'text-white scale-105 shadow-soft' : 'bg-white/60 text-ink-600 hover:bg-white/80 hover:text-ink-900'
        }`}
        style={selected ? { background: color } : undefined}
      >
        <Icon className="size-5" strokeWidth={2.25} />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          className="input pl-9"
          placeholder="Icon suchen (z.B. Mathe, Chemie, Musik) …"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="max-h-64 overflow-y-auto pr-1 space-y-4">
        {/* Automatisch-Kachel */}
        <div>
          <div className="label mb-1.5">Empfehlung</div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition text-left ${
              value === undefined ? 'border-transparent text-white' : 'border-white/50 bg-white/60 text-ink-700 hover:bg-white/80'
            }`}
            style={value === undefined ? { background: color } : undefined}
          >
            <span className={`size-9 rounded-lg grid place-items-center flex-shrink-0 ${value === undefined ? 'bg-white/25' : 'bg-white/70'}`}>
              {(() => { const I = iconComponent(autoIcon); return <I className="size-5" strokeWidth={2.25} />; })()}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold text-sm"><Sparkles className="size-3.5" /> Automatisch</span>
              <span className={`block text-xs ${value === undefined ? 'text-white/85' : 'text-ink-500'}`}>Passt sich dem Fachnamen an</span>
            </span>
            {value === undefined && <Check className="size-4 ml-auto flex-shrink-0" strokeWidth={3} />}
          </button>
        </div>

        {results ? (
          results.length ? (
            <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-8">
              {results.map(name => <Tile key={name} name={name} selected={value === name} />)}
            </div>
          ) : (
            <div className="text-sm text-ink-500 px-1 py-4 text-center">Keine Icons gefunden.</div>
          )
        ) : (
          ICON_GROUPS.map(group => (
            <div key={group.label}>
              <div className="label mb-1.5">{group.label}</div>
              <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-8">
                {group.icons.map(name => <Tile key={name} name={name} selected={value === name} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
