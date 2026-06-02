import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, RefreshCw, Medal } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { StreakFlame } from '@/components/StreakFlame';
import { publishWeeklyStudy, fetchWeeklyLeaderboard, computeStreak } from '@/lib/studyShare';
import { flashcardActivity } from '@/lib/flashcards';
import { getOrCreateMyProfile } from '@/lib/homeworkShare';
import type { WeeklyStudyEntry } from '@/lib/studyShare';

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const MEDAL = ['#f59e0b', '#94a3b8', '#b45309'];

interface Props {
  weekTotalMs: number;
  weekStart: number;
  delay?: number;
  /** Ohne eigene Card rendern – z. B. wenn schon in einer Widget-Hülle. */
  bare?: boolean;
}

/**
 * Wöchentliche Lern-Rangliste mit Freunden (inkl. Profilbildern).
 * Freunde kommen aus dem Freundes-Graph (`store.friends`).
 */
export function StudyLeaderboard({ weekTotalMs, weekStart, delay = 0.25, bare = false }: Props) {
  const authUser = useStore(s => s.authUser);
  const settings = useStore(s => s.settings);
  const friends = useStore(s => s.friends);
  const myProfile = useStore(s => s.myProfile);
  const focusSessions = useStore(s => s.focusSessions);
  const flashcards = useStore(s => s.flashcards);
  const [entries, setEntries] = useState<WeeklyStudyEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const myStreak = useMemo(
    () => computeStreak([...focusSessions, ...flashcardActivity(flashcards)]),
    [focusSessions, flashcards],
  );
  const friendIds = friends.map(f => f.userId).join(',');

  const refresh = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      let displayName = settings?.name?.trim() || 'Ich';
      let myAvatar = myProfile?.avatarUrl;
      try {
        const profile = await getOrCreateMyProfile(settings?.name);
        displayName = profile.displayName;
        myAvatar = profile.avatarUrl;
      } catch { /* Profil optional */ }
      await publishWeeklyStudy(weekStart, weekTotalMs, displayName, myStreak);

      const ids = Array.from(new Set([authUser.id, ...friends.map(f => f.userId)]));
      const rows = await fetchWeeklyLeaderboard(ids, weekStart);
      // Eigenen Eintrag sicherstellen (Upsert evtl. noch nicht sichtbar).
      const mine = rows.find(r => r.userId === authUser.id);
      if (!mine) {
        rows.push({ userId: authUser.id, displayName, weekStart, totalMs: weekTotalMs, avatarUrl: myAvatar, streak: myStreak });
      } else {
        mine.totalMs = Math.max(mine.totalMs, weekTotalMs);
        mine.streak = myStreak;
        if (!mine.avatarUrl) mine.avatarUrl = myAvatar;
      }
      rows.sort((a, b) => b.totalMs - a.totalMs);
      setEntries(rows);
    } catch (e) {
      console.warn('Leaderboard refresh failed:', e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, settings?.name, friendIds, weekStart, weekTotalMs, myStreak]);

  useEffect(() => { void refresh(); }, [refresh]);

  const inner = (
    <>
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="h3 flex items-center gap-2"><Trophy className="size-5" style={{ color: '#f59e0b' }} />Rangliste der Woche</h3>
        {authUser && (
          <button onClick={() => void refresh()} disabled={loading} className="text-ink-400 hover:text-ink-700 transition disabled:opacity-50" title="Aktualisieren">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
      {!authUser ? (
        <div className="text-center py-5">
          <Users className="size-8 mx-auto text-ink-300 mb-2" />
          <p className="text-sm text-ink-500">Melde dich an und füge Freunde hinzu, um euch zu vergleichen.</p>
          <Link to="/freunde" className="btn-soft mt-3 inline-flex text-sm">Zu den Freunden</Link>
        </div>
      ) : friends.length === 0 ? (
        <div className="text-center py-5">
          <Users className="size-8 mx-auto text-ink-300 mb-2" />
          <p className="text-sm text-ink-500">Du hast noch keine Freunde. Mit Freundescodes seht ihr, wer am meisten lernt.</p>
          <Link to="/freunde" className="btn-soft mt-3 inline-flex text-sm">Freunde hinzufügen</Link>
        </div>
      ) : entries && entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((e, i) => {
            const isMe = e.userId === authUser.id;
            return (
              <li key={e.userId}
                className={`flex items-center gap-3 rounded-2xl p-2.5 transition ${isMe ? 'theme-gradient-soft border border-[rgb(var(--theme-primary-rgb)/0.3)]' : 'bg-[rgb(var(--surface-rgb))]'}`}>
                <div className="w-6 flex-shrink-0 grid place-items-center">
                  {i < 3 ? <Medal className="size-5" style={{ color: MEDAL[i] }} /> : <span className="text-sm font-bold text-ink-400">{i + 1}</span>}
                </div>
                <Avatar name={e.displayName} avatarUrl={e.avatarUrl} className="size-8" textClassName="text-xs" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-800 truncate text-sm">
                    {e.displayName}{isMe && <span className="text-ink-500 font-normal"> (du)</span>}
                  </div>
                  {(e.streak ?? 0) > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-orange-500 leading-tight">
                      <StreakFlame size={13} active /> {e.streak} {e.streak === 1 ? 'Tag' : 'Tage'}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--theme-primary)' }}>{fmtDuration(e.totalMs)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-500 py-5 text-center">{loading ? 'Lädt …' : 'Noch keine Lernzeiten diese Woche – sei die/der Erste!'}</p>
      )}
      </div>
    </>
  );

  if (bare) {
    return <div className="h-full flex flex-col widget-pad">{inner}</div>;
  }
  return <Card delay={delay}>{inner}</Card>;
}
