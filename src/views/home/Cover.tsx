import { COVER_PALETTE } from '../../core/library/bundled.ts';

/** EPUB cover image, else a flat colour block from hash(title) % 8 (no texture). */
export function Cover({ src, color, className }: { src: string | null; color: number; className?: string }) {
  const bg = COVER_PALETTE[color % COVER_PALETTE.length];
  return (
    <div className={className ? `cover ${className}` : 'cover'} style={{ background: bg }} data-cover>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );
}
