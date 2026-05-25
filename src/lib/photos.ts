import { useEffect, useState } from 'react';
import { db, uid } from './db';
import { supabase } from './supabase';
import { syncRow, deleteRow } from './sync';
import type { Photo } from '@/types';

const MAX_PX = 1200;
const QUALITY = 0.72;
const BUCKET = 'photos';
/** Signed-URL Gültigkeitsdauer in Sekunden (1h). */
const URL_TTL = 3600;

// In-Memory-Cache für signed URLs, damit nicht jeder Render einen Request macht.
const urlCache = new Map<string, { url: string; expires: number }>();

export class PhotoAuthError extends Error {
  constructor() { super('Foto-Upload braucht einen Cloud-Account. Logge dich in den Einstellungen ein.'); }
}

// ─── Kompression ───────────────────────────────────────────────────────────

async function compressImageToBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Kompression fehlgeschlagen')), 'image/jpeg', QUALITY);
  });
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function savePhoto(refId: string, refType: Photo['refType'], file: File): Promise<Photo> {
  if (!supabase) throw new PhotoAuthError();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new PhotoAuthError();

  const blob = await compressImageToBlob(file);
  const photoId = uid();
  const storagePath = `${user.id}/${photoId}.jpg`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (upErr) throw new Error('Upload fehlgeschlagen: ' + upErr.message);

  const photo: Photo = {
    id: photoId,
    refId,
    refType,
    storagePath,
    createdAt: Date.now(),
    userId: user.id,
  };
  await db.photos.add(photo);

  // Photo-Metadaten in Supabase Postgres syncen (Photos-Tabelle)
  syncRow('photos', photo.id, photo, user.id);

  return photo;
}

export async function deletePhoto(id: string): Promise<void> {
  const photo = await db.photos.get(id);
  if (!photo) return;

  if (photo.storagePath && supabase) {
    const { error } = await supabase.storage.from(BUCKET).remove([photo.storagePath]);
    if (error) console.warn('Storage delete error', error.message);
  }
  urlCache.delete(id);
  await db.photos.delete(id);
  deleteRow('photos', id);
}

export async function getPhotos(refId: string, refType: Photo['refType']): Promise<Photo[]> {
  return db.photos.where('refId').equals(refId).and(p => p.refType === refType).sortBy('createdAt');
}

// ─── URL-Auflösung ─────────────────────────────────────────────────────────

/**
 * Liefert eine browser-anzeigbare URL für ein Foto:
 * - Legacy: `dataUrl` direkt zurückgeben
 * - Cloud: signed URL holen, im Cache halten bis 5 Min vor Ablauf
 */
export async function resolvePhotoUrl(photo: Photo): Promise<string | null> {
  if (photo.dataUrl) return photo.dataUrl;
  if (!photo.storagePath || !supabase) return null;

  const cached = urlCache.get(photo.id);
  if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.url;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.storagePath, URL_TTL);
  if (error || !data?.signedUrl) {
    console.warn('Signed URL error', error?.message);
    return null;
  }
  urlCache.set(photo.id, { url: data.signedUrl, expires: Date.now() + URL_TTL * 1000 });
  return data.signedUrl;
}

// ─── React-Hooks ───────────────────────────────────────────────────────────

export function usePhotos(refId: string | undefined, refType: Photo['refType']): { photos: Photo[]; reload: () => void } {
  const [photos, setPhotos] = useState<Photo[]>([]);

  async function load() {
    if (!refId) { setPhotos([]); return; }
    setPhotos(await getPhotos(refId, refType));
  }

  useEffect(() => { load(); }, [refId, refType]);

  return { photos, reload: load };
}

/** Resolved URL für ein einzelnes Foto - async, mit Loading-State. */
export function usePhotoUrl(photo: Photo): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(photo.dataUrl ?? null);
  const [loading, setLoading] = useState(!photo.dataUrl && !!photo.storagePath);

  useEffect(() => {
    let cancelled = false;
    if (photo.dataUrl) { setUrl(photo.dataUrl); setLoading(false); return; }
    if (!photo.storagePath) { setUrl(null); setLoading(false); return; }
    setLoading(true);
    resolvePhotoUrl(photo).then(u => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [photo.id, photo.dataUrl, photo.storagePath]);

  return { url, loading };
}
