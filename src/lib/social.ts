import { supabase } from './supabase';
import { getOrCreateMyProfile } from './homeworkShare';
import { notifySocial } from './socialNotify';

/**
 * Social-Feed: Lern-Posts, Reaktionen & Kommentare – geteilt mit Freunden.
 *
 * - Posts liegen in `social_posts`, Reaktionen in `social_reactions`
 *   (genau eine pro Nutzer & Post), Kommentare in `social_comments`.
 * - Sichtbarkeit pro Post: beim Posten wählt man die Empfänger (Freunde) aus;
 *   diese werden als Snapshot in `social_post_audience` gespeichert. Wer später
 *   Freund wird, sieht alte Posts NICHT. Die Filterung erzwingt RLS in Supabase
 *   (eigene Posts + Posts, in deren Audience man steht).
 * - Fotos liegen im öffentlichen Bucket `social-photos` unter `<user_id>/<uuid>.jpg`.
 *
 * Setup (Tabellen, RLS, Bucket) → siehe SOCIAL_SETUP.md
 */

export interface FeedComment {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt: number;
  mine: boolean;
}

export interface FeedPost {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  subject: string | null;
  subjectColor?: string;
  caption: string;
  photoUrl?: string;
  studyMin: number;
  streak: number;
  createdAt: number;
  /** Emoji → Anzahl. */
  reactions: Record<string, number>;
  /** Mein eigenes Reaktions-Emoji (oder null). */
  myReaction: string | null;
  comments: FeedComment[];
  mine: boolean;
}

export class SocialAuthError extends Error {
  constructor() { super('Der Social-Feed braucht einen Cloud-Account. Logge dich erst an.'); }
}

const PHOTO_BUCKET = 'social-photos';
const PHOTO_MAX = 1440;
const PHOTO_QUALITY = 0.82;

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── Foto-Upload ─────────────────────────────────────────────────────────────

/** Skaliert ein Bild auf max. PHOTO_MAX (lange Kante) und komprimiert als JPEG. */
async function compressImage(file: File): Promise<Blob> {
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

  const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Kompression fehlgeschlagen')), 'image/jpeg', PHOTO_QUALITY);
  });
}

