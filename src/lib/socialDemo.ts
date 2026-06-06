import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, Globe, Pencil, Zap, FlaskConical, Calculator,
} from 'lucide-react';

/**
 * Statische Inhalte für die Social-Seite: Fach-Farben/-Icons und das
 * Schnell-Emoji-Set. Die eigentlichen Feed-Daten kommen aus `lib/social.ts`
 * (Supabase).
 */

export interface SubjectStyle {
  color: string;
  icon: LucideIcon;
}

/** Fach → feste, semantische Farbe + Icon (themen-unabhängig, wie im Stundenplan). */
export const SUBJECTS: Record<string, SubjectStyle> = {
  Mathe:      { color: '#4f46e5', icon: Calculator },
  Biologie:   { color: '#16a34a', icon: BookOpen },
  Englisch:   { color: '#0ea5e9', icon: Globe },
  Geschichte: { color: '#d97706', icon: BookOpen },
  Deutsch:    { color: '#db2777', icon: Pencil },
  Chemie:     { color: '#7c3aed', icon: FlaskConical },
  Physik:     { color: '#0891b2', icon: Zap },
};

export const SUBJECT_NAMES = Object.keys(SUBJECTS);

export const QUICK_EMOJI = ['🔥', '💪', '👏', '📚', '👍', '😍', '🌱', '🤯'];

/** Minuten → „1 h 25 min“. */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** „vor 3 Min“, „vor 2 Std“, „gestern“, „vor 4 Tagen“ … aus einem ms-Timestamp. */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'gerade eben';
  const min = Math.round(s / 60);
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.round(h / 24);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  const w = Math.round(d / 7);
  return w === 1 ? 'vor 1 Woche' : `vor ${w} Wochen`;
}
