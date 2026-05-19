import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  delay?: number;
}

export function Card({ children, className, onClick, hoverable, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      whileHover={hoverable ? { y: -2 } : undefined}
      onClick={onClick}
      className={cn('card', onClick && 'cursor-pointer', hoverable && 'hover:shadow-glow transition-shadow', className)}
    >
      {children}
    </motion.div>
  );
}
