import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Optional, beibehalten für Backwards-Compat - wird ignoriert. Theme bestimmt die Farbe. */
  accent?: string;
}

export function PageShell({ title, subtitle, actions, children }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative min-h-full"
    >
      <div className="pointer-events-none fixed inset-0 -z-10 theme-aurora opacity-90 transition-opacity duration-500" />
      <div className="pointer-events-none fixed inset-0 -z-10 page-veil" />
      <div className="px-5 md:px-8 pt-6 pb-2 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="h1 text-balance">{title}</h1>
          {subtitle && <p className="subtle mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      <div className="px-5 md:px-8 pb-32 pt-4">{children}</div>
    </motion.div>
  );
}