/** Lädt ein Post-Foto hoch und gibt die öffentliche URL zurück. */
export async function uploadPostPhoto(file: File): Promise<string> {
  if (!supabase) throw new SocialAuthError();
  const me = await currentUserId();
  if (!me) throw new SocialAuthError();

  const blob = await compressImage(file);
  const path = `${me}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
  if (error) throw new Error('Foto-Upload fehlgeschlagen: ' + error.message);

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Feed laden ──────────────────────────────────────────────────────────────

interface PostRow { id: string; user_id: string; subject: string | null; subject_color: string | null; caption: string; photo_url: string | null; study_min: number; streak: number; created_at: string; }
interface ReactionRow { post_id: string; user_id: string; emoji: string; }
interface CommentRow { id: string; post_id: string; user_id: string; text: string; created_at: string; }
interface ProfileRow { user_id: string; display_name: string; avatar_url: string | null; }

/**
 * Lädt den sichtbaren Feed inkl. Reaktionen, Kommentaren und Profilnamen/-bildern.
 * Welche Posts sichtbar sind, entscheidet die RLS-Policy (eigene Posts + Posts,
 * in deren Audience man steht) – hier ist keine Freundes-Filterung nötig.
 */
export async function fetchFeed(limit = 100): Promise<FeedPost[]> {
  if (!supabase) return [];
  const me = await currentUserId();
  if (!me) return [];

  const { data: postData, error: postErr } = await supabase
    .from('social_posts')
    .select('id, user_id, subject, subject_color, caption, photo_url, study_min, streak, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (postErr) { console.warn('fetchFeed posts error:', postErr.message); return []; }

  const posts = (postData as PostRow[]) ?? [];
  if (posts.length === 0) return [];
  const postIds = posts.map(p => p.id);

  const [reactRes, commentRes] = await Promise.all([
    supabase.from('social_reactions').select('post_id, user_id, emoji').in('post_id', postIds),
    supabase.from('social_comments').select('id, post_id, user_id, text, created_at').in('post_id', postIds).order('created_at', { ascending: true }),
  ]);

  const reactions = (reactRes.data as ReactionRow[]) ?? [];
  const comments = (commentRes.data as CommentRow[]) ?? [];

  // Profile aller Beteiligten (Post-Autoren + Kommentar-Autoren) auflösen.
  const peopleIds = new Set<string>();
  posts.forEach(p => peopleIds.add(p.user_id));
  comments.forEach(c => peopleIds.add(c.user_id));
  const profiles = new Map<string, ProfileRow>();
  if (peopleIds.size > 0) {
    const { data: profData } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', [...peopleIds]);
    for (const p of (profData as ProfileRow[]) ?? []) profiles.set(p.user_id, p);
  }
  const nameOf = (id: string) => profiles.get(id)?.display_name ?? 'Unbekannt';
  const avatarOf = (id: string) => profiles.get(id)?.avatar_url ?? undefined;

  // Reaktionen je Post aggregieren.
  const reactByPost = new Map<string, { counts: Record<string, number>; mine: string | null }>();
  for (const r of reactions) {
    let e = reactByPost.get(r.post_id);
    if (!e) { e = { counts: {}, mine: null }; reactByPost.set(r.post_id, e); }
    e.counts[r.emoji] = (e.counts[r.emoji] ?? 0) + 1;
    if (r.user_id === me) e.mine = r.emoji;
  }

  // Kommentare je Post.
  const commentsByPost = new Map<string, FeedComment[]>();
  for (const c of comments) {
    const list = commentsByPost.get(c.post_id) ?? [];
    list.push({
      id: c.id, userId: c.user_id, authorName: nameOf(c.user_id), authorAvatar: avatarOf(c.user_id),
      text: c.text, createdAt: new Date(c.created_at).getTime(), mine: c.user_id === me,
    });
    commentsByPost.set(c.post_id, list);
  }

  return posts.map(p => {
    const r = reactByPost.get(p.id);
    return {
      id: p.id, userId: p.user_id, authorName: nameOf(p.user_id), authorAvatar: avatarOf(p.user_id),
      subject: p.subject, subjectColor: p.subject_color ?? undefined, caption: p.caption, photoUrl: p.photo_url ?? undefined,
      studyMin: p.study_min, streak: p.streak, createdAt: new Date(p.created_at).getTime(),
      reactions: r?.counts ?? {}, myReaction: r?.mine ?? null,
      comments: commentsByPost.get(p.id) ?? [], mine: p.user_id === me,
    };
  });
}

// ─── Posts schreiben ─────────────────────────────────────────────────────────

export interface NewPost {
  subject: string | null;
  subjectColor?: string;
  caption: string;
  photoUrl?: string;
  studyMin: number;
  streak: number;
}

/**
 * Legt einen Post an und speichert seine Audience (Snapshot der ausgewählten
 * Freunde). `audienceUserIds` = wer den Post sehen darf (ohne mich selbst).
 * Gibt den Post als FeedPost zurück (für optimistisches Einfügen).
 */
export async function createPost(data: NewPost, audienceUserIds: string[]): Promise<FeedPost> {
  if (!supabase) throw new SocialAuthError();
  const profile = await getOrCreateMyProfile();
  const me = profile.userId;

  const { data: row, error } = await supabase
    .from('social_posts')
    .insert({
      user_id: me,
      subject: data.subject,
      subject_color: data.subjectColor ?? null,
      caption: data.caption,
      photo_url: data.photoUrl ?? null,
      study_min: Math.round(data.studyMin),
      streak: Math.round(data.streak),
    })
    .select('id, user_id, subject, subject_color, caption, photo_url, study_min, streak, created_at')
    .single();
  if (error) throw new Error('Post fehlgeschlagen: ' + error.message);

  const p = row as PostRow;

  // Audience-Snapshot speichern (nur ausgewählte Freunde; ich sehe meinen Post via RLS).
  const recipients = [...new Set(audienceUserIds)].filter(id => id && id !== me);
  if (recipients.length > 0) {
    const { error: audErr } = await supabase
      .from('social_post_audience')
      .insert(recipients.map(uid => ({ post_id: p.id, user_id: uid })));
    if (audErr) {
      // Audience fehlgeschlagen → Post wieder entfernen, damit nichts „für niemanden“ rumliegt.
      await supabase.from('social_posts').delete().eq('id', p.id);
      throw new Error('Sichtbarkeit konnte nicht gespeichert werden: ' + audErr.message);
    }
  }

  // Empfänger sofort benachrichtigen (im Hintergrund).
  notifySocial({ type: 'post', postId: p.id });

  return {
    id: p.id, userId: p.user_id, authorName: profile.displayName, authorAvatar: profile.avatarUrl,
    subject: p.subject, subjectColor: p.subject_color ?? undefined, caption: p.caption, photoUrl: p.photo_url ?? undefined,
    studyMin: p.study_min, streak: p.streak, createdAt: new Date(p.created_at).getTime(),
    reactions: {}, myReaction: null, comments: [], mine: true,
  };
}

export async function deletePost(postId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('social_posts').delete().eq('id', postId);
  if (error) throw new Error('Löschen fehlgeschlagen: ' + error.message);
}

// ─── Reaktionen ──────────────────────────────────────────────────────────────

/**
 * Setzt/wechselt/entfernt meine Reaktion auf einen Post (genau eine pro Post).
 * Gibt das neue eigene Emoji zurück (oder null, wenn abgewählt).
 */
export async function setReaction(postId: string, emoji: string, current: string | null): Promise<string | null> {
  if (!supabase) throw new SocialAuthError();
  const me = await currentUserId();
  if (!me) throw new SocialAuthError();

  if (current === emoji) {
    const { error } = await supabase.from('social_reactions').delete().eq('post_id', postId).eq('user_id', me);
    if (error) throw new Error(error.message);
    return null;
  }
  const { error } = await supabase
    .from('social_reactions')
    .upsert({ post_id: postId, user_id: me, emoji }, { onConflict: 'post_id,user_id' });
  if (error) throw new Error(error.message);
  // Nur beim Setzen/Wechseln benachrichtigen – der Autor wird serverseitig ermittelt.
  notifySocial({ type: 'reaction', postId });
  return emoji;
}

// ─── Kommentare ──────────────────────────────────────────────────────────────

/** Fügt einen Kommentar hinzu und gibt ihn zurück (für optimistisches Einfügen). */
export async function addComment(postId: string, text: string): Promise<FeedComment> {
  if (!supabase) throw new SocialAuthError();
  const profile = await getOrCreateMyProfile();

  const { data: row, error } = await supabase
    .from('social_comments')
    .insert({ post_id: postId, user_id: profile.userId, text })
    .select('id, post_id, user_id, text, created_at')
    .single();
  if (error) throw new Error('Kommentar fehlgeschlagen: ' + error.message);

  const c = row as CommentRow;
  notifySocial({ type: 'comment', commentId: c.id });
  return {
    id: c.id, userId: c.user_id, authorName: profile.displayName, authorAvatar: profile.avatarUrl,
    text: c.text, createdAt: new Date(c.created_at).getTime(), mine: true,
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('social_comments').delete().eq('id', commentId);
  if (error) throw new Error('Löschen fehlgeschlagen: ' + error.message);
}
