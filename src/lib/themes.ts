export type ThemeId = 'indigo' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'crimson' | 'sunshine' | 'mono' | 'rainbow';

export interface ThemePalette {
  id: ThemeId;
  name: string;
  description: string;
  primary: string;
  primaryRgb: string;
  primarySoft: string;
  primarySoftRgb: string;
  primaryDeep: string;
  primaryDeepRgb: string;
  secondary: string;
  secondaryRgb: string;
  accent: string;
  accentRgb: string;
  bgStart: string;
  bgEnd: string;
  aurora1Rgb: string;
  aurora2Rgb: string;
  aurora3Rgb: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  ring: string;
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function palette(p: Omit<ThemePalette, 'primaryRgb' | 'primarySoftRgb' | 'primaryDeepRgb' | 'secondaryRgb' | 'accentRgb' | 'aurora1Rgb' | 'aurora2Rgb' | 'aurora3Rgb'> & {
  aurora1: string; aurora2: string; aurora3: string;
}): ThemePalette {
  return {
    ...p,
    primaryRgb: hexToRgb(p.primary),
    primarySoftRgb: hexToRgb(p.primarySoft),
    primaryDeepRgb: hexToRgb(p.primaryDeep),
    secondaryRgb: hexToRgb(p.secondary),
    accentRgb: hexToRgb(p.accent),
    aurora1Rgb: hexToRgb(p.aurora1),
    aurora2Rgb: hexToRgb(p.aurora2),
    aurora3Rgb: hexToRgb(p.aurora3),
  };
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  indigo: palette({
    id: 'indigo',
    name: 'Indigo',
    description: 'Klassisch, ruhig, klar',
    primary: '#6366f1',
    primarySoft: '#e0e7ff',
    primaryDeep: '#4338ca',
    secondary: '#818cf8',
    accent: '#4f46e5',
    bgStart: '#f6f7ff',
    bgEnd: '#eef0fb',
    aurora1: '#6366f1',
    aurora2: '#38bdf8',
    aurora3: '#a78bfa',
    gradientFrom: '#4f46e5',
    gradientVia: '#6366f1',
    gradientTo: '#818cf8',
    ring: '#c7d2fe',
  }),
  ocean: palette({
    id: 'ocean',
    name: 'Ozean',
    description: 'Frisch wie Meeresluft',
    primary: '#0ea5e9',
    primarySoft: '#e0f2fe',
    primaryDeep: '#0369a1',
    secondary: '#06b6d4',
    accent: '#0284c7',
    bgStart: '#f0f9ff',
    bgEnd: '#ecfeff',
    aurora1: '#0ea5e9',
    aurora2: '#06b6d4',
    aurora3: '#14b8a6',
    gradientFrom: '#0284c7',
    gradientVia: '#06b6d4',
    gradientTo: '#22d3ee',
    ring: '#bae6fd',
  }),
  sunset: palette({
    id: 'sunset',
    name: 'Sonnenuntergang',
    description: 'Warm, energiegeladen',
    primary: '#f97316',
    primarySoft: '#ffedd5',
    primaryDeep: '#c2410c',
    secondary: '#fb7185',
    accent: '#ea580c',
    bgStart: '#fff7ed',
    bgEnd: '#fef2f2',
    aurora1: '#fb923c',
    aurora2: '#fb7185',
    aurora3: '#fbbf24',
    gradientFrom: '#f59e0b',
    gradientVia: '#f97316',
    gradientTo: '#fb7185',
    ring: '#fed7aa',
  }),
  forest: palette({
    id: 'forest',
    name: 'Wald',
    description: 'Natürlich, beruhigend',
    primary: '#10b981',
    primarySoft: '#d1fae5',
    primaryDeep: '#047857',
    secondary: '#14b8a6',
    accent: '#059669',
    bgStart: '#f0fdf4',
    bgEnd: '#ecfdf5',
    aurora1: '#10b981',
    aurora2: '#14b8a6',
    aurora3: '#84cc16',
    gradientFrom: '#059669',
    gradientVia: '#10b981',
    gradientTo: '#22d3ee',
    ring: '#a7f3d0',
  }),
  rose: palette({
    id: 'rose',
    name: 'Rose',
    description: 'Warm, einladend, modern',
    primary: '#ec4899',
    primarySoft: '#fce7f3',
    primaryDeep: '#be185d',
    secondary: '#f43f5e',
    accent: '#db2777',
    bgStart: '#fdf2f8',
    bgEnd: '#fff1f2',
    aurora1: '#ec4899',
    aurora2: '#f43f5e',
    aurora3: '#fb7185',
    gradientFrom: '#db2777',
    gradientVia: '#ec4899',
    gradientTo: '#fb7185',
    ring: '#fbcfe8',
  }),
  crimson: palette({
    id: 'crimson',
    name: 'Crimson',
    description: 'Kraftvoll, mutig, intensiv',
    primary: '#ef4444',
    primarySoft: '#fee2e2',
    primaryDeep: '#b91c1c',
    secondary: '#f97316',
    accent: '#dc2626',
    bgStart: '#fef2f2',
    bgEnd: '#fff7ed',
    aurora1: '#ef4444',
    aurora2: '#f97316',
    aurora3: '#fb7185',
    gradientFrom: '#b91c1c',
    gradientVia: '#ef4444',
    gradientTo: '#f97316',
    ring: '#fecaca',
  }),
  sunshine: palette({
    id: 'sunshine',
    name: 'Sonnenschein',
    description: 'Hell, optimistisch, lebhaft',
    primary: '#eab308',
    primarySoft: '#fef9c3',
    primaryDeep: '#a16207',
    secondary: '#f59e0b',
    accent: '#ca8a04',
    bgStart: '#fefce8',
    bgEnd: '#fffbeb',
    aurora1: '#eab308',
    aurora2: '#f59e0b',
    aurora3: '#facc15',
    gradientFrom: '#ca8a04',
    gradientVia: '#eab308',
    gradientTo: '#facc15',
    ring: '#fde68a',
  }),
  mono: palette({
    id: 'mono',
    name: 'Mono',
    description: 'Minimal, zeitlos, fokussiert',
    primary: '#27272a',
    primarySoft: '#e4e4e7',
    primaryDeep: '#09090b',
    secondary: '#52525b',
    accent: '#18181b',
    bgStart: '#fafafa',
    bgEnd: '#f4f4f5',
    aurora1: '#71717a',
    aurora2: '#a1a1aa',
    aurora3: '#52525b',
    gradientFrom: '#09090b',
    gradientVia: '#27272a',
    gradientTo: '#52525b',
    ring: '#d4d4d8',
  }),
  rainbow: palette({
    id: 'rainbow',
    name: 'Bunt',
    description: 'Pro Seite eine eigene Farbe',
    primary: '#6366f1',
    primarySoft: '#e0e7ff',
    primaryDeep: '#4338ca',
    secondary: '#ec4899',
    accent: '#10b981',
    bgStart: '#f6f7ff',
    bgEnd: '#fdf2f8',
    aurora1: '#6366f1',
    aurora2: '#ec4899',
    aurora3: '#10b981',
    gradientFrom: '#6366f1',
    gradientVia: '#ec4899',
    gradientTo: '#10b981',
    ring: '#e0e7ff',
  }),
};

export const THEME_LIST: ThemePalette[] = Object.values(THEMES);

export const ROUTE_THEME_MAP: Record<string, ThemeId> = {
  '/': 'ocean',
  '/aufgaben': 'crimson',
  '/kalender': 'sunset',
  '/stundenplan': 'indigo',
  '/noten': 'forest',
  '/einstellungen': 'rose',
};

export function themeForRoute(pathname: string): ThemeId {
  if (ROUTE_THEME_MAP[pathname]) return ROUTE_THEME_MAP[pathname];
  for (const prefix of Object.keys(ROUTE_THEME_MAP)) {
    if (prefix !== '/' && pathname.startsWith(prefix)) return ROUTE_THEME_MAP[prefix];
  }
  return 'indigo';
}

const LEGACY_MAP: Record<string, ThemeId> = {
  indigo: 'indigo',
  violet: 'indigo',
  rose: 'rose',
  pink: 'rose',
  emerald: 'forest',
  green: 'forest',
  amber: 'sunset',
  orange: 'sunset',
  sky: 'ocean',
  blue: 'ocean',
};

export function resolveThemeId(input: string | undefined | null): ThemeId {
  if (!input) return 'indigo';
  if (input in THEMES) return input as ThemeId;
  return LEGACY_MAP[input] ?? 'indigo';
}

export function applyTheme(id: ThemeId, pathname?: string) {
  const effectiveId: ThemeId = id === 'rainbow'
    ? themeForRoute(pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/'))
    : id;
  const t = THEMES[effectiveId];
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', t.primary);
  root.style.setProperty('--theme-primary-rgb', t.primaryRgb);
  root.style.setProperty('--theme-primary-soft', t.primarySoft);
  root.style.setProperty('--theme-primary-soft-rgb', t.primarySoftRgb);
  root.style.setProperty('--theme-primary-deep', t.primaryDeep);
  root.style.setProperty('--theme-primary-deep-rgb', t.primaryDeepRgb);
  root.style.setProperty('--theme-secondary', t.secondary);
  root.style.setProperty('--theme-secondary-rgb', t.secondaryRgb);
  root.style.setProperty('--theme-accent', t.accent);
  root.style.setProperty('--theme-accent-rgb', t.accentRgb);
  root.style.setProperty('--theme-bg-start', t.bgStart);
  root.style.setProperty('--theme-bg-end', t.bgEnd);
  root.style.setProperty('--theme-aurora-1', t.aurora1Rgb);
  root.style.setProperty('--theme-aurora-2', t.aurora2Rgb);
  root.style.setProperty('--theme-aurora-3', t.aurora3Rgb);
  root.style.setProperty('--theme-gradient-from', t.gradientFrom);
  root.style.setProperty('--theme-gradient-via', t.gradientVia);
  root.style.setProperty('--theme-gradient-to', t.gradientTo);
  root.style.setProperty('--theme-ring', t.ring);
  root.dataset.theme = id;
  root.dataset.activeTheme = effectiveId;
}
