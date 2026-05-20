import { useEffect, useState } from 'react';
import type { Transition } from 'framer-motion';
import { useStore } from '@/store/useStore';
import type { AnimationLevel } from '@/types';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cb = () => setReduced(mq.matches);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, []);
  return reduced;
}

export function useAnimationLevel(): AnimationLevel {
  const setting = useStore(s => s.settings?.animationLevel ?? 'rich');
  const reduced = usePrefersReducedMotion();
  if (reduced && setting === 'rich') return 'reduced';
  return setting;
}

export const PRESETS = {
  fadeIn: (level: AnimationLevel) => ({
    initial: level === 'minimal' ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: level === 'minimal' ? 0.18 : 0.35, ease: 'easeOut' as const },
  }),
  slideUp: (level: AnimationLevel) => ({
    initial: level === 'minimal' ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: 'easeOut' as const },
  }),
  pop: (level: AnimationLevel): { initial: { scale: number; opacity: number }; animate: { scale: number; opacity: number }; transition: Transition } => ({
    initial: level === 'minimal' ? { scale: 1, opacity: 0 } : { scale: 0.92, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: level === 'minimal'
      ? { duration: 0.15 }
      : { type: 'spring' as const, stiffness: 380, damping: 22 },
  }),
};

export const ambientBlobsVisible = (level: AnimationLevel) => level === 'rich';
export const hoverEnabled = (level: AnimationLevel) => level !== 'minimal';
export const microMotionEnabled = (level: AnimationLevel) => level === 'rich';
