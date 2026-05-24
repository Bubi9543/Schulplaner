import { motion } from 'framer-motion';
import type { GradingSystem } from '@/types';
import { gradeColor } from '@/lib/grading';

interface Props {
  value: number | null;
  system: GradingSystem;
  /** Fixed pixel size. If omitted, the ring fills its container (use within a sized parent). */
  size?: number;
}

export function AverageRing({ value, system, size }: Props) {
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

  return (
    <div className="relative grid place-items-center" style={containerStyle}>
      <svg viewBox={`0 0 ${VB} ${VB}`} className="-rotate-90 w-full h-full">
        <circle cx={VB / 2} cy={VB / 2} r={r} stroke="rgba(15,18,32,.08)" strokeWidth={stroke} fill="none" />
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
          <div className="font-display font-extrabold text-[clamp(1rem,18cqi,2.25rem)] text-ink-900 leading-none">
            {value === null ? '–' : system === 'oberstufe' ? value.toFixed(1).replace('.', ',') : value.toFixed(2).replace('.', ',')}
          </div>
          <div className="text-[clamp(0.55rem,5.5cqi,0.7rem)] uppercase tracking-wider text-ink-500 mt-1">{system === 'oberstufe' ? 'Punkte Ø' : 'Schnitt'}</div>
        </div>
      </div>
    </div>
  );
}
