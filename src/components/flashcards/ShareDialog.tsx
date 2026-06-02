import { useEffect, useMemo, useState } from 'react';
import { Link2, Copy, Check, Download, Share2, ClipboardCopy, Send, Users, Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Avatar } from '@/components/Avatar';
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
  const friends = useStore(s => s.friends);
  const authUser = useStore(s => s.authUser);
  const sendDeckToFriends = useStore(s => s.sendDeckToFriends);
  const topics = useMemo(() => allTopics.filter(t => t.deckId === deck.id), [allTopics, deck.id]);
  const cards = useMemo(() => allCards.filter(c => c.deckId === deck.id), [allCards, deck.id]);
  const [copied, setCopied] = useState<'link' | 'json' | null>(null);

  // ─── An Freunde senden ───────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<number | null>(null);

  useEffect(() => {
    if (open) { setSelected(new Set()); setSentTo(null); }
  }, [open]);

  function toggleFriend(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSentTo(null);
  }

  async function send() {
    if (selected.size === 0 || cards.length === 0) return;
    setSending(true);
    try {
      const n = await sendDeckToFriends(deck.id, [...selected]);
      setSentTo(n);
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Senden fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  }

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
          Empfänger:innen bekommen eine eigene Kopie – der Lernfortschritt bleibt getrennt.
        </p>

        {/* An Freunde senden */}
        <div className="rounded-2xl border border-white/50 bg-white/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="size-4 text-theme-deep" />
            <span className="font-semibold text-sm text-ink-900">An Freunde senden</span>
          </div>
          {!authUser ? (
            <p className="subtle text-xs">Melde dich an, um Kästen direkt an deine Freunde zu schicken.</p>
          ) : friends.length === 0 ? (
            <p className="subtle text-xs">Du hast noch keine Freunde hinzugefügt. Unter „Freunde" kannst du welche per Code adden.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto -mx-1 px-1">
                {friends.map(f => {
                  const on = selected.has(f.userId);
                  return (
                    <button key={f.userId} onClick={() => toggleFriend(f.userId)}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition text-left ${on ? 'bg-theme-primary/15' : 'hover:bg-white/60'}`}>
                      <Avatar name={f.displayName} avatarUrl={f.avatarUrl} className="size-8" textClassName="text-xs" />
                      <span className="flex-1 min-w-0 text-sm font-medium text-ink-800 truncate">{f.displayName}</span>
                      <span className={`size-5 rounded-full grid place-items-center border transition ${on ? 'theme-gradient border-transparent text-white' : 'border-ink-300'}`}>
                        {on && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={send} disabled={selected.size === 0 || sending || cards.length === 0}
                className="btn-primary w-full mt-2 py-2">
                {sending ? <><Loader2 className="size-4 animate-spin" /> Senden …</>
                  : <><Send className="size-4" /> {selected.size > 0 ? `An ${selected.size} senden` : 'Freunde auswählen'}</>}
              </button>
              {sentTo !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <Check className="size-4" /> An {sentTo} {sentTo === 1 ? 'Freund:in' : 'Freunde'} gesendet!
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
          <span className="h-px flex-1 bg-white/40" /> oder per Link / Datei <span className="h-px flex-1 bg-white/40" />
        </div>

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
