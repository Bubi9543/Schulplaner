import { useMemo, useState } from 'react';
import { Link2, Copy, Check, Download, Share2, ClipboardCopy } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { buildDeckExport, encodeDeckShare } from '@/lib/flashcards';
import type { Deck } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  deck: Deck;
}

export function ShareDialog({ open, onClose, deck }: Props) {
  const allTopics = useStore(s => s.cardTopics);
  const allCards = useStore(s => s.flashcards);
  const topics = useMemo(() => allTopics.filter(t => t.deckId === deck.id), [allTopics, deck.id]);
  const cards = useMemo(() => allCards.filter(c => c.deckId === deck.id), [allCards, deck.id]);
  const [copied, setCopied] = useState<'link' | 'json' | null>(null);

  const { json, link } = useMemo(() => {
    const exp = buildDeckExport(deck, topics, cards);
    const token = encodeDeckShare(exp);
    const url = `${window.location.origin}/karteikarten?import=${token}`;
    return { json: JSON.stringify(exp, null, 2), link: url };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, topics, cards, open]);

  async function copy(what: 'link' | 'json') {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : json);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* ignore */ }
  }

  function downloadJson() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'kasten'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function nativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title: deck.name, text: `Karteikarten-Kasten „${deck.name}"`, url: link }); }
      catch { /* abgebrochen */ }
    } else {
      copy('link');
    }
  }

  const linkTooLong = link.length > 8000;

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-lg" title="Kasten teilen"
      footer={<button onClick={onClose} className="btn-ghost">Schließen</button>}
    >
      <div className="space-y-4">
        <p className="subtle">
          Teile „<strong className="text-ink-700">{deck.name}</strong>" ({cards.length} Karten) mit Freunden.
          Beim Öffnen des Links landet eine eigene Kopie in ihrem Account – Lernfortschritt bleibt getrennt.
        </p>

        {!linkTooLong ? (
          <div>
            <label className="label flex items-center gap-1.5"><Link2 className="size-4" /> Teil-Link</label>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={link} onFocus={e => e.currentTarget.select()} />
              <button onClick={() => copy('link')} className="btn-primary px-3 flex-shrink-0">
                {copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            </div>
            <button onClick={nativeShare} className="btn-soft w-full mt-2">
              <Share2 className="size-4" /> Teilen …
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-700">
            Der Kasten ist sehr groß für einen Link. Nutze stattdessen die JSON-Datei.
          </div>
        )}

        <div className="border-t border-white/40 pt-4">
          <label className="label">Als Datei / JSON</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadJson} className="btn-soft">
              <Download className="size-4" /> JSON herunterladen
            </button>
            <button onClick={() => copy('json')} className="btn-soft">
              {copied === 'json' ? <><Check className="size-4 text-emerald-600" /> Kopiert</> : <><ClipboardCopy className="size-4" /> JSON kopieren</>}
            </button>
          </div>
          <div className="subtle text-xs mt-2">Empfänger:innen importieren die Datei über „Importieren → Datei laden".</div>
        </div>
      </div>
    </Modal>
  );
}
