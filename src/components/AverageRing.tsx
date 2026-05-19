import { motion } from 'framer-motion';
import type { GradingSystem } from '@/types';
import { gradeColor } from '@/lib/grading';

interface Props {
  value: number | null;
  system: GradingSystem;
  size?: number;
}

export function AverageRing({ value, system, size = 140 }: Props) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null
    ? 0
    : system === 'oberstufe'
      ? Math.max(0, Math.min(1, value / 15))
      : Math.max(0, Math.min(1, (6 - value) / 5));
  const color = value === null ? '#cbd5e1' : gradeColor(value, system);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(15,18,32,.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * pct }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display font-extrabold text-3xl text-ink-900">
            {value === null ? '–' : system === 'oberstufe' ? value.toFixed(1).replace('.', ',') : value.toFixed(2).replace('.', ',')}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500">{system === 'oberstufe' ? 'Punkte Ø' : 'Schnitt'}</div>
        </div>
      </div>
    </div>
  );
}
