import { getSubjectIcon } from '@/lib/subjectIcons';

interface Props {
  /** Fach (oder Teilobjekt mit name/icon). */
  subject: { icon?: string; name?: string };
  className?: string;
  strokeWidth?: number;
}

/** Rendert das passende lucide-Icon eines Fachs (manuell gewählt oder automatisch erkannt). */
export function SubjectIcon({ subject, className = 'size-5', strokeWidth = 2.25 }: Props) {
  const Icon = getSubjectIcon(subject);
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
