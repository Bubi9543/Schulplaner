import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { FocusSession } from '@/types';
import { formatDuration } from '@/lib/focusTimer';
import { goalProgress, goalDayBars, toDateInput, endOfDay } from '@/lib/focusGoals';

/**
 * Wiederverwendbarer Editor-Körper für ein Fokus-Ziel (Zielzeit, Frist, Stats,
 * Fortschritt, Tagesbalken). Wird auf der Fach-Seite und der Fokus-Seite genutzt.
 * Das `match`-Filter bestimmt, welche Sessions zählen (Fach- vs. Test-Ziel).
 */
export function FocusGoalEditor({
  sessions, match, start, goalMinutes, deadline,
  onSetMinutes, onSetDeadline, onClear, compact,
}: {
  sessions: FocusSession[];
  match: (f: FocusSession) => boolean;
  start: number;
  goalMinutes: number;
  deadline: number;
  onSetMinutes: (min: number) => void;
  onSetDeadline: (ms: number) => void;
  onClear: () => void;
  /** Kompakter Abstand (z. B. innerhalb einer aufgeklappten Listenzeile). */
  compact?: boolean;
}) {
  const now = Date.now();
  const prog = useMemo(() => goalProgress(sessions, match, start, goalMinutes, deadline, now), [sessions, match, start, goalMinutes, deadline, now]);
  const dayBars = useMemo(() => goalDayBars(sessions, match, now), [sessions, match, now]);
  const stepGoal = (delta: number) => onSetMinutes(Math.max(30, Math.min(6000, goalMinutes + delta)));

  return (
    <div className={compact ? 'space-y-3' : ''}>
      <div className="flex gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-[130px]">
          <div className="text-[11px] font-semibold text-ink-500 mb-1.5">Zielzeit</div>
          <div className="flex items-center gap-2">
            <button onClick={() => stepGoal(-30)} className="size-8 rounded-xl border border-ink-200 bg-white text-ink-600 text-lg font-bold grid place-items-center hover:bg-ink-50 transition">−</button>
            <div className="flex-1 text-center font-display font-extrabold text-lg text-ink-900">{formatDuration(prog.goalMs)}</div>
            <button onClick={() => stepGoal(30)} className="size-8 rounded-xl border border-ink-200 bg-white text-ink-600 text-lg font-bold grid place-items-center hover:bg-ink-50 transition">+</button>
          </div>
        </div>
        <div className="flex-1 min-w-[150px]">
          <div className="text-[11px] font-semibold text-ink-500 mb-1.5">Frist</div>
          <input
            type="date"
            value={toDateInput(deadline)}
            min={toDateInput(now)}
            onChange={e => { if (e.target.value) onSetDeadline(endOfDay(e.target.value)); }}
            className="input text-sm w-full"
          />
        </div>
      </div>

      <div className="flex gap-2.5 mb-4">
        <div className="flex-1 rounded-2xl p-3 bg-orange-50 text-center">
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-orange-700">Noch zu lernen</div>
          <div className="font-display font-extrabold text-xl text-orange-500 mt-0.5">{formatDuration(prog.remMs)}</div>
        </div>
        <div className="flex-1 rounded-2xl p-3 bg-ink-50 text-center">
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-ink-500">Pro Tag</div>
          <div className="font-display font-extrabold text-xl text-ink-900 mt-0.5">{prog.overdue ? '–' : formatDuration(prog.perDayMs)}</div>
        </div>
        <div className="flex-1 rounded-2xl p-3 bg-ink-50 text-center">
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-ink-500">Verbleibend</div>
          <div className="font-display font-extrabold text-xl text-ink-900 mt-0.5">{prog.overdue ? 'abgelaufen' : `${prog.daysLeft} ${prog.daysLeft === 1 ? 'Tag' : 'Tage'}`}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11.5px] text-ink-500 mb-1.5">
        <span>Bereits gelernt: <strong className="text-orange-500">{formatDuration(prog.doneMs)}</strong></span>
        <span>Ziel {formatDuration(prog.goalMs)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden mb-4">
        <div className="h-full rounded-full" style={{ width: `${prog.barPct}%`, background: 'linear-gradient(90deg,#fb923c,#f97316)' }} />
      </div>

      <div className="flex items-end gap-2 h-16">
        {dayBars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
            <span className="text-[10px] text-ink-400">{b.min > 0 ? `${b.min}m` : ''}</span>
            <div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, b.heightPct * 0.4)}px`, background: b.min > 0 ? 'linear-gradient(180deg,#fb923c,#f97316)' : 'rgb(var(--ink-200))' }} />
            <span className="text-[10.5px] font-semibold text-ink-500">{b.label}</span>
          </div>
        ))}
      </div>

      <button onClick={onClear} className="mt-3 text-[11px] font-semibold text-ink-400 hover:text-rose-500 transition inline-flex items-center gap-1" title="Ziel entfernen">
        <Trash2 className="size-3" />Ziel entfernen
      </button>
    </div>
  );
}
