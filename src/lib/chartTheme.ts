import type { CSSProperties } from 'react';

/**
 * Theme-aware Styles für Recharts-Tooltips.
 *
 * Recharts rendert das Tooltip-Kästchen mit Inline-Styles (Default: weißer
 * Hintergrund, dunkler Text). Im Dark Mode war das Kästchen dadurch entweder
 * unsichtbar oder der Text nicht lesbar. Wir setzen Hintergrund, Rahmen und
 * Textfarben explizit über unsere CSS-Variablen – die lösen sich pro Element
 * auf und passen sich so automatisch an Light/Dark an.
 */
export const chartTooltipContentStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgb(var(--surface-border-rgb))',
  background: 'rgb(var(--surface-strong-rgb))',
  boxShadow: '0 10px 30px -10px rgba(0,0,0,.35)',
  color: 'rgb(var(--ink-800))',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'rgb(var(--ink-600))',
  fontWeight: 600,
  marginBottom: 2,
};

export const chartTooltipItemStyle: CSSProperties = {
  color: 'rgb(var(--ink-800))',
};

/** Bequemes Spread für <Tooltip {...chartTooltipProps} />. */
export const chartTooltipProps = {
  contentStyle: chartTooltipContentStyle,
  labelStyle: chartTooltipLabelStyle,
  itemStyle: chartTooltipItemStyle,
} as const;
