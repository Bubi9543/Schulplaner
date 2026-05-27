import { db } from './db';
import type { RegionCode, SchoolHoliday } from '@/types';

/**
 * Schulferien-Integration via openholidaysapi.org (kostenlos, kein API-Key).
 *
 *   GET https://openholidaysapi.org/SchoolHolidays
 *     ?countryIsoCode=DE
 *     &subdivisionCode=DE-BY
 *     &languageIsoCode=DE
 *     &validFrom=2025-08-01
 *     &validTo=2026-07-31
 *
 * Response: Array<{ id, startDate, endDate, name: [{language, text}], … }>
 *
 * Wir cachen pro `cacheKey = SUBDIVISION:YEAR` in Dexie und refetchen nur,
 * wenn der Cache älter als 30 Tage ist oder das Jahr noch nie geladen wurde.
 *
 * Sind keine eigenen Server-Calls nötig – die API ist CORS-aktiv und alle
 * Daten kommen direkt vom Browser.
 */

const API_BASE = 'https://openholidaysapi.org/SchoolHolidays';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage
const LAST_REFRESH_KEY = 'holidays.lastRefresh';

interface RawHoliday {
  id: string;
  startDate: string;
  endDate: string;
  name?: Array<{ language: string; text: string }>;
}

function cacheKeyFor(region: RegionCode, year: number): string {
  return `${region.subdivision ?? region.country}:${year}`;
}

function pickName(raw: RawHoliday, prefLang = 'DE'): string {
  if (!raw.name?.length) return 'Ferien';
  const exact = raw.name.find(n => n.language.toUpperCase() === prefLang.toUpperCase());
  return (exact ?? raw.name[0]).text;
}

/** Lädt + cached Ferien für ein Jahr und gibt sie zurück. */
export async function fetchHolidaysForYear(region: RegionCode, year: number): Promise<SchoolHoliday[]> {
  const key = cacheKeyFor(region, year);
  const cached = await db.holidays.where('cacheKey').equals(key).toArray();

  // Frische Daten? Dann reichen die.
  const lastFresh = parseInt(localStorage.getItem(`${LAST_REFRESH_KEY}.${key}`) ?? '0', 10);
  if (cached.length > 0 && Date.now() - lastFresh < CACHE_TTL_MS) {
    return cached.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  const validFrom = `${year}-01-01`;
  const validTo = `${year}-12-31`;
  const params = new URLSearchParams({
    countryIsoCode: region.country,
    validFrom,
    validTo,
    languageIsoCode: 'DE',
  });
  if (region.subdivision) params.set('subdivisionCode', region.subdivision);

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (!res.ok) {
      // Im Fehlerfall lieber den (vielleicht alten) Cache zurückgeben als gar nichts.
      return cached.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }
    const raw = (await res.json()) as RawHoliday[];
    const mapped: SchoolHoliday[] = raw
      .filter(h => h.id && h.startDate && h.endDate)
      .map(h => ({
        id: `${key}-${h.id}`,
        startDate: h.startDate,
        endDate: h.endDate,
        name: pickName(h),
        cacheKey: key,
      }));

    // Cache pro Key komplett ersetzen, damit alte Einträge nicht hängen bleiben.
    await db.transaction('rw', db.holidays, async () => {
      const old = await db.holidays.where('cacheKey').equals(key).primaryKeys();
      if (old.length) await db.holidays.bulkDelete(old);
      if (mapped.length) await db.holidays.bulkAdd(mapped);
    });
    localStorage.setItem(`${LAST_REFRESH_KEY}.${key}`, String(Date.now()));
    return mapped.sort((a, b) => a.startDate.localeCompare(b.startDate));
  } catch {
    return cached.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
}

/**
 * Lädt Ferien für die nächsten ~13 Monate (aktuelles + nächstes Jahr).
 * Reicht für Stundenplan-Anzeige und Push-Skip.
 */
export async function fetchUpcomingHolidays(region: RegionCode, now = new Date()): Promise<SchoolHoliday[]> {
  const y = now.getFullYear();
  const [a, b] = await Promise.all([
    fetchHolidaysForYear(region, y),
    fetchHolidaysForYear(region, y + 1),
  ]);
  return [...a, ...b].sort((x, y2) => x.startDate.localeCompare(y2.startDate));
}

/** YYYY-MM-DD eines Date-Objekts in lokaler Zeit. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Findet die nächsten/aktuellen Ferien (anstehend oder gerade aktiv). */
export function getNextHoliday(holidays: SchoolHoliday[], now = new Date()): SchoolHoliday | null {
  const today = isoLocal(now);
  // Aktuell laufend?
  const active = holidays.find(h => h.startDate <= today && today <= h.endDate);
  if (active) return active;
  // Sonst die nächste anstehende
  return holidays.find(h => h.startDate > today) ?? null;
}

/** True wenn das Datum in einer Ferienzeit liegt. */
export function isHoliday(date: Date, holidays: SchoolHoliday[]): boolean {
  const day = isoLocal(date);
  return holidays.some(h => h.startDate <= day && day <= h.endDate);
}

// ─── Bundesland/Region-Listen für die UI ──────────────────────────────────

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
];

/** ISO-3166-2 Subdivisions, die openholidaysapi für DE akzeptiert. */
export const SUBDIVISIONS_DE: Array<{ code: string; name: string }> = [
  { code: 'DE-BW', name: 'Baden-Württemberg' },
  { code: 'DE-BY', name: 'Bayern' },
  { code: 'DE-BE', name: 'Berlin' },
  { code: 'DE-BB', name: 'Brandenburg' },
  { code: 'DE-HB', name: 'Bremen' },
  { code: 'DE-HH', name: 'Hamburg' },
  { code: 'DE-HE', name: 'Hessen' },
  { code: 'DE-MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'DE-NI', name: 'Niedersachsen' },
  { code: 'DE-NW', name: 'Nordrhein-Westfalen' },
  { code: 'DE-RP', name: 'Rheinland-Pfalz' },
  { code: 'DE-SL', name: 'Saarland' },
  { code: 'DE-SN', name: 'Sachsen' },
  { code: 'DE-ST', name: 'Sachsen-Anhalt' },
  { code: 'DE-SH', name: 'Schleswig-Holstein' },
  { code: 'DE-TH', name: 'Thüringen' },
];

export const SUBDIVISIONS_AT: Array<{ code: string; name: string }> = [
  { code: 'AT-1', name: 'Burgenland' },
  { code: 'AT-2', name: 'Kärnten' },
  { code: 'AT-3', name: 'Niederösterreich' },
  { code: 'AT-4', name: 'Oberösterreich' },
  { code: 'AT-5', name: 'Salzburg' },
  { code: 'AT-6', name: 'Steiermark' },
  { code: 'AT-7', name: 'Tirol' },
  { code: 'AT-8', name: 'Vorarlberg' },
  { code: 'AT-9', name: 'Wien' },
];

export function subdivisionsForCountry(country: string): Array<{ code: string; name: string }> {
  switch (country) {
    case 'DE': return SUBDIVISIONS_DE;
    case 'AT': return SUBDIVISIONS_AT;
    default: return [];
  }
}
