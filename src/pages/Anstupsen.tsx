import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, Loader2, Check, AlertTriangle, BellOff, Users } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Avatar } from '@/components/Avatar';
import { AccountAuth } from '@/components/AccountAuth';
import { useStore } from '@/store/useStore';
import { sendNudge } from '@/lib/nudge';
import { cn } from '@/lib/utils';
import type { Friend } from '@/lib/friends';

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent' }
  | { state: 'undelivered' }   // erreicht, aber Freund hat Push aus
  | { state: 'error'; msg: string };

export function AnstupsenPage() {
  const authUser = useStore(s => s.authUser);
  const friends = useStore(s => s.friends);
  const loadFriends = useStore(s => s.loadFriends);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => { if (authUser) void loadFriends(); }, [authUser, loadFriends]);

  function setFriendStatus(userId: string, s: Status) {
    setStatus(prev => ({ ...prev, [userId]: s }));
  }

  async function nudge(friend: Friend) {
    setFriendStatus(friend.userId, { state: 'sending' });
    try {
      const { delivered } = await sendNudge(friend.userId, message);
      setFriendStatus(friend.userId, { state: delivered > 0 ? 'sent' : 'undelivered' });
    } catch (e) {
      setFriendStatus(friend.userId, { state: 'error', msg: e instanceof Error ? e.message : 'Fehler' });
    }
    // Nach kurzer Zeit zurücksetzen, damit man erneut anstupsen kann.
    setTimeout(() => setFriendStatus(friend.userId, { state: 'idle' }), 2600);
  }

  return (
    <PageShell
      title={<span className="inline-flex items-center gap-2">Anstupsen <Hand className="size-7 text-theme -rotate-12" /></span>}
      subtitle="Dein heimlicher „Schau mal her!“-Knopf. Tippe einen Freund an – er bekommt sofort eine Benachrichtigung."
    >
      {!authUser ? (
        <div className="max-w-xl">
          <div className="mb-3 rounded-2xl theme-gradient-soft border border-theme/20 p-4 text-sm text-ink-700">
            Melde dich an, um deine Freunde anstupsen zu können.
          </div>
          <AccountAuth />
        </div>
      ) : (
        <div className="max-w-xl space-y-4">
          {/* Optionale Nachricht */}
          <div className="card">
            <label className="label" htmlFor="nudge-msg">Nachricht (optional)</label>
            <input
              id="nudge-msg"
              className="input"
              placeholder="z. B. „Dreh dich mal um 😄“"
              value={message}
              maxLength={160}
              onChange={e => setMessage(e.target.value)}
            />
            <p className="text-xs text-ink-400 mt-1.5">
              Wird mit dem Anstupser zusammen als Benachrichtigung angezeigt.
            </p>
          </div>

          {/* Freundesliste */}
          {friends.length === 0 ? (
            <div className="card text-center py-10">
              <div className="size-12 rounded-2xl theme-gradient-soft grid place-items-center mx-auto mb-3">
                <Users className="size-6 text-theme" />
              </div>
              <p className="font-semibold text-ink-800">Noch keine Freunde</p>
              <p className="subtle mt-1">
                Füge erst <Link to="/einstellungen?section=friends" className="text-theme-deep font-semibold hover:underline">Freunde</Link> hinzu, dann kannst du sie hier anstupsen.
              </p>
            </div>
          ) : (
            <div className="card !p-2 divide-y divide-white/40">
              {friends.map(friend => {
                const st = status[friend.userId] ?? { state: 'idle' };
                return (
                  <div key={friend.userId} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={friend.displayName} avatarUrl={friend.avatarUrl} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink-900 truncate">{friend.displayName}</div>
                      <StatusLine status={st} />
                    </div>
                    <NudgeButton status={st} onClick={() => nudge(friend)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.state === 'sent') return <div className="text-xs font-medium text-emerald-600">Angestupst! 👋</div>;
  if (status.state === 'undelivered') return <div className="text-xs font-medium text-amber-600">Hat Benachrichtigungen aus</div>;
  if (status.state === 'error') return <div className="text-xs font-medium text-red-500 truncate">{status.msg}</div>;
  return <div className="text-xs text-ink-400">Bereit zum Anstupsen</div>;
}

function NudgeButton({ status, onClick }: { status: Status; onClick: () => void }) {
  const sending = status.state === 'sending';
  const sent = status.state === 'sent';
  const warn = status.state === 'undelivered';
  const error = status.state === 'error';

  return (
    <button
      onClick={onClick}
      disabled={sending}
      className={cn(
        'relative h-10 px-4 rounded-2xl font-semibold text-sm flex items-center gap-2 transition active:scale-95 overflow-hidden',
        sent && 'bg-emerald-500 text-white',
        warn && 'bg-amber-500 text-white',
        error && 'bg-red-500 text-white',
        !sent && !warn && !error && 'theme-gradient text-white shadow-glow',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {sending ? (
          <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> …
          </motion.span>
        ) : sent ? (
          <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Check className="size-4" /> Gesendet
          </motion.span>
        ) : warn ? (
          <motion.span key="w" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <BellOff className="size-4" /> Offline
          </motion.span>
        ) : error ? (
          <motion.span key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> Fehler
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
            <Hand className="size-4" /> Antippen
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
