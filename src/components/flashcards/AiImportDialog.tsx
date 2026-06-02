import { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Check, Upload, FileJson, Wand2, ChevronDown } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { buildAiPrompt, parseDeckImport, DeckImportError } from '@/lib/flashcards';
import type { Deck, DeckExport } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Name des Kastens für den Prompt (bei Import in bestehenden Kasten). */
  deckName?: string;
  /** Wenn gesetzt: Karten in diesen bestehenden Kasten importieren. */
  intoDeckId?: string;
  /** Vorbefüllter Text (z. B. aus geteiltem Link, bereits dekodiertes JSON). */
  initialText?: string;
  onImported?: (deck: Deck) => void;
}

export function AiImportDialog({ open, onClose, deckName, intoDeckId, initialText, onImported }: Props) {
  const importDeck = useStore(s => s.importDeck);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<DeckExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const prompt = buildAiPrompt(deckName);

  useEffect(() => {
    if (open) {
      setText(initialText ?? '');
      setParsed(null);
      setError(null);
      setCopied(false);
      // Bei Share-Link-Import direkt zum Vorschau-Schritt.
      setShowPrompt(!initialText);
      if (initialText) tryParse(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialText]);

  function tryParse(raw: string) {
    try {
      const result = parseDeckImport(raw);
      setParsed(result);
      setError(null);
    } catch (e) {
      setParsed(null);
      setError(e instanceof DeckImportError ? e.message : 'Import fehlgeschlagen.');
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setText(content);
      tryParse(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const deck = await importDeck(parsed, { intoDeckId });
      onImported?.(deck);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const topicCount = parsed?.topics?.length ?? 0;

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl"
      title={intoDeckId ? 'Karten importieren' : 'KI-Import'}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={doImport} className="btn-primary" disabled={!parsed || busy}>
            {busy ? 'Importiere …' : parsed ? `${parsed.cards.length} Karten importieren` : 'Importieren'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Schritt 1: System-Prompt */}
        <div className="rounded-2xl border border-white/50 overflow-hidden">
          <button onClick={() => setShowPrompt(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white/40 hover:bg-white/60 transition text-left">
            <div className="size-8 rounded-xl theme-gradient grid place-items-center flex-shrink-0">
              <Sparkles className="size-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-ink-900">1 · Prompt an die KI geben</div>
              <div className="text-xs text-ink-500">Kopieren, mit deinem Lernstoff (Foto/Text) an Claude oder ChatGPT schicken.</div>
            </div>
            <ChevronDown className={`size-4 text-ink-400 transition ${showPrompt ? 'rotate-180' : ''}`} />
          </button>
          {showPrompt && (
            <div className="p-3 space-y-2">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap bg-ink-900/5 rounded-xl p-3 max-h-44 overflow-y-auto text-ink-700">{prompt}</pre>
              <button onClick={copyPrompt} className="btn-soft w-full">
                {copied ? <><Check className="size-4 text-emerald-600" /> Kopiert!</> : <><Copy className="size-4" /> Prompt kopieren</>}
              </button>
            </div>
          )}
        </div>

        {/* Schritt 2: Antwort einfügen */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="size-6 rounded-lg bg-ink-900/10 grid place-items-center text-xs font-bold text-ink-600">2</div>
            <label className="label mb-0">JSON-Antwort der KI einfügen</label>
          </div>
          <textarea
            className="input min-h-[120px] resize-y font-mono text-xs"
            value={text}
            onChange={e => { setText(e.target.value); if (e.target.value.trim()) tryParse(e.target.value); else { setParsed(null); setError(null); } }}
            placeholder='{ "kind": "notenapp-deck", "name": "…", "cards": [ … ] }'
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => fileRef.current?.click()} className="btn-soft text-sm">
              <Upload className="size-4" /> Datei laden (.json)
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={onFile} />
          </div>
        </div>

        {/* Status / Vorschau */}
        {error && (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {parsed && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
              <Wand2 className="size-4" /> Bereit zum Import
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-700">
              <span className="chip"><FileJson className="size-3.5" /> {parsed.name}</span>
              <span className="chip">{parsed.cards.length} Karten</span>
              {topicCount > 0 && <span className="chip">{topicCount} Themen</span>}
            </div>
            {intoDeckId && <div className="subtle mt-2 text-xs">Die Karten werden in den aktuellen Kasten eingefügt.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
