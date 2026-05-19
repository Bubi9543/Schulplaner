import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Accent = 'blue' | 'green' | 'orange' | 'violet' | 'rose';

const ACCENT_BG: Record<Accent, string> = {
  blue: 'bg-aurora-blue',
  green: 'bg-aurora-green',
  orange: 'bg-aurora-orange',
  violet: 'bg-aurora-violet',
  rose: 'bg-aurora-rose',
};

interface Props {
  accent: Accent;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ accent, title, subtitle, actions, children }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative min-h-full"
    >
      <div className={`pointer-events-none fixed inset-0 -z-10 ${ACCENT_BG[accent]} opacity-90`} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-white/40 via-white/20 to-white/60" />
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
