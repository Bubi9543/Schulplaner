import { useEffect, useState } from 'react';
import type { Lesson, Subject } from '@/types';

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function nowToMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function currentWeekday(date: Date = new Date()): number {
  return date.getDay();
}

export function useTimeNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface CurrentLessonInfo {
  lesson: Lesson;
  subject: Subject;
  progressPct: number;
  remainingMin: number;
  durationMin: number;
}

export function getCurrentLesson(lessons: Lesson[], subjects: Subject[], now: Date): CurrentLessonInfo | null {
  const wd = currentWeekday(now);
  const m = nowToMinutes(now);
  const todayLessons = lessons.filter(l => l.weekday === wd);
  for (const l of todayLessons) {
    const s = timeToMinutes(l.start);
    const e = timeToMinutes(l.end);
    if (m >= s && m < e) {
      const subj = subjects.find(x => x.id === l.subjectId);
      if (!subj) continue;
      const dur = e - s;
      const remaining = e - m;
      const progress = dur > 0 ? Math.max(0, Math.min(1, (m - s) / dur)) : 0;
      return { lesson: l, subject: subj, progressPct: progress * 100, remainingMin: remaining, durationMin: dur };
    }
  }
  return null;
}

export interface NextLessonInfo {
  lesson: Lesson;
  subject: Subject;
  startsInMin: number;
}

export function getNextLesson(lessons: Lesson[], subjects: Subject[], now: Date, withinMin?: number): NextLessonInfo | null {
  const wd = currentWeekday(now);
  const m = nowToMinutes(now);
  const todayLessons = lessons.filter(l => l.weekday === wd).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  for (const l of todayLessons) {
    const s = timeToMinutes(l.start);
    const delta = s - m;
    if (delta > 0 && (withinMin === undefined || delta <= withinMin)) {
      const subj = subjects.find(x => x.id === l.subjectId);
      if (!subj) continue;
      return { lesson: l, subject: subj, startsInMin: delta };
    }
  }
  return null;
}

export function getActiveSubject(lessons: Lesson[], subjects: Subject[], now: Date, thresholdMin: number): Subject | null {
  const current = getCurrentLesson(lessons, subjects, now);
  if (current) return current.subject;
  const next = getNextLesson(lessons, subjects, now, thresholdMin);
  if (next) return next.subject;
  return null;
}

export interface TimelineSlot {
  start: number;
  end: number;
  durationMin: number;
  lesson?: Lesson;
  subject?: Subject;
  kind: 'lesson' | 'break';
}

export function buildTodayTimeline(lessons: Lesson[], subjects: Subject[], now: Date): TimelineSlot[] {
  const wd = currentWeekday(now);
  const today = lessons
    .filter(l => l.weekday === wd)
    .map(l => ({ ...l, _s: timeToMinutes(l.start), _e: timeToMinutes(l.end) }))
    .sort((a, b) => a._s - b._s);

  const slots: TimelineSlot[] = [];
  for (let i = 0; i < today.length; i++) {
    const l = today[i];
    const subj = subjects.find(x => x.id === l.subjectId);
    slots.push({ start: l._s, end: l._e, durationMin: l._e - l._s, lesson: l, subject: subj, kind: 'lesson' });
    const next = today[i + 1];
    if (next && next._s > l._e) {
      slots.push({ start: l._e, end: next._s, durationMin: next._s - l._e, kind: 'break' });
    }
  }
  return slots;
}
