import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function Empty({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="size-14 rounded-2xl bg-white/70 grid place-items-center shadow-soft mb-4">
        <Icon className="size-7 text-ink-500" />
      </div>
      <h3 className="font-display font-bold text-ink-800 text-lg">{title}</h3>
      {description && <p className="subtle mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
