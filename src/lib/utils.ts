import clsx from 'clsx';
import type { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function formatDate(ts: number, opts?: Intl.DateTimeFormatOptions) {
  return new Date(ts).toLocaleDateString('de-DE', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatShortDate(ts: number) {
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

export function daysUntil(ts: number): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const then = new Date(ts);
  then.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function relativeDate(ts: number): string {
  const d = daysUntil(ts);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Morgen';
  if (d === -1) return 'Gestern';
  if (d > 0 && d < 7) return `In ${d} Tagen`;
  if (d < 0 && d > -7) return `Vor ${-d} Tagen`;
  return formatDate(ts);
}

export function startOfWeek(d: Date, weekStart: 0 | 1 = 1): Date {
  const day = d.getDay();
  const diff = (day < weekStart ? 7 : 0) + day - weekStart;
  const r = new Date(d);
  r.setDate(d.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function isSameDay(a: number | Date, b: number | Date) {
  const da = typeof a === 'number' ? new Date(a) : a;
  const db = typeof b === 'number' ? new Date(b) : b;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function hexToRgba(hex: string, alpha = 1) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
