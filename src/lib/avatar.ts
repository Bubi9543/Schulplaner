import { supabase } from './supabase';
import { getOrCreateMyProfile } from './homeworkShare';

/**
 * Profilbilder (Avatare).
 *
 * - Bild wird quadratisch auf max. 256px center-cropped + als JPEG komprimiert.
 * - Upload in den öffentlichen Bucket `avatars` unter `<user_id>/avatar.jpg`.
 * - Die öffentliche URL (mit Cache-Bust-Query) wird in `user_profiles.avatar_url`
 *   gespeichert, damit Freunde sie direkt anzeigen können (Liste + Rangliste).
 *
 * Setup → siehe FRIENDS_SETUP.md (Bucket `avatars` + Spalte avatar_url).
 */

const BUCKET = 'avatars';
const SIZE = 256;
const QUALITY = 0.82;

export class AvatarAuthError extends Error {
  constructor() { super('Profilbild braucht einen Cloud-Account. Logge dich erst an.'); }
}

/** Liest eine Datei, skaliert sie center-cropped auf SIZE×SIZE und gibt ein JPEG-Blob zurück. */
async function compressToSquare(file: File): Promise<Blob> {
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

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Kompression fehlgeschlagen')), 'image/jpeg', QUALITY);
  });
}

/**
 * Lädt ein neues Profilbild hoch und gibt die öffentliche (cache-busted) URL zurück.
 * Aktualisiert außerdem `user_profiles.avatar_url`.
 */
export async function uploadAvatar(file: File): Promise<string> {
  if (!supabase) throw new AvatarAuthError();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AvatarAuthError();

  // Profil sicherstellen (legt es bei Bedarf an).
  await getOrCreateMyProfile();

  const blob = await compressToSquare(file);
  const path = `${user.id}/avatar.jpg`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
  if (upErr) throw new Error('Upload fehlgeschlagen: ' + upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-Bust, damit ein neues Bild sofort statt aus dem Browser-Cache erscheint.
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: updErr } = await supabase
    .from('user_profiles')
    .update({ avatar_url: url })
    .eq('user_id', user.id);
  if (updErr) throw new Error('Profil konnte nicht aktualisiert werden: ' + updErr.message);

  return url;
}

/** Entfernt das Profilbild (Storage-Datei + avatar_url). */
export async function removeAvatar(): Promise<void> {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.storage.from(BUCKET).remove([`${user.id}/avatar.jpg`]);
  await supabase.from('user_profiles').update({ avatar_url: null }).eq('user_id', user.id);
}
