import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { fetchUpcomingHolidays, isHoliday } from './holidays';
import type { SchoolHoliday } from '@/types';

/**
 * In-Memory-Cache pro Region, damit nicht jede Komponente neu lädt.
 * fetchUpcomingHolidays cached selbst in Dexie – das hier spart nur den
 * zusätzlichen async-Roundtrip beim Re-Mount.
 */
let memo: { key: string; data: SchoolHoliday[] } | null = null;

function regionKey(region: { country: string; subdivision?: string } | undefined): string {
  if (!region) return '';
  return `${region.country}:${region.subdivision ?? ''}`;
}

/** Lädt die anstehenden Schulferien der eingestellten Region (reaktiv). */
export function useUpcomingHolidays(): SchoolHoliday[] {
  const region = useStore(s => s.settings?.region);
  const key = regionKey(region);
  const [holidays, setHolidays] = useState<SchoolHoliday[]>(() => (memo?.key === key ? memo.data : []));

  useEffect(() => {
    if (!region) { setHolidays([]); return; }
    if (memo?.key === key) { setHolidays(memo.data); return; }
    let cancelled = false;
    fetchUpcomingHolidays(region)
      .then(h => { memo = { key, data: h }; if (!cancelled) setHolidays(h); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return holidays;
}

/** True, wenn das übergebene Datum (Default heute) in den Ferien liegt. */
export function useIsHoliday(date: Date = new Date()): boolean {
  const holidays = useUpcomingHolidays();
  return holidays.length > 0 && isHoliday(date, holidays);
}
