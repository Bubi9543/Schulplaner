import type { GradingSystem } from '@/types';
import { gradeColor, gradeLabel } from '@/lib/grading';
import { hexToRgba } from '@/lib/utils';

interface Props {
  value: number;
  system: GradingSystem;
  size?: 'sm' | 'md' | 'lg';
  pending?: boolean;
  /** Optionale Notentendenz – wird klein hochgestellt angezeigt (rein visuell). */
  tendency?: '+' | '-';
}

export function GradeBadge({ value, system, size = 'md', pending, tendency }: Props) {
  const color = gradeColor(value, system);
  const sizeClass = size === 'lg' ? 'size-14 text-xl' : size === 'sm' ? 'size-8 text-xs' : 'size-11 text-base';
  if (pending) {
    return (
      <div className={`${sizeClass} rounded-2xl grid place-items-center font-display font-bold border-2 border-dashed border-ink-300 text-ink-400`}>
        ?
      </div>
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-2xl grid place-items-center font-display font-extrabold text-white shadow-sm`}
      style={{ background: `linear-gradient(135deg, ${color}, ${hexToRgba(color, .85)})` }}
    >
      <span className="inline-flex items-start leading-none">
        {gradeLabel(value, system)}
        {tendency && <span className="ml-px font-bold" style={{ fontSize: '0.6em', lineHeight: 1 }}>{tendency === '+' ? '+' : '−'}</span>}
      </span>
    </div>
  );
}
