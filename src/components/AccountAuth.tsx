import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, CloudOff, Zap, Loader2, LogOut, LogIn, Plus, RefreshCw, Trash2, AlertTriangle, Check } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/Card';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-800">{label}</div>
        {hint && <div className="text-xs text-ink-500">{hint}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

interface Props {
  /** Kompakt = ohne manuelle Sync-Aktionen / Cloud-leeren (z.B. im Profil). */
  compact?: boolean;
}

/**
 * Anmeldung + Cloud-Sync-Status. Wird im Profil (kompakt) und in „Daten & Sync"
 * (voll, mit manuellen Aktionen) wiederverwendet.
 */
export function AccountAuth({ compact = false }: Props) {
  const authUser = useStore(s => s.authUser);
  const syncStatus = useStore(s => s.syncStatus);
  const lastSyncedAt = useStore(s => s.lastSyncedAt);
  const liveSync = useStore(s => s.liveSync);
  const { signIn, signUp, signInWithGoogle, signOut, syncNow, pullFromCloud, wipeCloud } = useStore();

  const [mode, setMode] = useState<'idle' | 'login' | 'signup'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pullMsg, setPullMsg] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState<null | 'asking' | 'wiping' | 'done'>(null);
  const [wipeTyped, setWipeTyped] = useState('');
  const [wipeResult, setWipeResult] = useState<{ rows: number; files: number } | null>(null);

  async function handleWipe() {
    setWipeConfirm('wiping');
    const result = await wipeCloud();
    setWipeResult(result);
    setWipeConfirm('done');
  }
  function closeWipe() {
    setWipeConfirm(null);
    setWipeTyped('');
    setWipeResult(null);
  }

  if (!supabase) {
    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><CloudOff className="size-5 text-ink-400" />Cloud Sync</h3>
        <p className="text-sm text-ink-500">Sync ist noch nicht eingerichtet. Folge der Anleitung im Über-Bereich.</p>
      </Card>
    );
  }

  async function submit() {
    setError(''); setLoading(true);
    const err = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (err) setError(err); else setMode('idle');
  }

  async function handlePull() {
    const pulled = await pullFromCloud();
    setPullMsg(pulled ? 'Daten vom Server geladen!' : 'Keine Cloud-Daten gefunden.');
    setTimeout(() => setPullMsg(''), 3000);
  }

  if (authUser) {
    const liveBadge = (() => {
      switch (liveSync) {
        case 'live':
          return { Icon: Zap, label: 'Live-Sync aktiv', tone: 'text-emerald-700 bg-emerald-100 border-emerald-200' };
        case 'connecting':
          return { Icon: Loader2, label: 'Verbindet …', tone: 'text-amber-700 bg-amber-100 border-amber-200 animate-pulse' };
        case 'error':
          return { Icon: CloudOff, label: 'Sync-Fehler', tone: 'text-rose-700 bg-rose-100 border-rose-200' };
        default:
          return { Icon: CloudOff, label: 'Sync inaktiv', tone: 'text-ink-600 bg-white/70 border-white/60' };
      }
    })();

    return (
      <Card>
        <h3 className="h3 mb-3 flex items-center gap-2"><Cloud className="size-5 text-emerald-500" />Cloud Sync</h3>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-emerald-800">Eingeloggt als {authUser.email}</div>
              {lastSyncedAt && <div className="text-xs text-emerald-700/80">Letzter Abgleich: {new Date(lastSyncedAt).toLocaleTimeString('de-DE')}</div>}
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${liveBadge.tone}`}>
              <liveBadge.Icon className={`size-3.5 ${liveSync === 'connecting' ? 'animate-spin' : ''}`} />
              {liveBadge.label}
            </span>
          </div>
          <p className="text-xs text-emerald-700/80 mt-2 leading-relaxed">
            Änderungen werden automatisch zwischen all deinen Geräten synchronisiert – kein manueller Upload nötig.
          </p>
        </div>

        <Row label="Abmelden">
          <button onClick={signOut} className="btn-soft text-rose-600"><LogOut className="size-4" />Abmelden</button>
        </Row>

        {!compact && (
          <div className="mt-3 pt-3 border-t border-white/50">
            <button onClick={() => setAdvanced(v => !v)} className="text-xs text-ink-500 hover:text-ink-700 transition font-semibold">
              {advanced ? '− Manuelle Aktionen ausblenden' : '+ Manuelle Aktionen anzeigen'}
            </button>
            {advanced && (
              <div className="mt-3 space-y-2">
                <Row label="Alles hochladen" hint="Lokalen Stand in die Cloud schreiben (Notfall-Push).">
                  <button onClick={syncNow} disabled={syncStatus === 'syncing'} className="btn-ghost">
                    <Cloud className="size-4" />{syncStatus === 'syncing' ? 'Synchronisiert…' : 'Push'}
                  </button>
                </Row>
                <Row label="Alles herunterladen" hint="Cloud-Stand auf dieses Gerät laden (überschreibt lokal).">
                  <button onClick={handlePull} disabled={syncStatus === 'syncing'} className="btn-ghost">
                    <RefreshCw className="size-4" />Pull
                  </button>
                  {pullMsg && <span className="text-xs text-emerald-600">{pullMsg}</span>}
                </Row>
                <Row label="Cloud-Daten löschen" hint="Alle deine Daten vom Server entfernen. Lokale Daten bleiben auf diesem Gerät erhalten.">
                  <button onClick={() => setWipeConfirm('asking')} className="btn-soft text-rose-600">
                    <Trash2 className="size-4" />Cloud leeren
                  </button>
                </Row>
              </div>
            )}
          </div>
        )}

        {/* Bestätigungs-Modal: alle Cloud-Daten löschen */}
        <AnimatePresence>
          {wipeConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm grid place-items-center p-4"
              onClick={wipeConfirm === 'wiping' ? undefined : closeWipe}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-md rounded-3xl glass-strong shadow-soft p-5"
              >
                {wipeConfirm === 'asking' && (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="size-10 rounded-2xl bg-rose-100 text-rose-600 grid place-items-center flex-shrink-0">
                        <AlertTriangle className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-lg text-ink-900">Alle Cloud-Daten löschen?</h3>
                        <p className="text-sm text-ink-600 mt-1">
                          Dadurch werden auf dem Server <strong>alle</strong> deine Fächer, Noten, Aufgaben, Stunden, Schuljahre, Fotos und Einstellungen gelöscht.
                          Andere Geräte, die eingeloggt sind, verlieren ebenfalls Zugriff auf den Cloud-Stand.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 mb-3">
                      Deine Daten auf <strong>diesem Gerät</strong> bleiben erhalten. Anschließend wirst du automatisch abgemeldet, damit nicht direkt wieder hochgeladen wird.
                    </div>
                    <label className="text-xs font-semibold text-ink-700 block mb-1">Tippe <code className="px-1 py-0.5 rounded bg-white/70 text-rose-600">LÖSCHEN</code> zur Bestätigung:</label>
                    <input
                      autoFocus
                      className="input"
                      value={wipeTyped}
                      onChange={e => setWipeTyped(e.target.value)}
                      placeholder="LÖSCHEN"
                    />
                    <div className="flex gap-2 mt-4">
                      <button onClick={closeWipe} className="btn-ghost flex-1">Abbrechen</button>
                      <button
                        onClick={handleWipe}
                        disabled={wipeTyped.trim() !== 'LÖSCHEN'}
                        className="btn-primary flex-1 !bg-rose-500 hover:!bg-rose-600 disabled:!bg-rose-300"
                      >
                        <Trash2 className="size-4" />Endgültig löschen
                      </button>
                    </div>
                  </>
                )}
                {wipeConfirm === 'wiping' && (
                  <div className="flex flex-col items-center text-center py-4">
                    <Loader2 className="size-8 text-rose-500 animate-spin mb-3" />
                    <h3 className="font-display font-bold text-lg text-ink-900">Lösche alle Cloud-Daten …</h3>
                    <p className="text-sm text-ink-600 mt-1">Datenbank-Zeilen und Foto-Dateien werden entfernt.</p>
                  </div>
                )}
                {wipeConfirm === 'done' && (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="size-10 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center flex-shrink-0">
                        <Check className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-lg text-ink-900">Cloud ist leer.</h3>
                        {wipeResult ? (
                          <p className="text-sm text-ink-600 mt-1">
                            {wipeResult.rows} Datenbank-Zeilen und {wipeResult.files} Foto-Dateien gelöscht. Du wurdest abgemeldet.
                          </p>
                        ) : (
                          <p className="text-sm text-ink-600 mt-1">Du wurdest abgemeldet.</p>
                        )}
                      </div>
                    </div>
                    <button onClick={closeWipe} className="btn-primary w-full">Schließen</button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Cloud className="size-5 text-theme" />Cloud Sync</h3>
      <p className="text-sm text-ink-600 mb-3">Melde dich an, um deine Daten zwischen Geräten zu synchronisieren und Freunde hinzuzufügen.</p>

      {mode === 'idle' ? (
        <div className="space-y-2">
          <button onClick={() => setMode('login')} className="btn-primary w-full"><LogIn className="size-4" />Anmelden</button>
          <button onClick={() => setMode('signup')} className="btn-ghost w-full"><Plus className="size-4" />Neu registrieren</button>
          <button onClick={signInWithGoogle} className="btn-ghost w-full">
            <svg className="size-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Mit Google anmelden
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-ink-700">{mode === 'login' ? 'Anmelden' : 'Registrieren'}</div>
          <input className="input" type="email" placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          <input className="input" type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <div className="flex gap-2">
            <button onClick={() => setMode('idle')} className="btn-ghost flex-1">Zurück</button>
            <button onClick={submit} disabled={loading || !email || !password} className="btn-primary flex-1">
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
