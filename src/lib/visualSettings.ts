import type { AppSettings, ThemeMode } from '@/types';

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyVisualSettings(settings: AppSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const mode = resolveMode(settings.theme);
  root.dataset.mode = mode;
  root.style.colorScheme = mode;

  root.dataset.density = settings.density;
  root.dataset.glass = settings.glassEffects ? 'on' : 'off';
  root.dataset.anim = settings.animationLevel;

  root.style.setProperty('--font-scale', String(settings.fontScale));
}

let autoModeListener: ((e: MediaQueryListEvent) => void) | null = null;

export function bindAutoModeWatcher(getSettings: () => AppSettings | null) {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (autoModeListener) mq.removeEventListener('change', autoModeListener);
  autoModeListener = () => {
    const s = getSettings();
    if (s && s.theme === 'auto') applyVisualSettings(s);
  };
  mq.addEventListener('change', autoModeListener);
}
