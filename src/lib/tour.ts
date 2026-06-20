/**
 * Persistenz für die Willkommens-Tour (einmal pro Gerät).
 * In eigener Datei, damit `WelcomeTour.tsx` nur die Komponente exportiert
 * (sonst meckert React Fast Refresh).
 */

const STORAGE_KEY = 'notenapp.tourDismissed';

export function shouldShowTour(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== '1';
}

export function dismissTour(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, '1');
}

/** Manuell wieder aktivieren (z. B. für „Tour erneut anzeigen"-Button irgendwann). */
export function resetTour(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
