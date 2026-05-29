import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Copy, Check, RefreshCw, Share2, Trash2, Loader2, AlertCircle, KeyRound, CalendarDays, BookOpen } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { SubjectIcon } from '@/components/SubjectIcon';
import { supabase } from '@/lib/supabase';
import {
  createOrRefreshShare,
  fetchScheduleShare,
  deleteOwnShares,
  getOwnActiveShare,
  normalizeCode,
  type ShareInfo,
} from '@/lib/scheduleShare';

type Tab = 'share' | 'import';

interface Props {
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
}

function fmtRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'abgelaufen';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return `${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  if (hours >= 1) return `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`;
  return 'weniger als 1 Stunde';
}

export function ScheduleShareDialog({ open, initialTab = 'share', onClose }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-3 md:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full max-w-lg glass-strong rounded-3xl shadow-soft overflow-hidden"
            initial={{ y: 30, scale: .96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: .98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="h2 flex items-center gap-2">
                <Share2 className="size-5 text-theme" />
                Stundenplan teilen
              </h2>
              <button onClick={onClose} className="size-9 grid place-items-center rounded-full hover:bg-white/70 transition">
                <X className="size-5" />
              </button>
            </div>

            <div className="px-5 pt-3">
              <div className="inline-flex glass rounded-2xl p-1 gap-0.5">
                <TabBtn active={tab === 'share'} onClick={() => setTab('share')}>Teilen</TabBtn>
                <TabBtn active={tab === 'import'} onClick={() => setTab('import')}>Empfangen</TabBtn>
              </div>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto">
              {tab === 'share' ? <ShareTab /> : <ImportTab onDone={onClose} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`relative px-4 py-1.5 rounded-xl text-sm font-semibold transition ${active ? 'text-white' : 'text-ink-700'}`}>
      {active && <motion.span layoutId="share-tab" className="absolute inset-0 rounded-xl theme-gradient" />}
      <span className="relative">{children}</span>
    </button>
  );
}

// ─── Teilen-Tab ──────────────────────────────────────────────────────────────

function ShareTab() {
  const authUser = useStore(s => s.authUser);
  const settings = useStore(s => s.settings);
  const subjects = useStore(s => s.subjects);
  const lessons = useStore(s => s.lessons);
  const schoolYears = useStore(s => s.schoolYears);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const activeYear = schoolYears.find(y => y.id === activeSchoolYearId);

  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authUser) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getOwnActiveShare()
      .then(s => { if (!cancelled) setShare(s); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser]);

  async function generate() {
    if (!activeSchoolYearId) { setError('Kein aktives Schuljahr.'); return; }
    setError(null);
    setLoading(true);
    try {
      const info = await createOrRefreshShare({
        schoolYearId: activeSchoolYearId,
        ownerName: settings?.name,
        schoolYearName: activeYear?.name,
      });
      setShare(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    if (!confirm('Code zurückziehen? Andere können den Stundenplan dann nicht mehr übernehmen.')) return;
    setLoading(true);
    try {
      await deleteOwnShares();
      setShare(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function shareNative() {
    if (!share) return;
    const text = `Mein Stundenplan-Code für Notenapp: ${share.code}\n(7 Tage gültig)`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator).share({ title: 'Stundenplan-Code', text });
        return;
      } catch { /* fallback */ }
    }
    await copyCode();
  }

  if (!supabase || !authUser) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="size-5 flex-shrink-0 mt-0.5" />
        <div>
          Zum Teilen brauchst du einen Cloud-Account.
          Logge dich in den <strong>Einstellungen → Cloud Sync</strong> ein.
        </div>
      </div>
    );
  }

  const subjCount = subjects.length;
  const lessonCount = lessons.length;
  const empty = subjCount === 0 || lessonCount === 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        Generiere einen 4-stelligen Code, den deine Freunde in ihrer App eingeben können,
        um deinen Stundenplan zu übernehmen. Noten und Aufgaben werden <strong>nicht</strong> geteilt.
      </p>

      <div className="rounded-2xl bg-white/60 border border-white/70 p-3 text-xs text-ink-600 flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 text-ink-400" />
          {activeYear?.name ?? 'Schuljahr'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5 text-ink-400" />
          {subjCount} {subjCount === 1 ? 'Fach' : 'Fächer'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-ink-400" />
          {lessonCount} {lessonCount === 1 ? 'Stunde' : 'Stunden'}
        </span>
      </div>

      {empty && !share && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          Du brauchst mindestens ein Fach und eine Stunde, bevor du teilen kannst.
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white/60 p-8 grid place-items-center">
          <Loader2 className="size-6 text-theme animate-spin" />
        </div>
      ) : share ? (
        <div className="space-y-3">
          <div className="rounded-3xl theme-gradient text-white p-6 text-center overflow-hidden relative">
            <div className="absolute -top-12 -left-12 size-40 rounded-full bg-white/15 blur-3xl" />
            <div className="absolute -bottom-12 -right-12 size-40 rounded-full bg-white/10 blur-3xl" />
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold opacity-90 relative">Dein Code</div>
            <div className="font-display font-extrabold text-6xl md:text-7xl mt-2 tracking-[0.15em] relative select-all">
              {share.code}
            </div>
            <div className="text-xs opacity-85 mt-2 relative">
              Läuft in {fmtRemaining(share.expiresAt)} ab
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={copyCode} className="btn-ghost flex-1">
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              {copied ? 'Kopiert!' : 'Kopieren'}
            </button>
            <button onClick={shareNative} className="btn-primary flex-1">
              <Share2 className="size-4" />Teilen
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={generate} disabled={loading} className="btn-ghost flex-1 text-xs">
              <RefreshCw className="size-3.5" />Auffrischen
            </button>
            <button onClick={revoke} disabled={loading} className="btn-soft flex-1 text-xs text-rose-600">
              <Trash2 className="size-3.5" />Zurückziehen
            </button>
          </div>
          <div className="text-[11px] text-ink-500 leading-relaxed">
            „Auffrischen" speichert den aktuellen Stand deines Stundenplans neu auf den selben Code
            und verlängert die Gültigkeit auf 7 Tage. „Zurückziehen" löscht den Code sofort.
          </div>
        </div>
      ) : (
        <button onClick={generate} disabled={empty} className="btn-primary w-full">
          <KeyRound className="size-4" />Code generieren
        </button>
      )}

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Empfangen-Tab ───────────────────────────────────────────────────────────

function ImportTab({ onDone }: { onDone: () => void }) {
  const authUser = useStore(s => s.authUser);
  const importSharedSchedule = useStore(s => s.importSharedSchedule);
  const activeSchoolYearId = useStore(s => s.activeSchoolYearId);
  const lessons = useStore(s => s.lessons);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [preview, setPreview] = useState<ShareInfo | null>(null);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ subjectsAdded: number; subjectsMatched: number; lessonsAdded: number; lessonsReplaced: number } | null>(null);

  async function lookup() {
    setError(null);
    setPreview(null);
    setResult(null);
    setLoadingFetch(true);
    try {
      const info = await fetchScheduleShare(code);
      setPreview(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFetch(false);
    }
  }

  async function doImport() {
    if (!preview) return;
    setError(null);
    setImporting(true);
    try {
      const r = await importSharedSchedule(preview.payload, mode);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  if (!supabase || !authUser) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex items-start gap-2">
        <AlertCircle className="size-5 flex-shrink-0 mt-0.5" />
        <div>
          Zum Empfangen brauchst du einen Cloud-Account.
          Logge dich in den <strong>Einstellungen → Cloud Sync</strong> ein.
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
          <div className="size-10 rounded-2xl bg-emerald-500 text-white grid place-items-center flex-shrink-0">
            <Check className="size-5" strokeWidth={3} />
          </div>
          <div className="text-sm text-emerald-900">
            <div className="font-semibold">Stundenplan übernommen.</div>
            <ul className="mt-1 space-y-0.5 text-emerald-800">
              <li>• {result.subjectsAdded} Fächer angelegt, {result.subjectsMatched} mit bestehenden zusammengeführt</li>
              <li>• {result.lessonsAdded} Stunden hinzugefügt{result.lessonsReplaced ? ` (${result.lessonsReplaced} alte ersetzt)` : ''}</li>
            </ul>
          </div>
        </div>
        <button onClick={onDone} className="btn-primary w-full">Fertig</button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white/60 p-4">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1">Vorschau</div>
          <div className="font-display font-bold text-lg text-ink-900">
            {preview.payload.ownerName ? `${preview.payload.ownerName}s Stundenplan` : 'Stundenplan'}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {preview.payload.schoolYearName ? `${preview.payload.schoolYearName} · ` : ''}
            {preview.payload.subjects.length} Fächer · {preview.payload.lessons.length} Stunden
          </div>
          {preview.ownerEmail && (
            <div className="text-[11px] text-ink-400 mt-1">von {preview.ownerEmail}</div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preview.payload.subjects.slice(0, 12).map(s => (
              <span key={s.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{ background: s.color }}
              >
                <SubjectIcon subject={s} className="size-3" />{s.short}
              </span>
            ))}
            {preview.payload.subjects.length > 12 && (
              <span className="text-[10px] text-ink-500 px-1">+{preview.payload.subjects.length - 12}</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500">Übernehmen als</div>
          <label className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition ${mode === 'replace' ? 'border-theme bg-theme-soft/40' : 'border-white/60 bg-white/40'}`}>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 accent-theme" />
            <div>
              <div className="font-semibold text-sm text-ink-800">Stundenplan ersetzen</div>
              <div className="text-xs text-ink-500 mt-0.5">
                Deine bisherigen {lessons.length} Stunden im aktuellen Schuljahr werden gelöscht. Fächer mit gleichem Namen werden zusammengeführt, deine Noten und Aufgaben bleiben.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition ${mode === 'append' ? 'border-theme bg-theme-soft/40' : 'border-white/60 bg-white/40'}`}>
            <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} className="mt-1 accent-theme" />
            <div>
              <div className="font-semibold text-sm text-ink-800">Hinzufügen</div>
              <div className="text-xs text-ink-500 mt-0.5">
                Stunden des Freundes werden zu deinem Stundenplan ergänzt. Kann zu Überlappungen führen.
              </div>
            </div>
          </label>
        </div>

        {!activeSchoolYearId && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            Du brauchst ein aktives Schuljahr.
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => { setPreview(null); setCode(''); }} className="btn-ghost flex-1">Zurück</button>
          <button onClick={doImport} disabled={importing || !activeSchoolYearId} className="btn-primary flex-1">
            {importing ? <><Loader2 className="size-4 animate-spin" />Übernehme …</> : <>Übernehmen</>}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        Frag deinen Freund nach dem 4-stelligen Code und gib ihn hier ein.
      </p>
      <CodeInput value={code} onChange={setCode} onSubmit={lookup} disabled={loadingFetch} />
      <button onClick={lookup} disabled={loadingFetch || normalizeCode(code).length !== 4} className="btn-primary w-full">
        {loadingFetch ? <><Loader2 className="size-4 animate-spin" />Suche …</> : <>Code prüfen</>}
      </button>
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}

function CodeInput({ value, onChange, onSubmit, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean }) {
  const chars = value.padEnd(4, ' ').slice(0, 4).split('');
  return (
    <div className="space-y-3">
      {/* Visualisierung der 4 Stellen */}
      <div className="flex gap-2 justify-center">
        {chars.map((c, i) => (
          <div key={i}
            className={`size-14 md:size-16 rounded-2xl border-2 grid place-items-center font-display font-extrabold text-3xl md:text-4xl transition ${
              c.trim() ? 'border-theme bg-theme-soft/30 text-ink-900' : 'border-ink-200 bg-white/40 text-ink-300'
            }`}>
            {c.trim() || '·'}
          </div>
        ))}
      </div>
      {/* Das eigentliche Eingabefeld */}
      <input
        autoFocus
        className="input text-center text-2xl font-display font-bold tracking-[0.3em] uppercase"
        value={value}
        onChange={e => onChange(normalizeCode(e.target.value))}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="ABCD"
        maxLength={4}
        disabled={disabled}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
