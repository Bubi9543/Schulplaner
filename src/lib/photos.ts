import { db, uid } from './db';
import type { Photo } from '@/types';
import { useEffect, useState } from 'react';

const MAX_PX = 1200;
const QUALITY = 0.72;

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function savePhoto(refId: string, refType: Photo['refType'], file: File): Promise<Photo> {
  const dataUrl = await compressImage(file);
  const photo: Photo = { id: uid(), refId, refType, dataUrl, createdAt: Date.now() };
  await db.photos.add(photo);
  return photo;
}

export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id);
}

export async function getPhotos(refId: string, refType: Photo['refType']): Promise<Photo[]> {
  return db.photos.where('refId').equals(refId).and(p => p.refType === refType).sortBy('createdAt');
}

export function usePhotos(refId: string | undefined, refType: Photo['refType']): { photos: Photo[]; reload: () => void } {
  const [photos, setPhotos] = useState<Photo[]>([]);

  async function load() {
    if (!refId) { setPhotos([]); return; }
    setPhotos(await getPhotos(refId, refType));
  }

  useEffect(() => { load(); }, [refId, refType]);

  return { photos, reload: load };
}
