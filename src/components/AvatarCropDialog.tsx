import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { DialogShell } from '@/components/dialogs/dialogParts';
import { SIZE, QUALITY } from '@/lib/avatar';

/**
 * Profilbild zuschneiden: zeigt das gewählte Bild in einem runden Rahmen, das
 * man frei verschieben (ziehen) und zoomen (Regler / Mausrad / Pinch) kann.
 * „Übernehmen" rendert genau den sichtbaren Ausschnitt auf ein SIZE×SIZE-Canvas
 * und gibt ihn als JPEG-Blob zurück.
 *
 * Der Rahmen ist quadratisch (Storage ist quadratisch), die runde Maske dient
 * nur der Vorschau – die Avatar-Anzeige ist überall rund.
 */

/** Kantenlänge des Vorschaurahmens in Display-Pixeln. */
const FRAME = 260;
/** Maximaler Zoom-Faktor relativ zur „cover"-Größe. */
const MAX_ZOOM = 4;

export function AvatarCropDialog({ open, imageSrc, onCancel, onConfirm }: {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);           // Zoom-Faktor ≥ 1
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Bild-Verschiebung (Display-px)
  const [busy, setBusy] = useState(false);

  // Aktive Zeiger für Ziehen / Pinch.
  const drag = useRef<{ id: number; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  // Bild laden, sobald der Dialog mit einer Quelle geöffnet wird.
  useEffect(() => {
    if (!open || !imageSrc) { setImg(null); return; }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = imageSrc;
  }, [open, imageSrc]);

  // „cover"-Grundskalierung: bei scale=1 füllt das Bild den Rahmen genau.
  const baseScale = img ? FRAME / Math.min(img.width, img.height) : 1;
  const s = baseScale * scale;
  const dispW = img ? img.width * s : 0;
  const dispH = img ? img.height * s : 0;

  // Beim Laden / Zoom zentrieren bzw. Verschiebung neu einklammern.
  useEffect(() => {
    if (!img) return;
    setOffset(o => clampOffset(o, img.width * s, img.height * s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  function clampOffset(o: { x: number; y: number }, w: number, h: number) {
    // Bild muss den Rahmen vollständig füllen: -(w-FRAME) ≤ x ≤ 0
    const minX = Math.min(0, FRAME - w);
    const minY = Math.min(0, FRAME - h);
    return {
      x: Math.max(minX, Math.min(0, o.x)),
      y: Math.max(minY, Math.min(0, o.y)),
    };
  }

  function applyScale(next: number, centerX = FRAME / 2, centerY = FRAME / 2) {
    if (!img) return;
    const clamped = Math.max(1, Math.min(MAX_ZOOM, next));
    setScale(clamped);
    // Um den angegebenen Punkt herum zoomen (sonst „springt" das Bild).
    const ns = baseScale * clamped;
    setOffset(o => clampOffset({
      x: centerX - ((centerX - o.x) / s) * ns,
      y: centerY - ((centerY - o.y) / s) * ns,
    }, img.width * ns, img.height * ns));
  }

  /* ── Zeiger: Ziehen + Pinch-Zoom ─────────────────────────────────────── */
  function onPointerDown(e: ReactPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else {
      drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      applyScale(pinch.current.scale * (dist / pinch.current.dist));
      return;
    }
    if (drag.current && drag.current.id === e.pointerId && img) {
      const nx = drag.current.ox + (e.clientX - drag.current.startX);
      const ny = drag.current.oy + (e.clientY - drag.current.startY);
      setOffset(clampOffset({ x: nx, y: ny }, dispW, dispH));
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    applyScale(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  /* ── Übernehmen: sichtbaren Ausschnitt auf SIZE×SIZE rendern ──────────── */
  async function handleConfirm() {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      // Quell-Rechteck im Originalbild, das im Rahmen sichtbar ist.
      const sx = -offset.x / s;
      const sy = -offset.y / s;
      const sSide = FRAME / s;
      ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, SIZE, SIZE);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Zuschneiden fehlgeschlagen'))), 'image/jpeg', QUALITY));
      onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onCancel}
      eyebrow="Profilbild"
      title="Bild zuschneiden"
      maxWidth="md:max-w-md"
      footer={
        <>
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn-primary" disabled={busy || !img} onClick={handleConfirm}>
            {busy && <Loader2 className="size-4 animate-spin" />} Übernehmen
          </button>
        </>
      }
    >
      <p className="subtle text-sm -mt-1">Ziehen zum Verschieben, Regler oder Mausrad zum Zoomen.</p>

      <div className="flex justify-center">
        <div
          className="relative overflow-hidden rounded-full select-none bg-ink-100 touch-none"
          style={{ width: FRAME, height: FRAME, cursor: img ? 'grab' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {img ? (
            <img
              src={imageSrc!}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 max-w-none origin-top-left pointer-events-none"
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 text-ink-400 animate-spin" />
            </div>
          )}
          {/* feiner Ring als Rahmen-Andeutung */}
          <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/10 pointer-events-none" />
        </div>
      </div>

      <div className="flex items-center gap-3 px-1">
        <ZoomOut className="size-4 text-ink-400 shrink-0" />
        <input
          type="range" min={1} max={MAX_ZOOM} step={0.01} value={scale}
          disabled={!img}
          onChange={e => applyScale(parseFloat(e.target.value))}
          className="w-full accent-theme"
          aria-label="Zoom"
        />
        <ZoomIn className="size-4 text-ink-400 shrink-0" />
      </div>
    </DialogShell>
  );
}
