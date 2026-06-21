import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Camera, MoreHorizontal, SmilePlus, MessageCircle, Send, X,
  Image as ImageIcon, Clock, Copy, Check, Inbox, Loader2, Users, Trash2, RefreshCw,
  ChevronLeft, Globe2,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { StreakFlame } from '@/components/StreakFlame';
import { StudyLeaderboard } from '@/components/StudyLeaderboard';
import { FriendsList } from '@/components/FriendsList';
import { SubjectIcon } from '@/components/SubjectIcon';
import { AccountAuth } from '@/components/AccountAuth';
import { EmojiPicker } from '@/components/EmojiPicker';
import { useStore } from '@/store/useStore';
import { startOfISOWeek, computeStreak } from '@/lib/studyShare';
import { flashcardActivity } from '@/lib/flashcards';
import { QUICK_EMOJI, fmtMin, timeAgo } from '@/lib/socialDemo';
import {
  fetchFeed, createPost, deletePost, setReaction, addComment, deleteComment, uploadPostPhoto,
} from '@/lib/social';
import type { FeedPost } from '@/lib/social';

// Theme-getriebene Akzentfarben (reagieren auf den Theme-Switcher).
const ACCENT = 'rgb(var(--theme-primary-rgb))';
const ACCENT_SOFT = 'rgb(var(--theme-primary-rgb) / 0.13)';
const ACCENT_BORDER = 'rgb(var(--theme-primary-rgb) / 0.4)';

// ─── Kleine Bausteine ───────────────────────────────────────────────────────

function SubjectChip({ name, color, solid = false }: { name: string; color?: string; solid?: boolean }) {
  if (solid) {
    const bg = color ?? 'rgb(var(--theme-primary-rgb))';
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: bg }}>
        <SubjectIcon subject={{ name }} className="size-3" strokeWidth={2.4} /> {name}
      </span>
    );
  }
  const tint = color ? color + '1f' : 'rgb(var(--theme-primary-rgb) / 0.12)';
  const fg = color ?? 'rgb(var(--theme-primary-rgb))';
  const border = color ? color + '33' : 'rgb(var(--theme-primary-rgb) / 0.25)';
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: tint, color: fg, border: `1px solid ${border}` }}>
      <SubjectIcon subject={{ name }} className="size-3" strokeWidth={2.4} /> {name}
    </span>
  );
}

