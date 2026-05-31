import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface Props {
  /** Kantenlänge des Icons in px. */
  size?: number;
  /** Lebendige, flackernde Flamme (Streak aktiv) vs. graue, ruhende Flamme. */
  active?: boolean;
  className?: string;
}

/**
 * Animierte Streak-Flamme. Im aktiven Zustand flackert sie (Skalierung +
 * leichtes Wackeln + pulsierender Glow) wie eine echte Flamme; ist die Streak
 * erloschen, wird eine ruhige graue Flamme gezeigt.
 */
export function StreakFlame({ size = 22, active = true, className = '' }: Props) {
  if (!active) {
    return (
      <Flame
        className={className}
        style={{ width: size, height: size, color: 'rgb(var(--ink-300))' }}
        aria-hidden
      />
    );
  }

  return (
    <motion.span
      className={`inline-grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      animate={{
        scale: [1, 1.12, 0.96, 1.08, 1],
        rotate: [0, -4, 3, -2, 0],
        y: [0, -1, 0.5, -0.5, 0],
      }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden
    >
      <Flame
        fill="#fb923c"
        style={{
          width: size,
          height: size,
          color: '#f97316',
          filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.65))',
        }}
      />
    </motion.span>
  );
}
