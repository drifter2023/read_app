import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { finishedLabel, minutesLeft } from '../../core/library/format.ts';
import type { ShelfBook } from '../../core/library/library.ts';
import { Cover } from './Cover.tsx';

const REVEAL = 88;

/** One shelf row (README → Home → Shelf row). Swipe left to reveal 删除 (H-05). */
export function ShelfRow({ book, open, onOpen, onDelete, onSwipe }: {
  book: ShelfBook; open: boolean;
  onOpen: (coverEl: HTMLElement) => void; onDelete: () => void; onSwipe: (open: boolean) => void;
}) {
  const coverRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; axis: 'x' | 'y' | null } | null>(null);
  const [dx, setDx] = useState<number | null>(null);
  /** The click that follows a swipe's pointerup must not open the book. */
  const swiped = useRef(false);
  const done = book.status === 'done';
  const pct = Math.round(book.pct);

  const down = (e: PointerEvent) => { swiped.current = false; drag.current = { x: e.clientX, y: e.clientY, dx: 0, axis: null }; };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.axis && Math.abs(mx) + Math.abs(my) > 8) d.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (d.axis !== 'x') return;
    d.dx = mx;
    setDx(Math.min(0, Math.max(-REVEAL * 1.3, (open ? -REVEAL : 0) + mx)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    swiped.current = true;
    const x = (open ? -REVEAL : 0) + d.dx;
    setDx(null);
    onSwipe(x < -REVEAL / 2);
  };
  const click = (e: MouseEvent) => {
    // Home closes an open row on any tap; this row handles its own taps.
    e.stopPropagation();
    if (swiped.current) { swiped.current = false; return; }
    if (open) { onSwipe(false); return; }
    onOpen(coverRef.current!);
  };

  const x = dx ?? (open ? -REVEAL : 0);
  return (
    <li className="row-wrap" data-book-id={book.id}>
      <button type="button" className="row-del" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={onDelete}>删除</button>
      <div
        className={dx === null ? 'row row-snap' : 'row'}
        style={{ transform: x ? `translateX(${x}px)` : undefined }}
        role="button"
        tabIndex={0}
        aria-label={`${book.title}，${done ? '已读完' : `已读 ${pct}%`}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={click}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(coverRef.current!); }}
      >
        <div ref={coverRef}><Cover src={book.cover} color={book.color} className="cover-row" /></div>
        <div className="row-text">
          <div className="row-title">{book.title}</div>
          <div className="row-author">{book.author}</div>
          <div className="row-meta">
            <div className="bar"><i style={{ width: `${done ? 100 : Math.max(2, pct)}%`, background: done ? 'rgba(22,21,15,.3)' : undefined }} /></div>
            <span className="row-note">
              {done && book.finishedAt ? finishedLabel(book.finishedAt) : `第 ${book.chapter + 1} 章 · 还剩 ${minutesLeft(book.wordCount, book.pct)} 分`}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
