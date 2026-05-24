import { motion } from 'framer-motion';
import type { GradingSystem } from '@/types';
import { gradeColor } from '@/lib/grading';

interface Props {
  value: number | null;
  system: GradingSystem;
  /** Fixed pixel size. If omitted, the ring fills its container (use within a sized parent). */
  size?: number;
  /** "invert" = white text for use over colored/gradient backgrounds. */
  tone?: 'auto' | 'invert';
}

export function AverageRing({ value, system, size, tone = 'auto' }: Props) {
  const VB = 140;
  const stroke = 12;
  const r = (VB - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null
    ? 0
    : system === 'oberstufe'
      ? Math.max(0, Math.min(1, value / 15))
      : Math.max(0, Math.min(1, (6 - value) / 5));
  const color = value === null ? '#cbd5e1' : gradeColor(value, system);

  const containerStyle: React.CSSProperties = size != null
    ? { width: size, height: size, containerType: 'size' }
    : { width: '100%', height: '100%', aspectRatio: '1 / 1', containerType: 'size' };

  const trackColor = tone === 'invert' ? 'rgba(255,255,255,0.18)' : 'rgba(15,18,32,.08)';
  const numberCls = tone === 'invert' ? 'text-white' : 'text-ink-900';
  const labelCls = tone === 'invert' ? 'text-white/70' : 'text-ink-500';

  return (
    <div className="relative grid place-items-center" style={containerStyle}>
      <svg viewBox={`0 0 ${VB} ${VB}`} className="-rotate-90 w-full h-full">
        <circle cx={VB / 2} cy={VB / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={VB / 2} cy={VB / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className={`font-display font-extrabold text-[clamp(1rem,22cqi,2.5rem)] leading-none ${numberCls}`}>
            {value === null ? '–' : system === 'oberstufe' ? value.toFixed(1).replace('.', ',') : value.toFixed(2).replace('.', ',')}
          </div>
          <div className={`text-[clamp(0.5rem,5cqi,0.7rem)] uppercase tracking-wider mt-1 font-semibold ${labelCls}`}>
            {system === 'oberstufe' ? 'Punkte' : 'Schnitt'}
          </div>
        </div>
      </div>
    </div>
  );
}
