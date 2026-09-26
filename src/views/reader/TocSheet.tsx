import { useEffect, useRef } from 'react';
import type { ChapterData } from '../../core/types.ts';
import { Sheet } from './Sheet.tsx';

/** R-10: chapter list, the current one marked in vermilion; tapping jumps to the chapter start. */
export function TocSheet({ chapters, current, open, onPick, onClose }: {
  chapters: ChapterData[]; current: number; open: boolean; onPick: (idx: number) => void; onClose: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [open]);
  return (
    <Sheet open={open} label="目录" onClose={onClose}>
      <ol className="toc" ref={listRef}>
        {chapters.map((c) => (
          <li key={c.idx}>
            <button type="button" aria-current={c.idx === current} onClick={() => onPick(c.idx)}>{c.title}</button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