function StudyBadge({ min, streak, floating = false }: { min: number; streak: number; floating?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${floating ? 'backdrop-blur-md bg-black/35 text-white' : 'bg-ink-100 text-ink-600'}`}>
      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{fmtMin(min)}</span>
      {streak > 0 && (
        <span className="inline-flex items-center gap-0.5" style={{ color: floating ? '#fdba74' : '#f97316' }}>
          <StreakFlame size={14} active />{streak}
        </span>
      )}
    </div>
  );
}

// ─── Reaktionen ─────────────────────────────────────────────────────────────

function ReactionRow({ post, quickEmojis, onToggle, onPick, onComment }: {
  post: FeedPost;
  quickEmojis: string[];
  onToggle: (id: string, emoji: string) => void;
  onPick: (emoji: string) => void;
  onComment: () => void;
}) {
  const [fullPicker, setFullPicker] = useState(false);
  const entries = Object.entries(post.reactions);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  // Vorschläge, die noch nicht als Reaktion auf diesem Post stehen – verhindert Dopplungen.
  const suggestions = quickEmojis.filter(e => !post.reactions[e]);
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {entries.map(([e, n]) => {
          const mine = post.myReaction === e;
          return (
            <button key={e} onClick={() => onToggle(post.id, e)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition active:scale-95"
              style={mine
                ? { background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_BORDER}` }
                : { background: 'rgb(var(--ink-100))', color: 'rgb(var(--ink-600))', border: '1px solid transparent' }}>
              <span className="text-sm leading-none">{e}</span> {n}
            </button>
          );
        })}
        {/* „Alle Emojis" steht als Erstes vor den vorausgewählten Emojis. */}
        <button onClick={() => setFullPicker(v => !v)}
          className="inline-flex items-center justify-center rounded-full size-7 text-white transition active:scale-90 flex-shrink-0"
          style={{ background: ACCENT }} title="Alle Emojis">
          <SmilePlus className="size-4" />
        </button>
        {suggestions.map(e => (
          <button key={e} onClick={() => onToggle(post.id, e)} title="Reagieren"
            className="inline-flex items-center justify-center rounded-full size-7 text-base leading-none hover:scale-110 transition active:scale-95"
            style={{ background: 'rgb(var(--ink-100))' }}>
            {e}
          </button>
        ))}
        <button onClick={onComment}
          className="inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-xs font-semibold text-ink-500 hover:text-ink-800 transition"
          style={{ background: 'rgb(var(--ink-100))' }}>
          <MessageCircle className="size-4" /> Kommentieren
        </button>
        {total > 0 && <span className="ml-auto text-xs text-ink-400">{total} {total === 1 ? 'Reaktion' : 'Reaktionen'}</span>}
      </div>
      {fullPicker && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setFullPicker(false)} />
          <div className="absolute z-20 bottom-full mb-2 left-0">
            <EmojiPicker onPick={e => { onToggle(post.id, e); onPick(e); setFullPicker(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function Comments({ post, open, meName, meAvatar, onAdd, onDelete }: {
  post: FeedPost;
  open: boolean;
  meName: string;
  meAvatar?: string;
  onAdd: (id: string, text: string) => void;
  onDelete: (postId: string, commentId: string) => void;
}) {
  const [text, setText] = useState('');
  if (!open && post.comments.length === 0) return null;
  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(post.id, t);
    setText('');
  }
  return (
    <div className="mt-3 space-y-2.5">
      {post.comments.map(c => (
        <div key={c.id} className="group flex items-start gap-2">
          <Avatar name={c.authorName} avatarUrl={c.authorAvatar} className="size-7" textClassName="text-[10px]" />
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-semibold text-ink-800">{c.authorName}{c.mine && <span className="text-ink-400 font-normal"> · du</span>}</span>
            <span className="text-[13px] text-ink-600"> {c.text}</span>
          </div>
          {c.mine && (
            <button onClick={() => onDelete(post.id, c.id)} className="text-ink-300 hover:text-rose-500 transition opacity-0 group-hover:opacity-100" title="Kommentar löschen">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {open && (
        <div className="flex items-center gap-2 pt-0.5">
          <Avatar name={meName} avatarUrl={meAvatar} className="size-7" textClassName="text-[10px]" />
          <div className="flex-1 flex items-center gap-1.5 rounded-full bg-ink-100 pl-3 pr-1 py-1">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Kommentieren …" className="flex-1 bg-transparent text-[13px] outline-none text-ink-800 placeholder:text-ink-400" />
            <button onClick={submit} disabled={!text.trim()}
              className="size-7 grid place-items-center rounded-full text-white disabled:opacity-40 transition active:scale-90"
              style={{ background: ACCENT }}>
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Post-Karte ─────────────────────────────────────────────────────────────

function PostCard({ post, meName, meAvatar, quickEmojis, onToggle, onPick, onComment, onDeleteComment, onDeletePost }: {
  post: FeedPost;
  meName: string;
  meAvatar?: string;
  quickEmojis: string[];
  onToggle: (id: string, emoji: string) => void;
  onPick: (emoji: string) => void;
  onComment: (id: string, text: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onDeletePost: (id: string) => void;
}) {
  const [openC, setOpenC] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <Avatar name={post.authorName} avatarUrl={post.authorAvatar} className="size-10" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-900 truncate">{post.authorName}{post.mine && <span className="text-ink-400 font-normal"> · du</span>}</div>
          <div className="text-xs text-ink-400">{timeAgo(post.createdAt)}</div>
        </div>
        {post.subject && <SubjectChip name={post.subject} color={post.subjectColor} />}
        {post.mine && (
          <div className="relative">
            <button onClick={() => setMenu(v => !v)} className="text-ink-400 hover:text-ink-700"><MoreHorizontal className="size-5" /></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 glass-strong rounded-2xl shadow-soft p-1 min-w-[140px]">
                  <button onClick={() => { setMenu(false); onDeletePost(post.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-rose-600 hover:bg-ink-100 transition">
                    <Trash2 className="size-4" />Löschen
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {post.caption && <p className="px-4 pb-3 text-[15px] text-ink-700 leading-snug whitespace-pre-wrap break-words">{post.caption}</p>}
      {post.photoUrl ? (
        <div className="relative">
          <img src={post.photoUrl} alt="" className="w-full max-h-[600px] object-cover" loading="lazy" />
          {post.studyMin > 0 && <div className="absolute top-3 left-3"><StudyBadge min={post.studyMin} streak={post.streak} floating /></div>}
        </div>
      ) : (
        post.studyMin > 0 && <div className="px-4 pb-1"><StudyBadge min={post.studyMin} streak={post.streak} /></div>
      )}
      <div className="p-3.5">
        <ReactionRow post={post} quickEmojis={quickEmojis} onToggle={onToggle} onPick={onPick} onComment={() => setOpenC(v => !v)} />
        <Comments post={post} open={openC} meName={meName} meAvatar={meAvatar} onAdd={onComment} onDelete={onDeleteComment} />
      </div>
    </div>
  );
}

// ─── Composer ───────────────────────────────────────────────────────────────

function Composer({ open, setOpen, onCreated, meName, meAvatar, todayMin, streak }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onCreated: (p: FeedPost) => void;
  meName: string;
  meAvatar?: string;
  todayMin: number;
  streak: number;
}) {
  const subjects = useStore(s => s.subjects);
  const friends = useStore(s => s.friends);

  const [step, setStep] = useState<'compose' | 'audience'>('compose');
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [attach, setAttach] = useState(todayMin > 0);
  const [audience, setAudience] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Beim Öffnen: Schritt zurücksetzen und standardmäßig alle aktuellen Freunde auswählen.
  useEffect(() => {
    if (open) { setStep('compose'); setAudience(new Set(friends.map(f => f.userId))); setErr(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setOpen(true);
  }
  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null);
  }
  function reset() {
    setText(''); clearPhoto(); setSubject(null); setStep('compose'); setOpen(false);
  }

  async function submit() {
    if (!text.trim() && !file) return;
    setBusy(true); setErr(null);
    try {
      const photoUrl = file ? await uploadPostPhoto(file) : undefined;
      const post = await createPost({
        subject,
        subjectColor: subject ? subjects.find(s => s.name === subject)?.color : undefined,
        caption: text.trim() || 'Neue Lernsession 📚',
        photoUrl,
        studyMin: attach ? Math.max(0, todayMin) : 0,
        streak: attach ? streak : 0,
      }, [...audience]);
      onCreated(post);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!text.trim() && !file) return;
    if (friends.length === 0) { void submit(); return; } // niemand auszuwählen → direkt posten
    setStep('audience');
  }

  if (!open) {
    return (
      <div className="card !p-3 flex items-center gap-3">
        <Avatar name={meName} avatarUrl={meAvatar} className="size-10" />
        <button onClick={() => setOpen(true)} className="flex-1 text-left text-sm text-ink-400 rounded-full bg-ink-100 px-4 py-2.5 hover:bg-ink-200 transition">
          Teile deinen Lernfortschritt …
        </button>
        <button onClick={() => fileRef.current?.click()} className="size-10 grid place-items-center rounded-full text-white flex-shrink-0 transition active:scale-90" style={{ background: ACCENT }}>
          <Camera className="size-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
    );
  }

  // ── Schritt 2: Wer darf das sehen? ──────────────────────────────────────────
  if (step === 'audience') {
    const allSelected = friends.length > 0 && audience.size === friends.length;
    function toggle(id: string) {
      setAudience(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
    }
    function toggleAll() {
      setAudience(allSelected ? new Set() : new Set(friends.map(f => f.userId)));
    }
    return (
      <div className="card !p-4">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => setStep('compose')} className="text-ink-400 hover:text-ink-700 -ml-1"><ChevronLeft className="size-5" /></button>
          <h3 className="h3">Wer darf das sehen?</h3>
          <button onClick={reset} className="ml-auto text-ink-400 hover:text-ink-700"><X className="size-5" /></button>
        </div>
        <p className="subtle mb-3">Nur ausgewählte Freunde sehen diesen Post. Wer später dazukommt, sieht ihn <span className="font-semibold">nicht</span>.</p>

        <button onClick={toggleAll} className="w-full flex items-center gap-3 rounded-2xl p-2.5 mb-1 transition hover:bg-ink-50">
          <span className="size-9 rounded-full theme-gradient grid place-items-center text-white flex-shrink-0"><Globe2 className="size-4.5" /></span>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold text-ink-800">Alle Freunde</div>
            <div className="text-[11px] text-ink-500">{friends.length} {friends.length === 1 ? 'Freund' : 'Freunde'}</div>
          </div>
          <Check className={`size-5 ${allSelected ? 'text-theme' : 'text-ink-300'}`} strokeWidth={3} />
        </button>

        <div className="max-h-[280px] overflow-auto -mx-1 px-1 space-y-1">
          {friends.map(f => {
            const on = audience.has(f.userId);
            return (
              <button key={f.userId} onClick={() => toggle(f.userId)} className="w-full flex items-center gap-3 rounded-2xl p-2 transition hover:bg-ink-50">
                <Avatar name={f.displayName} avatarUrl={f.avatarUrl} className="size-9" textClassName="text-xs" />
                <div className="flex-1 min-w-0 text-left text-sm font-semibold text-ink-800 truncate">{f.displayName}</div>
                <span className={`size-5 rounded-md grid place-items-center flex-shrink-0 transition ${on ? 'theme-gradient' : 'border-2 border-ink-300'}`}>
                  {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>

        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-ink-500 flex-1">{audience.size === 0 ? 'Nur du siehst diesen Post' : `${audience.size} ausgewählt`}</span>
          <button onClick={submit} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{busy ? 'Wird gepostet …' : 'Posten'}
          </button>
        </div>
      </div>
    );
  }

  // ── Schritt 1: Verfassen ────────────────────────────────────────────────────
  return (
    <div className="card !p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <Avatar name={meName} avatarUrl={meAvatar} className="size-9" />
        <div className="text-sm font-semibold text-ink-800">{meName}</div>
        <button onClick={reset} className="ml-auto text-ink-400 hover:text-ink-700"><X className="size-5" /></button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} autoFocus rows={2}
        placeholder="Was lernst du gerade? Wie läuft's?"
        className="w-full resize-none text-[15px] text-ink-800 placeholder:text-ink-400 outline-none bg-transparent" />

      <div className="mt-2">
        {preview ? (
          <div className="relative rounded-2xl overflow-hidden bg-ink-100">
            <img src={preview} alt="" className="w-full max-h-[420px] object-contain" />
            <button onClick={clearPhoto} className="absolute top-2 right-2 size-8 grid place-items-center rounded-full bg-black/45 text-white backdrop-blur"><X className="size-4" /></button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-ink-200 hover:border-theme/50 transition py-5 grid place-items-center text-ink-400 hover:text-theme">
            <div className="flex flex-col items-center gap-1">
              <ImageIcon className="size-6" />
              <span className="text-xs font-medium">Lern-Foto hinzufügen (optional)</span>
            </div>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">Fach (optional)</div>
        {subjects.length === 0 ? (
          <p className="text-xs text-ink-400">Du hast noch keine Fächer angelegt.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {subjects.map(s => (
              <button key={s.id} onClick={() => setSubject(v => v === s.name ? null : s.name)} className="transition active:scale-95" style={{ opacity: subject === s.name ? 1 : 0.55 }}>
                <SubjectChip name={s.name} color={s.color} solid={subject === s.name} />
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={() => setAttach(v => !v)}
        className="mt-3 w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition"
        style={{ background: attach ? ACCENT_SOFT : 'rgb(var(--ink-100))' }}>
        <span className="size-8 grid place-items-center rounded-full text-white flex-shrink-0" style={{ background: ACCENT }}><Clock className="size-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink-800">Lernsession anhängen</div>
          <div className="text-[11px] text-ink-500">Heute {fmtMin(Math.max(0, todayMin))}{streak > 0 ? ` · ${streak} Tage Streak 🔥` : ''}</div>
        </div>
        <span className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${attach ? 'theme-gradient' : 'bg-ink-200'}`}>
          <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${attach ? 'translate-x-5' : ''}`} />
        </span>
      </button>

      {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}

      <div className="mt-3">
        <button onClick={next} disabled={busy || (!text.trim() && !file)} className="btn-primary w-full disabled:opacity-50">
          {friends.length === 0
            ? (busy ? <><Loader2 className="size-4 animate-spin" />Wird gepostet …</> : <><Send className="size-4" />Posten</>)
            : <>Weiter · Sichtbarkeit<ChevronLeft className="size-4 rotate-180" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Profil-Karte (kompakt) ─────────────────────────────────────────────────

function ProfileCard() {
  const myProfile = useStore(s => s.myProfile);
  const settings = useStore(s => s.settings);
  const [copied, setCopied] = useState(false);
  const name = myProfile?.displayName ?? settings?.name ?? 'Ich';
  const avatar = myProfile?.avatarUrl ?? settings?.avatarUrl;

  function copy() {
    if (!myProfile?.friendCode) return;
    navigator.clipboard.writeText(myProfile.friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Avatar name={name} avatarUrl={avatar} className="size-16" textClassName="text-xl" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg text-ink-900 truncate">{name}</div>
          {settings?.school && <div className="text-xs text-ink-500 truncate">{settings.school}</div>}
        </div>
      </div>
      {myProfile?.friendCode && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">Dein Freundecode</div>
          <button onClick={copy} className="w-full flex items-center justify-between gap-2 rounded-2xl theme-gradient-soft border border-theme/20 px-4 py-3 hover:border-theme/40 transition">
            <span className="font-mono text-xl font-bold tracking-[0.2em] text-theme-deep">{myProfile.friendCode}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-theme-deep">
              {copied ? <><Check className="size-4" />Kopiert</> : <><Copy className="size-4" />Kopieren</>}
            </span>
          </button>
        </div>
      )}
      <Link to="/einstellungen?section=friends" className="btn-soft w-full mt-3 text-sm"><Users className="size-4" />Freunde verwalten</Link>
    </Card>
  );
}

// ─── Anfragen ───────────────────────────────────────────────────────────────

function RequestsCard() {
  const incoming = useStore(s => s.incomingRequests);
  const accept = useStore(s => s.acceptFriendRequest);
  const decline = useStore(s => s.declineFriendRequest);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: (id: string) => Promise<void>) {
    setBusyId(id);
    try { await fn(id); } finally { setBusyId(null); }
  }

  if (incoming.length === 0) return null;
  return (
    <Card>
      <h3 className="h3 mb-3 flex items-center gap-2"><Inbox className="size-5 text-theme" />Anfragen<span className="chip">{incoming.length}</span></h3>
      <ul className="space-y-2">
        {incoming.map(r => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-[rgb(var(--surface-rgb))] p-2">
            <Avatar name={r.displayName} avatarUrl={r.avatarUrl} className="size-9" textClassName="text-xs" />
            <div className="flex-1 min-w-0 text-sm font-semibold text-ink-800 truncate">{r.displayName}</div>
            <button onClick={() => run(r.id, accept)} disabled={busyId === r.id} className="btn-primary !px-2.5 !py-1.5 text-xs" title="Annehmen">
              {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </button>
            <button onClick={() => run(r.id, decline)} disabled={busyId === r.id} className="btn-soft text-rose-600 !px-2.5 !py-1.5 text-xs" title="Ablehnen">
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Vorausgewählte Emojis (zuletzt benutzt) ────────────────────────────────

const QUICK_COUNT = 6;
const QUICK_KEY = 'reactionQuickEmojis';

function loadQuickEmojis(): string[] {
  try {
    const raw = localStorage.getItem(QUICK_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr.slice(0, QUICK_COUNT);
    }
  } catch { /* ignorieren – Standard nehmen */ }
  return QUICK_EMOJI.slice(0, QUICK_COUNT);
}

// Hält die vorausgewählten Emojis und schiebt ein neu gewähltes nach vorne,
// das älteste fällt hinten raus. Wird im localStorage gemerkt.
function useQuickEmojis() {
  const [list, setList] = useState<string[]>(loadQuickEmojis);
  const remember = useCallback((emoji: string) => {
    setList(prev => {
      const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, QUICK_COUNT);
      if (next.length === prev.length && next.every((e, i) => e === prev[i])) return prev;
      try { localStorage.setItem(QUICK_KEY, JSON.stringify(next)); } catch { /* ignorieren */ }
      return next;
    });
  }, []);
  return [list, remember] as const;
}

// ─── Feed-Hook ──────────────────────────────────────────────────────────────

function useSocialFeed(authUserId: string | undefined) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!authUserId) { setPosts([]); return; }
    setLoading(true); setError(null);
    try {
      setPosts(await fetchFeed());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => { void reload(); }, [reload]);

  return { posts, setPosts, loading, error, reload };
}

// ─── Seite ──────────────────────────────────────────────────────────────────

export function SocialPage() {
  const authUser = useStore(s => s.authUser);
  const settings = useStore(s => s.settings);
  const myProfile = useStore(s => s.myProfile);
  const friends = useStore(s => s.friends);
  const focusSessions = useStore(s => s.focusSessions);
  const flashcards = useStore(s => s.flashcards);
  const loadFriends = useStore(s => s.loadFriends);

  useEffect(() => { if (authUser) void loadFriends(); }, [authUser, loadFriends]);

  const meName = myProfile?.displayName ?? settings?.name ?? 'Du';
  const meAvatar = myProfile?.avatarUrl ?? settings?.avatarUrl;

  const weekStart = useMemo(() => startOfISOWeek(Date.now()), []);
  const weekTotalMs = useMemo(
    () => focusSessions.filter(f => f.startedAt >= weekStart).reduce((sum, f) => sum + f.focusedMs, 0),
    [focusSessions, weekStart],
  );
  const todayMin = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const ms = focusSessions.filter(f => f.startedAt >= start.getTime()).reduce((s, f) => s + f.focusedMs, 0);
    return Math.round(ms / 60000);
  }, [focusSessions]);
  const myStreak = useMemo(
    () => computeStreak([...focusSessions, ...flashcardActivity(flashcards)]),
    [focusSessions, flashcards],
  );

  const { posts, setPosts, loading, error, reload } = useSocialFeed(authUser?.id);
  const [composerOpen, setComposerOpen] = useState(false);
  const [quickEmojis, rememberEmoji] = useQuickEmojis();

  function onCreated(p: FeedPost) {
    setPosts(ps => [p, ...ps]);
  }

  function toggleReaction(postId: string, emoji: string) {
    const cur = posts.find(p => p.id === postId)?.myReaction ?? null;
    setPosts(ps => ps.map(p => {
      if (p.id !== postId) return p;
      const reactions = { ...p.reactions };
      if (p.myReaction && reactions[p.myReaction]) { reactions[p.myReaction] -= 1; if (reactions[p.myReaction] <= 0) delete reactions[p.myReaction]; }
      let mine: string | null = null;
      if (p.myReaction !== emoji) { reactions[emoji] = (reactions[emoji] ?? 0) + 1; mine = emoji; }
      return { ...p, reactions, myReaction: mine };
    }));
    setReaction(postId, emoji, cur).catch(() => void reload());
  }

  async function comment(postId: string, text: string) {
    try {
      const c = await addComment(postId, text);
      setPosts(ps => ps.map(p => p.id === postId ? { ...p, comments: [...p.comments, c] } : p));
    } catch { void reload(); }
  }

  function removeComment(postId: string, commentId: string) {
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, comments: p.comments.filter(c => c.id !== commentId) } : p));
    deleteComment(commentId).catch(() => void reload());
  }

  function removePost(postId: string) {
    setPosts(ps => ps.filter(p => p.id !== postId));
    deletePost(postId).catch(() => void reload());
  }

  const community = (
    <>
      <ProfileCard />
      <StudyLeaderboard weekTotalMs={weekTotalMs} weekStart={weekStart} podium delay={0} />
      <FriendsList />
      <RequestsCard />
    </>
  );

  return (
    <PageShell
      title={<span className="flex items-center gap-2.5">Socials <Sparkles className="size-6 text-theme" /></span>}
      subtitle="Zeig, wie du lernst – und feuert euch gegenseitig an."
      actions={authUser ? (
        <div className="flex items-center gap-2">
          <button onClick={() => void reload()} disabled={loading} className="btn-ghost !px-3" title="Aktualisieren">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setComposerOpen(true)} className="btn-primary"><Camera className="size-4" />Posten</button>
        </div>
      ) : undefined}
    >
      {!authUser ? (
        <div className="max-w-xl">
          <div className="mb-3 rounded-2xl theme-gradient-soft border border-theme/20 p-4 text-sm text-ink-700">
            Melde dich an, um deinen Lern-Feed mit Freunden zu teilen, auf Posts zu reagieren und euch in der Rangliste zu vergleichen.
          </div>
          <AccountAuth />
        </div>
      ) : (
        <div className="flex justify-center gap-6">
          <div className="w-full max-w-[560px] space-y-4">
            <Composer open={composerOpen} setOpen={setComposerOpen} onCreated={onCreated} meName={meName} meAvatar={meAvatar} todayMin={todayMin} streak={myStreak} />

            {error && (
              <div className="card !p-4 text-sm text-rose-600 flex items-center justify-between gap-3">
                <span>Feed konnte nicht geladen werden.</span>
                <button onClick={() => void reload()} className="btn-soft text-xs">Erneut</button>
              </div>
            )}

            {loading && posts.length === 0 ? (
              <div className="card text-center py-10 text-sm text-ink-500"><Loader2 className="size-5 animate-spin mx-auto mb-2" />Lädt …</div>
            ) : posts.length === 0 ? (
              <div className="card text-center py-12">
                <div className="size-14 rounded-2xl theme-gradient grid place-items-center mx-auto mb-3 shadow-glow"><Sparkles className="size-7 text-white" /></div>
                <h3 className="h3 mb-1">Sei der/die Erste</h3>
                <p className="subtle max-w-xs mx-auto">Teile deinen Lernfortschritt – ein Foto vom Schreibtisch, deine Notizen oder einfach, woran du gerade arbeitest.</p>
                <button onClick={() => setComposerOpen(true)} className="btn-primary mt-4"><Camera className="size-4" />Ersten Post teilen</button>
                {friends.length === 0 && (
                  <p className="text-xs text-ink-400 mt-4">Tipp: <Link to="/einstellungen?section=friends" className="text-theme-deep font-semibold">Füge Freunde hinzu</Link>, um auch ihre Posts zu sehen.</p>
                )}
              </div>
            ) : (
              posts.map(p => (
                <PostCard key={p.id} post={p} meName={meName} meAvatar={meAvatar} quickEmojis={quickEmojis}
                  onToggle={toggleReaction} onPick={rememberEmoji} onComment={comment} onDeleteComment={removeComment} onDeletePost={removePost} />
              ))
            )}

            <div className="lg:hidden space-y-4">{community}</div>
          </div>
          <aside className="hidden lg:block w-[330px] flex-shrink-0">
            <div className="space-y-4">{community}</div>
          </aside>
        </div>
      )}
    </PageShell>
  );
}
