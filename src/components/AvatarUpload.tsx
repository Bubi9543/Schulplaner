import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { AvatarCropDialog } from '@/components/AvatarCropDialog';
import { blobToDataUrl, uploadAvatarBlob, removeAvatar } from '@/lib/avatar';
import { supabase } from '@/lib/supabase';

/**
 * Profilbild auswählen / entfernen. Speichert lokal sofort als Data-URL
 * (funktioniert offline) und lädt – falls angemeldet – zusätzlich ins
 * Cloud-Profil hoch, damit Freunde das Bild sehen.
 */
export function AvatarUpload({ value, onChange, name = '', size = 'size-16' }: {
  value?: string;
  onChange: (url: string | undefined) => void;
  name?: string;
  size?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Roh-Bild für den Zuschneide-Dialog (null = Dialog zu).
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  /** Datei roh einlesen und den Zuschneide-Dialog öffnen. */
  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.onerror = () => setError('Bild konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  }

  /** Vom Dialog gewählter Ausschnitt: lokal anzeigen + (falls angemeldet) hochladen. */
  async function handleCropped(blob: Blob) {
    setCropSrc(null);
    setError(null);
    setBusy(true);
    try {
      // 1) Sofort lokal anzeigen.
      onChange(await blobToDataUrl(blob));
      // 2) Falls angemeldet: in die Cloud, damit Freunde es sehen.
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            const url = await uploadAvatarBlob(blob);
            onChange(url);
          } catch { /* lokal reicht – Cloud best effort */ }
        }
      }
    } catch {
      setError('Bild konnte nicht verarbeitet werden.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      onChange(undefined);
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await removeAvatar().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Avatar name={name} avatarUrl={value} className={size} textClassName="text-xl" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/30">
            <Loader2 className="size-5 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <button type="button" className="btn-ghost py-1.5 px-3 text-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-4" /> {value ? 'Ändern' : 'Bild wählen'}
          </button>
          {value && (
            <button type="button" className="btn-ghost py-1.5 px-3 text-sm text-rose-500" disabled={busy} onClick={handleRemove}>
              <Trash2 className="size-4" /> Entfernen
            </button>
          )}
        </div>
        {error && <span className="text-xs text-rose-500">{error}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      <AvatarCropDialog
        open={cropSrc !== null}
        imageSrc={cropSrc}
        onCancel={() => setCropSrc(null)}
        onConfirm={blob => void handleCropped(blob)}
      />
    </div>
  );
}
