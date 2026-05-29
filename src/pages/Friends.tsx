import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, UserPlus, Search, Loader2, Check, X, Copy, Camera, Trash2,
  Share2, CalendarDays, Clock, Zap, Inbox, Send, AlertTriangle, Pencil,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { AccountAuth } from '@/components/AccountAuth';
import { StudyLeaderboard } from '@/components/StudyLeaderboard';
import { useStore } from '@/store/useStore';
import { normalizeFriendCode } from '@/lib/homeworkShare';
import { uploadAvatar, removeAvatar } from '@/lib/avatar';
import { startOfISOWeek } from '@/lib/studyShare';
import type { Friend } from '@/lib/friends';
import type { SharePayload } from '@/lib/scheduleShare';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'theme-gradient' : 'bg-ink-200'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

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

export function FriendsPage() {
  const authUser = useStore(s => s.authUser);
  const loadFriends = useStore(s => s.loadFriends);

  // Beim Öffnen (und nach Login) den Freundes-Graph frisch laden.
  useEffect(() => { if (authUser) void loadFriends(); }, [authUser, loadFriends]);

  return (
    <PageShell title="Freunde" subtitle="Profil, Freundschaftsanfragen, Hausaufgaben- & Stundenplan-Teilen und die Lern-Rangliste.">
      {!authUser ? (
        <div className="max-w-xl">
          <div className="mb-3 rounded-2xl theme-gradient-soft border border-theme/20 p-4 text-sm text-ink-700">
            Melde dich an, um Freunde hinzuzufügen, Hausaufgaben & Stundenplan zu teilen und euch in der Lern-Rangliste zu vergleichen.
          </div>
          <AccountAuth />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <MyProfileCard />
            <AddFriendCard />
            <RequestsCard />
          </div>
          <div className="space-y-4">
            <FriendsListCard />
            <SharingCard />
            <LeaderboardSlot />
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ─── Mein Profil ─────────────────────────────────────────────────────────────

function MyProfileCard() {
  const myProfile = useStore(s => s.myProfile);
  const settings = useStore(s => s.settings);
  const setMyProfile = useStore(s => s.setMyProfile);
  const setSettings = useStore(s => s.setSettings);

  const [name, setName] = useState(myProfile?.displayName ?? settings?.name ?? '');
  const [editing, setEditing] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(myProfile?.displayName ?? settings?.name ?? ''); }, [myProfile?.displayName, settings?.name]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavingName(true); setErr(null);
    try {
      const { getOrCreateMyProfile } = await import('@/lib/homeworkShare');
      const profile = await getOrCreateMyProfile(trimmed);
      setMyProfile(profile);
      await setSettings({ name: trimmed });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyAvatar(true); setErr(null);
    try {
      const url = await uploadAvatar(file);
      if (myProfile) setMyProfile({ ...myProfile, avatarUrl: url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAvatar(false);
    }
  }

  async function clearAvatar() {
    setBusyAvatar(true); setErr(null);
    try {
      await removeAvatar();
      if (myProfile) setMyProfile({ ...myProfile, avatarUrl: undefined });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAvatar(false);
    }
  }

  function copyCode() {
    if (!myProfile?.friendCode) return;
    navigator.clipboard.writeText(myProfile.friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const displayName = myProfile?.displayName ?? settings?.name ?? 'Ich';

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Users className="size-5 text-theme" />Mein Profil</h3>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={displayName} avatarUrl={myProfile?.avatarUrl} className="size-16" textClassName="text-xl" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busyAvatar}
            className="absolute -bottom-1 -right-1 size-7 rounded-full theme-gradient text-white grid place-items-center shadow ring-2 ring-[rgb(var(--surface-rgb))] disabled:opacity-60"
            title="Profilbild ändern"
          >
            {busyAvatar ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                autoFocus
                maxLength={40}
              />
              <button onClick={saveName} disabled={savingName} className="btn-primary flex-shrink-0">
                {savingName ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="font-display font-bold text-lg text-ink-900 truncate">{displayName}</div>
              <button onClick={() => setEditing(true)} className="text-ink-400 hover:text-ink-700 transition" title="Namen ändern">
                <Pencil className="size-4" />
              </button>
            </div>
          )}
          {myProfile?.avatarUrl && (
            <button onClick={clearAvatar} disabled={busyAvatar} className="text-xs text-ink-500 hover:text-rose-600 transition mt-1">
              Profilbild entfernen
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}

      <div className="mt-4">
        <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">Dein Freundecode</div>
        <button
          onClick={copyCode}
          className="w-full flex items-center justify-between gap-2 rounded-2xl theme-gradient-soft border border-theme/20 px-4 py-3 hover:border-theme/40 transition"
        >
          <span className="font-mono text-xl font-bold tracking-[0.2em] text-theme-deep">{myProfile?.friendCode ?? '······'}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-theme-deep">
            {copied ? <><Check className="size-4" />Kopiert</> : <><Copy className="size-4" />Kopieren</>}
          </span>
        </button>
        <p className="text-xs text-ink-500 mt-1.5">Teile diesen Code mit Freunden – sie schicken dir damit eine Anfrage.</p>
      </div>
    </Card>
  );
}

// ─── Freund hinzufügen ─────────────────────────────────────────────────────────

function AddFriendCard() {
  const sendFriendRequest = useStore(s => s.sendFriendRequest);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function send() {
    const normalized = normalizeFriendCode(code);
    if (normalized.length < 6) {
      setMsg({ kind: 'err', text: 'Code muss 6 Zeichen lang sein.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await sendFriendRequest(normalized);
      setMsg({ kind: 'ok', text: 'Anfrage gesendet! Sie wird zum Freund, sobald dein Freund annimmt.' });
      setCode('');
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><UserPlus className="size-5 text-theme" />Freund hinzufügen</h3>
      <div className="flex gap-2">
        <input
          className="input flex-1 tracking-[0.15em] uppercase font-mono"
          placeholder="z.B. A3BK9F"
          maxLength={8}
          value={code}
          onChange={e => { setCode(normalizeFriendCode(e.target.value)); setMsg(null); }}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="btn-primary flex-shrink-0" onClick={send} disabled={busy || normalizeFriendCode(code).length < 6}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Anfragen
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </Card>
  );
}

// ─── Anfragen ─────────────────────────────────────────────────────────────────

function RequestsCard() {
  const incoming = useStore(s => s.incomingRequests);
  const outgoing = useStore(s => s.outgoingRequests);
  const accept = useStore(s => s.acceptFriendRequest);
  const decline = useStore(s => s.declineFriendRequest);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: (id: string) => Promise<void>) {
    setBusyId(id);
    try { await fn(id); } finally { setBusyId(null); }
  }

  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Inbox className="size-5 text-theme" />Anfragen</h3>

      {incoming.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Eingehend</div>
          <ul className="space-y-2">
            {incoming.map(r => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--surface-rgb))] p-2.5">
                <Avatar name={r.displayName} avatarUrl={r.avatarUrl} className="size-9" textClassName="text-xs" />
                <div className="flex-1 min-w-0 text-sm font-semibold text-ink-800 truncate">{r.displayName}</div>
                <button onClick={() => run(r.id, accept)} disabled={busyId === r.id} className="btn-primary !px-2.5 !py-1.5 text-xs" title="Annehmen">
                  {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                </button>
                <button onClick={() => run(r.id, decline)} disabled={busyId === r.id} className="btn-soft text-rose-600 !px-2.5 !py-1.5 text-xs" title="Ablehnen">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Ausgehend (wartet auf Antwort)</div>
          <ul className="space-y-2">
            {outgoing.map(r => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--surface-rgb))] p-2.5">
                <Avatar name={r.displayName} avatarUrl={r.avatarUrl} className="size-9" textClassName="text-xs" />
                <div className="flex-1 min-w-0 text-sm font-semibold text-ink-800 truncate">{r.displayName}</div>
                <span className="inline-flex items-center gap-1 text-xs text-ink-500"><Send className="size-3.5" />gesendet</span>
                <button onClick={() => run(r.id, decline)} disabled={busyId === r.id} className="text-ink-400 hover:text-rose-600 transition" title="Zurückziehen">
                  {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ─── Freundesliste ─────────────────────────────────────────────────────────────

function FriendsListCard() {
  const friends = useStore(s => s.friends);
  const friendsLoading = useStore(s => s.friendsLoading);

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Users className="size-5 text-theme" />Meine Freunde {friends.length > 0 && <span className="chip">{friends.length}</span>}</h3>
      {friends.length === 0 ? (
        <div className="text-center py-6 text-sm text-ink-500">
          {friendsLoading ? 'Lädt …' : 'Noch keine Freunde. Gib oben den Code eines Freundes ein.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {friends.map(f => <FriendRow key={f.friendshipId} friend={f} />)}
        </ul>
      )}
    </Card>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  const removeFriend = useStore(s => s.removeFriend);
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doRemove() {
    setBusy(true);
    try { await removeFriend(friend.friendshipId, friend.userId); }
    finally { setBusy(false); }
  }

  return (
    <li className="rounded-2xl bg-[rgb(var(--surface-rgb))] p-2.5">
      <div className="flex items-center gap-3">
        <Avatar name={friend.displayName} avatarUrl={friend.avatarUrl} className="size-10" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-800 truncate">{friend.displayName}</div>
          <div className="text-xs text-ink-400 font-mono">{friend.friendCode}</div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="btn-ghost !px-2.5 !py-1.5 text-xs" title="Teilen-Optionen">
          <Share2 className="size-4" />
        </button>
        {confirmRemove ? (
          <div className="flex items-center gap-1">
            <button onClick={doRemove} disabled={busy} className="btn-soft text-rose-600 !px-2 !py-1.5 text-xs">{busy ? <Loader2 className="size-4 animate-spin" /> : 'Entfernen'}</button>
            <button onClick={() => setConfirmRemove(false)} className="btn-ghost !px-2 !py-1.5 text-xs">Nein</button>
          </div>
        ) : (
          <button onClick={() => setConfirmRemove(true)} className="text-ink-400 hover:text-rose-600 transition" title="Freund entfernen">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[rgb(var(--surface-border-rgb))] space-y-3">
          <FriendScheduleAction friend={friend} />
          <FriendHomeworkFilter friend={friend} />
        </div>
      )}
    </li>
  );
}

// ─── Freund: Stundenplan ansehen/übernehmen ────────────────────────────────────

function FriendScheduleAction({ friend }: { friend: Friend }) {
  const getFriendSchedule = useStore(s => s.getFriendSchedule);
  const importSharedSchedule = useStore(s => s.importSharedSchedule);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'none' | 'importing' | 'done'>('idle');
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setState('loading');
    const p = await getFriendSchedule(friend.userId);
    if (!p || p.subjects.length === 0) { setState('none'); return; }
    setPayload(p);
    setState('loaded');
  }

  async function doImport(mode: 'append' | 'replace') {
    if (!payload) return;
    setState('importing');
    try {
      const r = await importSharedSchedule(payload, mode);
      setResult(`${r.subjectsAdded} Fächer neu, ${r.lessonsAdded} Stunden übernommen.`);
      setState('done');
    } catch {
      setResult('Import fehlgeschlagen.');
      setState('done');
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold text-ink-600 mb-1.5 flex items-center gap-1.5"><CalendarDays className="size-3.5" />Stundenplan</div>
      {state === 'idle' && (
        <button onClick={load} className="btn-soft text-xs">Stundenplan von {friend.displayName} laden</button>
      )}
      {state === 'loading' && <div className="text-xs text-ink-500 flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />Lädt …</div>}
      {state === 'none' && <div className="text-xs text-ink-500">{friend.displayName} teilt aktuell keinen Stundenplan.</div>}
      {state === 'loaded' && payload && (
        <div className="rounded-xl bg-[rgb(var(--surface-strong-rgb))] border border-[rgb(var(--surface-border-rgb))] p-2.5">
          <div className="text-xs text-ink-600 mb-2">{payload.subjects.length} Fächer · {payload.lessons.length} Stunden{payload.schoolYearName ? ` · ${payload.schoolYearName}` : ''}</div>
          <div className="flex gap-2">
            <button onClick={() => doImport('append')} className="btn-primary !py-1.5 text-xs flex-1">Ergänzen</button>
            <button onClick={() => doImport('replace')} className="btn-soft !py-1.5 text-xs flex-1">Ersetzen</button>
          </div>
        </div>
      )}
      {state === 'importing' && <div className="text-xs text-ink-500 flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />Übernehme …</div>}
      {state === 'done' && <div className="text-xs text-emerald-600 flex items-center gap-1.5"><Check className="size-3.5" />{result}</div>}
    </div>
  );
}

// ─── Freund: Hausaufgaben-Fächerfilter ──────────────────────────────────────────

function FriendHomeworkFilter({ friend }: { friend: Friend }) {
  const subjects = useStore(s => s.subjects);
  const filters = useStore(s => s.settings?.friendSubjectFilters);
  const setFriendSubjectFilter = useStore(s => s.setFriendSubjectFilter);

  const filter = filters?.[friend.userId] ?? null; // null = alle
  const allSelected = filter == null;

  function toggleAll() {
    setFriendSubjectFilter(friend.userId, allSelected ? [] : null);
  }
  function toggleSubject(name: string) {
    if (filter == null) {
      // von „alle" zu „alle außer diesem"
      setFriendSubjectFilter(friend.userId, subjects.map(s => s.name).filter(n => n !== name));
      return;
    }
    if (filter.includes(name)) {
      setFriendSubjectFilter(friend.userId, filter.filter(n => n !== name));
    } else {
      const next = [...filter, name];
      setFriendSubjectFilter(friend.userId, next.length === subjects.length ? null : next);
    }
  }

  if (subjects.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-ink-600 mb-1.5 flex items-center gap-1.5"><Share2 className="size-3.5" />Hausaufgaben aus diesen Fächern empfangen</div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={toggleAll} className={`chip text-xs ${allSelected ? 'chip-active' : ''}`}>Alle</button>
        {subjects.map(s => {
          const active = allSelected || (filter?.includes(s.name) ?? false);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSubject(s.name)}
              className={`chip text-xs ${active ? 'chip-active' : ''}`}
              style={active ? { background: s.color + '22', borderColor: s.color + '88', color: s.color } : {}}
            >
              <span className="size-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>
      {filter !== null && filter.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="size-3 shrink-0" />Kein Fach – du empfängst keine Hausaufgaben von {friend.displayName}.</p>
      )}
    </div>
  );
}

// ─── Teilen-Einstellungen ──────────────────────────────────────────────────────

function SharingCard() {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const setShareScheduleWithFriends = useStore(s => s.setShareScheduleWithFriends);
  if (!settings) return null;

  return (
    <Card>
      <h3 className="h3 mb-1 flex items-center gap-2"><Share2 className="size-5 text-theme" />Was du teilst</h3>
      <p className="subtle mb-2">Gilt automatisch für alle deine Freunde.</p>
      <Row label="Hausaufgaben standardmäßig teilen" hint="Neue Hausaufgaben werden direkt mit Freunden geteilt.">
        <Toggle checked={settings.homeworkShareByDefault} onChange={v => setSettings({ homeworkShareByDefault: v })} />
      </Row>
      <Row label="Über Apple Shortcut geteilte teilen" hint="Per Shortcut erstellte Hausaufgaben automatisch teilen.">
        <div className="flex items-center gap-1.5"><Zap className="size-4 text-ink-400" /><Toggle checked={settings.homeworkShareViaShortcut} onChange={v => setSettings({ homeworkShareViaShortcut: v })} /></div>
      </Row>
      <Row label="Stundenplan mit Freunden teilen" hint="Freunde können deinen aktuellen Stundenplan ansehen & übernehmen.">
        <div className="flex items-center gap-1.5"><Clock className="size-4 text-ink-400" /><Toggle checked={settings.shareScheduleWithFriends} onChange={v => setShareScheduleWithFriends(v)} /></div>
      </Row>
    </Card>
  );
}

// ─── Rangliste (eigener Wochenwert aus Fokus-Sessions) ──────────────────────────

function LeaderboardSlot() {
  const focusSessions = useStore(s => s.focusSessions);
  const weekStart = useMemo(() => startOfISOWeek(Date.now()), []);
  const weekTotalMs = useMemo(
    () => focusSessions.filter(f => f.startedAt >= weekStart).reduce((sum, f) => sum + f.focusedMs, 0),
    [focusSessions, weekStart],
  );
  return <StudyLeaderboard weekTotalMs={weekTotalMs} weekStart={weekStart} delay={0} />;
}
