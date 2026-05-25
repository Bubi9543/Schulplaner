import { useRef, useState } from 'react';
import { Camera, Trash2, ZoomIn, X, AlertCircle } from 'lucide-react';
import { savePhoto, deletePhoto, usePhotos, usePhotoUrl, PhotoAuthError } from '@/lib/photos';
import { useStore } from '@/store/useStore';
import type { Photo } from '@/types';

interface Props {
  refId: string;
  refType: Photo['refType'];
}

export function PhotoAttachment({ refId, refType }: Props) {
  const authUser = useStore(s => s.authUser);
  const { photos, reload } = usePhotos(refId, refType);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setLoading(true);
    setError(null);
    try {
      for (const f of files) await savePhoto(refId, refType, f);
      await reload();
    } catch (err) {
      setError(err instanceof PhotoAuthError ? err.message : 'Fehler beim Upload: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  async function remove(id: string) {
    await deletePhoto(id);
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label mb-0">Fotos</span>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading || !authUser}
          className="btn-ghost text-xs py-1">
          <Camera className="size-3.5" />{loading ? 'Lädt…' : 'Foto hinzufügen'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFiles} />
      </div>

      {!authUser && (
        <div className="text-xs text-ink-600 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-2 flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>Logge dich in den Einstellungen ein, um Fotos sicher in der Cloud zu speichern.</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-700 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 mb-2">
          {error}
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map(p => (
            <PhotoThumb key={p.id} photo={p} onRemove={() => remove(p.id)} onOpen={() => setLightboxPhoto(p)} />
          ))}
        </div>
      )}

      {lightboxPhoto && <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </div>
  );
}

function PhotoThumb({ photo, onRemove, onOpen }: { photo: Photo; onRemove: () => void; onOpen: () => void }) {
  const { url, loading } = usePhotoUrl(photo);
  return (
    <div className="relative group">
      {loading ? (
        <div className="size-16 rounded-xl bg-ink-100 grid place-items-center text-xs text-ink-400 animate-pulse">…</div>
      ) : url ? (
        <img src={url} alt="" className="size-16 rounded-xl object-cover cursor-pointer" onClick={onOpen} />
      ) : (
        <div className="size-16 rounded-xl bg-rose-50 grid place-items-center text-xs text-rose-500" title="Foto nicht verfügbar">
          <AlertCircle className="size-4" />
        </div>
      )}
      <button type="button" onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-rose-500 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
        <Trash2 className="size-3" />
      </button>
      {url && (
        <button type="button" onClick={onOpen}
          className="absolute bottom-0.5 right-0.5 size-5 rounded-full bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
          <ZoomIn className="size-3" />
        </button>
      )}
    </div>
  );
}

function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { url, loading } = usePhotoUrl(photo);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white" onClick={onClose}>
        <X className="size-7" />
      </button>
      {loading && <div className="text-white text-sm">Lädt…</div>}
      {url && <img src={url} alt="" className="max-w-full max-h-full rounded-2xl object-contain" onClick={e => e.stopPropagation()} />}
    </div>
  );
}
