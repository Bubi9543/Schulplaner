import { useCallback, useEffect, useState } from 'react';
import { Hand, Send, Loader2, Check, BellOff, AlertTriangle, Users } from 'lucide-react';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { StreakFlame } from '@/components/StreakFlame';
import { useStore } from '@/store/useStore';
import { fetchWeeklyLeaderboard, startOfISOWeek } from '@/lib/studyShare';
import { sendNudge, fetchNudgeableFriendIds } from '@/lib/nudge';
import { cn } from '@/lib/utils';
import type { Friend } from '@/lib/friends';

type NudgeState = 'idle' | 'sending' | 'sent' | 'undelivered' | 'error';

/**
 * Freundesliste unter der Rangliste: Profilbild, Name und Streak (falls
 * vorhanden). Der Anstupsen-Button erscheint nur bei Freunden, die auf
 * mindestens einem Gerät push-bereit sind (siehe NUDGE_STATUS_SETUP.md).
 *
 * Klick auf die Hand klappt unter dem Namen eine Nachrichten-Zeile auf und die
 * Hand wird zum Papierflieger; Klick auf den Flieger sendet den Anstupser mit
 * der Nachricht und schließt die Zeile wieder.
 */
export function FriendsList() {
  const authUser = useStore(s => s.authUser);
  const friends = useStore(s => s.friends);
  // friends ist im Store bereits alphabetisch sortiert (loadFriendGraph).
  const friendIds = friends.map(f => f.userId).join(',');

  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [nudgeable, setNudgeable] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, NudgeState>>({});
  // Welcher Freund hat gerade die Nachrichten-Zeile offen, und sein Entwurf.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    if (!authUser || friends.length === 0) { setStreaks({}); setNudgeable(new Set()); return; }
    const ids = friends.map(f => f.userId);
    const weekStart = startOfISOWeek(Date.now());
    const [rows, ready] = await Promise.all([
      fetchWeeklyLeaderboard(ids, weekStart).catch(() => []),
      fetchNudgeableFriendIds().catch(() => new Set<string>()),
    ]);
    const map: Record<string, number> = {};
    for (const r of rows) map[r.userId] = r.streak ?? 0;
    setStreaks(map);
    setNudgeable(ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, friendIds]);

  useEffect(() => { void load(); }, [load]);

  function openCompose(f: Friend) {
    setOpenId(f.userId);
    setDraft('');
    setStatus(p => ({ ...p, [f.userId]: 'idle' }));
  }

  async function send(f: Friend) {
    const message = draft;
    setOpenId(null);
    setDraft('');
    setStatus(p => ({ ...p, [f.userId]: 'sending' }));
    try {
      const { delivered } = await sendNudge(f.userId, message);
      setStatus(p => ({ ...p, [f.userId]: delivered > 0 ? 'sent' : 'undelivered' }));
    } catch {
      setStatus(p => ({ ...p, [f.userId]: 'error' }));
    }
    // Nach kurzer Zeit zurücksetzen, damit man erneut anstupsen kann.
    setTimeout(() => setStatus(p => ({ ...p, [f.userId]: 'idle' })), 2400);
  }

  if (!authUser || friends.length === 0) return null;

  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2">
        <Users className="size-5 text-theme" />Freunde
        <span className="chip">{friends.length}</span>
      </h3>
      <ul className="space-y-1.5">
        {friends.map(f => {
          const streak = streaks[f.userId] ?? 0;
          const canNudge = nudgeable.has(f.userId);
          const st = status[f.userId] ?? 'idle';
          const open = openId === f.userId;
          return (
            <li key={f.userId} className="rounded-2xl p-2 bg-[rgb(var(--surface-rgb))]">
              <div className="flex items-center gap-3">
                <Avatar name={f.displayName} avatarUrl={f.avatarUrl} className="size-9" textClassName="text-xs" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-800 truncate text-sm">{f.displayName}</div>
                  {streak > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-orange-500 leading-tight">
                      <StreakFlame size={13} active /> {streak} {streak === 1 ? 'Tag' : 'Tage'}
                    </div>
                  )}
                </div>
                {canNudge && (
                  <NudgeButton
                    state={st}
                    open={open}
                    onClick={() => (open ? void send(f) : openCompose(f))}
                  />
                )}
              </div>

              {open && (
                <div className="mt-2 flex items-center gap-1.5 rounded-full bg-ink-100 pl-3 pr-1 py-1">
                  <input
                    autoFocus
                    value={draft}
                    maxLength={160}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void send(f); if (e.key === 'Escape') { setOpenId(null); setDraft(''); } }}
                    placeholder="Nachricht (optional) …"
                    className="flex-1 bg-transparent text-[13px] outline-none text-ink-800 placeholder:text-ink-400"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NudgeButton({ state, open, onClick }: { state: NudgeState; open: boolean; onClick: () => void }) {
  const sending = state === 'sending';
  return (
    <button
      onClick={onClick}
      disabled={sending}
      title={
        sending ? 'Wird gesendet …'
          : state === 'sent' ? 'Angestupst!'
          : state === 'undelivered' ? 'Gerade nicht erreichbar'
          : state === 'error' ? 'Fehler – nochmal versuchen'
          : open ? 'Anstupser senden'
          : 'Anstupsen'
      }
      className={cn(
        'size-9 grid place-items-center rounded-full text-white flex-shrink-0 transition active:scale-90 disabled:opacity-70',
        state === 'sent' && 'bg-emerald-500',
        state === 'undelivered' && 'bg-amber-500',
        state === 'error' && 'bg-red-500',
        (state === 'idle' || sending) && 'theme-gradient shadow-glow',
      )}
    >
      {sending ? <Loader2 className="size-4 animate-spin" />
        : state === 'sent' ? <Check className="size-4" />
        : state === 'undelivered' ? <BellOff className="size-4" />
        : state === 'error' ? <AlertTriangle className="size-4" />
        : open ? <Send className="size-4" />
        : <Hand className="size-4" />}
    </button>
  );
}
