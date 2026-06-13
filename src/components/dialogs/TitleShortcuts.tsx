/**
 * TitleShortcuts.tsx — Schnell-Buttons unter dem Titel-Feld im Aufgaben-Dialog.
 *
 * Zwei „schlaue" Buttons öffnen ein Popup und ERSETZEN danach den ganzen
 * Titel mit einer formatierten Aufgabenstellung:
 *   • Buch Seite …   → "Buch Seite 42/3"
 *   • Vokabeln …     → "Vokabeln Seite 15 12->20"
 *
 * Drei einfache Buttons (Buch, AB, Heft) fügen ihren Text nur an der
 * aktuellen Cursor-Position ein – das restliche Feld bleibt unangetastet.
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, BookOpen, Languages, type LucideIcon } from 'lucide-react';

/* ── NestedDialog: kleines Popup, das ÜBER dem Aufgaben-Dialog liegt ─────── */
/* Escape schließt nur dieses Popup (capture-Phase + stopImmediatePropagation),
   damit der darunterliegende Aufgaben-Dialog offen bleibt. */
function NestedDialog({ open, onClose, title, eyebrow, icon: Icon, children, footer }: {
  open: boolean; onClose: () => void; title: string; eyebrow?: string; icon?: LucideIcon;
  children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full md:max-w-md max-h-[94vh] glass-strong rounded-t-3xl md:rounded-3xl shadow-soft overflow-hidden flex flex-col"
            initial={{ y: 40, scale: .98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 24, scale: .98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="md:hidden flex justify-center pt-2.5 shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-ink-300" />
            </div>
            <div className="flex items-start justify-between gap-3 px-5 pt-3 md:pt-5 shrink-0">
              <div className="min-w-0">
                {eyebrow && (
                  <div className="eyebrow flex items-center gap-1.5 mb-1 whitespace-nowrap">
                    {Icon && <Icon className="size-3.5" strokeWidth={2.4} />}{eyebrow}
                  </div>
                )}
                <h2 className="h2">{title}</h2>
              </div>
              <button onClick={onClose} className="iconbtn ghost -mr-1 -mt-0.5 shrink-0" style={{ color: 'rgb(var(--ink-500))' }} title="Schließen">
                <X className="size-5" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-2 flex flex-col gap-4 overflow-y-auto flex-1">
              {children}
            </div>
            <div className="flex items-center justify-end gap-2.5 px-5 py-4 shrink-0 border-t"
              style={{ borderColor: 'rgb(var(--surface-border-rgb) / 0.55)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              {footer}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── kleines Eingabefeld mit Label ──────────────────────────────────────── */
function Box({ label, value, onChange, onEnter, placeholder, autoFocus, numeric }: {
  label: string; value: string; onChange: (v: string) => void; onEnter: () => void;
  placeholder?: string; autoFocus?: boolean; numeric?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input" autoFocus={autoFocus} placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
      />
    </div>
  );
}

function Preview({ children }: { children: ReactNode }) {
  return (
    <div className="subtle text-[12.5px]">
      Ergibt: <span className="font-bold text-theme-deep">{children}</span>
    </div>
  );
}

/* ── Popup 1: Buch Seite & Aufgabe ──────────────────────────────────────── */
function BuchSeitePopup({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone: (text: string) => void;
}) {
  const [seite, setSeite] = useState('');
  const [aufgabe, setAufgabe] = useState('');
  useEffect(() => { if (open) { setSeite(''); setAufgabe(''); } }, [open]);

  const seiteT = seite.trim();
  const valid = seiteT.length > 0;
  const build = () => {
    const a = aufgabe.trim();
    return a ? `Buch Seite ${seiteT}/${a}` : `Buch Seite ${seiteT}`;
  };
  const submit = () => { if (valid) onDone(build()); };

  return (
    <NestedDialog
      open={open} onClose={onClose} eyebrow="Shortcut" icon={BookOpen} title="Buch · Seite & Aufgabe"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Abbrechen</button>
        <button onClick={submit} className="btn-primary" disabled={!valid}><Check className="size-4" />Fertig</button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Box label="Seite" value={seite} onChange={setSeite} onEnter={submit} placeholder="42" autoFocus numeric />
        <Box label="Aufgabe" value={aufgabe} onChange={setAufgabe} onEnter={submit} placeholder="3" />
      </div>
      <Preview>{valid ? build() : 'Buch Seite …/…'}</Preview>
    </NestedDialog>
  );
}

/* ── Popup 2: Vokabeln Seite von→bis ────────────────────────────────────── */
function VokabelnPopup({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone: (text: string) => void;
}) {
  const [seite, setSeite] = useState('');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  useEffect(() => { if (open) { setSeite(''); setVon(''); setBis(''); } }, [open]);

  const seiteT = seite.trim();
  const valid = seiteT.length > 0;
  const build = () => {
    const v = von.trim(), b = bis.trim();
    return (v || b) ? `Vokabeln Seite ${seiteT} ${v}->${b}` : `Vokabeln Seite ${seiteT}`;
  };
  const submit = () => { if (valid) onDone(build()); };

  return (
    <NestedDialog
      open={open} onClose={onClose} eyebrow="Shortcut" icon={Languages} title="Vokabeln · Seite & Bereich"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Abbrechen</button>
        <button onClick={submit} className="btn-primary" disabled={!valid}><Check className="size-4" />Fertig</button>
      </>}
    >
      <Box label="Seite" value={seite} onChange={setSeite} onEnter={submit} placeholder="15" autoFocus numeric />
      <div className="grid grid-cols-2 gap-3">
        <Box label="Vokabel von" value={von} onChange={setVon} onEnter={submit} placeholder="12" numeric />
        <Box label="Vokabel bis" value={bis} onChange={setBis} onEnter={submit} placeholder="20" numeric />
      </div>
      <Preview>{valid ? build() : 'Vokabeln Seite … …->…'}</Preview>
    </NestedDialog>
  );
}

/* ── Hauptleiste unter dem Titel-Feld ───────────────────────────────────── */
const SMART_CHIP: React.CSSProperties = {
  borderColor: 'rgb(var(--theme-primary-rgb) / 0.5)',
  color: 'rgb(var(--theme-primary-deep-rgb))',
  background: 'rgb(var(--theme-primary-rgb) / 0.1)',
  boxShadow: '0 4px 16px -4px rgb(var(--theme-primary-rgb) / 0.45)',
};

export function TitleShortcuts({ value, onChange, inputRef }: {
  value: string;
  onChange: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [popup, setPopup] = useState<null | 'buch' | 'vok'>(null);

  // Cursor nach dem Setzen ans gewünschte Ende stellen und Feld fokussieren.
  const focusAt = (pos: number) => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  // Smart-Buttons: ganzes Feld ersetzen.
  const replaceWith = (text: string) => {
    onChange(text);
    setPopup(null);
    focusAt(text.length);
  };

  // Einfache Buttons: Text an der aktuellen Cursor-Position einsetzen.
  const pasteAtCursor = (token: string) => {
    const el = inputRef.current;
    if (!el) { onChange(value + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    focusAt(start + token.length);
  };

  return (
    <div className="mt-2.5">
      {/* Eine Zeile: links die smarten Buttons (mit Glow, öffnen ein Popup &
          ersetzen das Feld), rechts die einfachen (fügen an Cursor ein). */}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="dlg-chip" style={SMART_CHIP} onClick={() => setPopup('buch')}>
          <BookOpen className="size-4" strokeWidth={2.2} />Buch Seite …
        </button>
        <button type="button" className="dlg-chip" style={SMART_CHIP} onClick={() => setPopup('vok')}>
          <Languages className="size-4" strokeWidth={2.2} />Vokabeln …
        </button>
        {['Buch', 'AB', 'Heft'].map(t => (
          <button key={t} type="button" className="dlg-chip" onClick={() => pasteAtCursor(t + ' ')}>{t}</button>
        ))}
      </div>

      <BuchSeitePopup open={popup === 'buch'} onClose={() => setPopup(null)} onDone={replaceWith} />
      <VokabelnPopup open={popup === 'vok'} onClose={() => setPopup(null)} onDone={replaceWith} />
    </div>
  );
}
