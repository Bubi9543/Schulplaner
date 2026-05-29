import { getTaskKindIcon } from '@/lib/grading';

interface Props {
  kind: string;
  className?: string;
}

/** Rendert das passende lucide-Icon zu einer TaskKind-ID. */
export function TaskKindIcon({ kind, className = 'size-4' }: Props) {
  const Icon = getTaskKindIcon(kind);
  return <Icon className={className} />;
}
