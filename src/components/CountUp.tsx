import { useEffect, useState } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import { useAnimationLevel } from '@/lib/animation';

interface Props {
  to: number;
  digits?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  fallback?: string;
}

export function CountUp({ to, digits = 0, prefix = '', suffix = '', duration = 0.8, className, fallback }: Props) {
  const level = useAnimationLevel();
  const mv = useMotionValue(level === 'minimal' ? to : 0);
  const initialText = fallback ?? (Number.isNaN(to) ? (fallback ?? '–') : prefix + to.toFixed(digits).replace('.', ',') + suffix);
  const [text, setText] = useState<string>(initialText);

  useEffect(() => {
    if (Number.isNaN(to)) { setText(fallback ?? '–'); return; }
    if (level === 'minimal') {
      mv.set(to);
      setText(prefix + to.toFixed(digits).replace('.', ',') + suffix);
      return;
    }
    const unsub = mv.on('change', v => {
      setText(prefix + v.toFixed(digits).replace('.', ',') + suffix);
    });
    const controls = animate(mv, to, { duration, ease: 'easeOut' });
    return () => { controls.stop(); unsub(); };
  }, [to, level, digits, prefix, suffix, duration, mv, fallback]);

  return <span className={className}>{text}</span>;
}

interface ConfettiProps {
  trigger: number;
  duration?: number;
}

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';

const CONFETTI_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#06b6d4'];

export function Confetti({ trigger, duration = 1600 }: ConfettiProps) {
  const level = useAnimationLevel();
  const [visible, setVisible] = useState(false);
  const pieces = useMemo(() => {
    return Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      x: (Math.random() - 0.5) * 360,
      y: 220 + Math.random() * 320,
      rot: (Math.random() - 0.5) * 720,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.15,
      shape: i % 3,
    }));
  }, [trigger]);

  useEffect(() => {
    if (!trigger || level === 'minimal') return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [trigger, duration, level]);

  return (
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
          {pieces.map(p => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rot }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration / 1000, ease: 'easeOut', delay: p.delay }}
              className="absolute"
              style={{
                top: '24%',
                left: `${p.left}%`,
                width: 9, height: p.shape === 0 ? 9 : 14,
                background: p.color,
                borderRadius: p.shape === 0 ? '50%' : p.shape === 1 ? '3px' : '50% 0',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
