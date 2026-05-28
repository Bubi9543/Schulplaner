import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';
import { lookupByFriendCode, normalizeFriendCode } from '@/lib/homeworkShare';
import { UserPlus, Search, Check, Loader2 } from 'lucide-react';
import type { UserProfile } from '@/lib/homeworkShare';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HomeworkSubscribeDialog({ open, onClose }: Props) {
  const subjects = useStore(s => s.subjects);
  const settings = useStore(s => s.settings);
  const addHomeworkSubscription = useStore(s => s.addHomeworkSubscription);
  const authUser = useStore(s => s.authUser);

  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<UserProfile | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string[] | null>(null); // null = alle
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOberstufe = settings?.system === 'oberstufe';

  useEffect(() => {
    if (!open) {
      setCode('');
      setFound(null);
      setLookupError(null);
      setSaving(false);
    } else {
      // Beim Öffnen: Oberstufe → kein Fach vorausgewählt (leeres Array)
      // Nicht-Oberstufe → alle Fächer (null)
      setSubjectFilter(isOberstufe ? [] : null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, isOberstufe]);

  async function lookup() {
    const normalized = normalizeFriendCode(code);
    if (normalized.length < 6) {
      setLookupError('Code muss 6 Zeichen lang sein (Buchstaben/Ziffern, ohne 0/O/1/I).');
      return;
    }
    setLooking(true);
    setLookupError(null);
    setFound(null);
    try {
      // Eigener Code?
      if (authUser) {
        const subs = settings?.homeworkSubscriptions ?? [];
        // Prüfe ob schon abonniert
        const profile = await lookupByFriendCode(normalized);
        if (!profile) {
          setLookupError('Freundecode nicht gefunden. Tippfehler?');
          return;
        }
        if (profile.userId === authUser.id) {
          setLookupError('Das ist dein eigener Code – du kannst dir nicht selbst abonnieren.');
          return;
        }
        if (subs.some(s => s.userId === profile.userId)) {
          setLookupError(`Du hast ${profile.displayName} bereits abonniert.`);
          return;
        }
        setFound(profile);
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    } finally {
      setLooking(false);
    }
  }

  async function confirm() {
    if (!found) return;
    setSaving(true);
    try {
      await addHomeworkSubscription({
        userId: found.userId,
        displayName: found.displayName,
        friendCode: found.friendCode,
        subjectFilter,
        addedAt: Date.now(),
      });
      onClose();
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSubject(name: string) {
    setSubjectFilter(prev => {
      if (prev === null) {
        // von "alle" zu "alle außer diesem"
        return subjects.map(s => s.name).filter(n => n !== name);
      }
      if (prev.includes(name)) {
        return prev.filter(n => n !== name);
      } else {
        const next = [...prev, name];
        // Wenn alle gewählt → zurück zu null (alle)
        if (next.length === subjects.length) return null;
        return next;
      }
    });
  }

  function toggleAll() {
    setSubjectFilter(f => f === null ? [] : null);
  }

  const allSelected = subjectFilter === null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mitschüler abonnieren"
      footer={
        found ? (
          <>
            <button onClick={onClose} className="btn-ghost">Abbrechen</button>
            <button onClick={confirm} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Abonnieren
            </button>
          </>
        ) : (
          <button onClick={onClose} className="btn-ghost">Schließen</button>
        )
      }
    >
      <div className="space-y-5">
        {/* Code-Eingabe */}
        <div>
          <label className="label">Freundecode des Mitschülers</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1 tracking-[0.15em] uppercase font-mono"
              placeholder="z.B. A3BK9F"
              maxLength={8}
              value={code}
              onChange={e => {
                setCode(normalizeFriendCode(e.target.value));
                setFound(null);
                setLookupError(null);
              }}
              onKeyDown={e => e.key === 'Enter' && !found && lookup()}
            />
            <button
              className="btn-primary flex-shrink-0"
              onClick={lookup}
              disabled={looking || normalizeFriendCode(code).length < 6}
            >
              {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Suchen
            </button>
          </div>
          {lookupError && (
            <p className="mt-2 text-sm text-rose-600">{lookupError}</p>
          )}
        </div>

        {/* Gefundener Nutzer */}
        {found && (
          <>
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="size-9 rounded-full bg-emerald-100 grid place-items-center flex-shrink-0">
                <Check className="size-5 text-emerald-600" />
              </div>
              <div>
                <div className="font-semibold text-ink-800">{found.displayName}</div>
                <div className="text-xs text-ink-500 font-mono">{found.friendCode}</div>
              </div>
            </div>

            {/* Fächerfilter */}
            {subjects.length > 0 && (
              <div>
                <label className="label">Welche Fächer möchtest du empfangen?</label>
                <p className="text-xs text-ink-500 mb-3">
                  {isOberstufe
                    ? 'Oberstufe: Standardmäßig kein Fach – wähle die Fächer aus, in denen ihr gleich seid.'
                    : 'Standardmäßig alle Fächer – deaktiviere einzelne, falls ihr in manchen getrennt seid.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className={`chip ${allSelected ? 'chip-active' : ''}`}
                  >
                    Alle
                  </button>
                  {subjects.map(s => {
                    const active = allSelected || (subjectFilter?.includes(s.name) ?? false);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSubject(s.name)}
                        className={`chip ${active ? 'chip-active' : ''}`}
                        style={active ? { background: s.color + '22', borderColor: s.color + '88', color: s.color } : {}}
                      >
                        <span className="size-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                {!allSelected && subjectFilter !== null && subjectFilter.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">⚠ Kein Fach ausgewählt – du empfängst keine Hausaufgaben.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
