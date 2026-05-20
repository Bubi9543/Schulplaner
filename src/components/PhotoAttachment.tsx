import { useRef, useState } from 'react';
import { Camera, Trash2, ZoomIn, X } from 'lucide-react';
import { savePhoto, deletePhoto, usePhotos } from '@/lib/photos';
import type { Photo } from '@/types';

interface Props {
  refId: string;
  refType: Photo['refType'];
}

export function PhotoAttachment({ refId, refType }: Props) {
  const { photos, reload } = usePhotos(refId, refType);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setLoading(true);
    try {
      for (const f of files) await savePhoto(refId, refType, f);
      await reload();
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
        <button type="button" onClick={() => inputRef.current?.click()} disabled={loading}
          className="btn-ghost text-xs py-1">
          <Camera className="size-3.5" />{loading ? 'Lädt…' : 'Foto hinzufügen'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFiles} />
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group">
              <img src={p.dataUrl} alt="" className="size-16 rounded-xl object-cover cursor-pointer" onClick={() => setLightbox(p.dataUrl)} />
              <button type="button" onClick={() => remove(p.id)}
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-rose-500 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
                <Trash2 className="size-3" />
              </button>
              <button type="button" onClick={() => setLightbox(p.dataUrl)}
                className="absolute bottom-0.5 right-0.5 size-5 rounded-full bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
                <ZoomIn className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}>
            <X className="size-7" />
          </button>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
