interface Props {
  name: string;
  avatarUrl?: string;
  /** Optionales Profil-Emoji (lokal). Wird genutzt, wenn kein avatarUrl vorhanden ist. */
  emoji?: string;
  /** Tailwind size-Klasse, z.B. 'size-10' (Default) oder 'size-16'. */
  className?: string;
  /** Größe der Initialen/Emoji (Default 'text-sm'). */
  textClassName?: string;
}

/** Initialen aus einem Anzeigenamen (max. 2 Buchstaben). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Profilbild eines Nutzers – zeigt `avatarUrl`, sonst ein gewähltes `emoji`,
 * sonst die Initialen auf Theme-Gradient.
 */
export function Avatar({ name, avatarUrl, emoji, className = 'size-10', textClassName = 'text-sm' }: Props) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${className} rounded-full object-cover bg-ink-100 flex-shrink-0`}
        loading="lazy"
      />
    );
  }
  if (emoji) {
    return (
      <div
        className={`${className} rounded-full theme-gradient grid place-items-center flex-shrink-0 leading-none ${textClassName}`}
        aria-label={name}
      >
        <span>{emoji}</span>
      </div>
    );
  }
  return (
    <div
      className={`${className} rounded-full theme-gradient text-white grid place-items-center font-bold flex-shrink-0 ${textClassName}`}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
