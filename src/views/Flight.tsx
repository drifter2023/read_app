import type { CSSProperties } from 'react';
import { COVER_PALETTE } from '../core/library/bundled.ts';
import { EASE, MOTION } from '../core/motion.ts';

/** H-04 phases: at the cover → pulled out 30px → full screen → cover fading (page) → flying back. */
export type FlyPhase = 'spine' | 'out' | 'full' | 'page' | 'back';
export interface Fly {
  rect: { left: number; top: number; width: number; height: number };
  phase: FlyPhase; title: string; author: string; cover: string | null; color: number;
}

/** The open-book flight layer (README → Open-book transition). */
export function Flight({ fly }: { fly: Fly }) {
  const { rect, phase } = fly;
  const t = (ms: number) => ['left', 'top', 'width', 'height', 'border-radius'].map((p) => `${p} ${ms}ms ${EASE}`).join(',');
  let style: CSSProperties;
  if (phase === 'full' || phase === 'page') {
    style = { left: 0, top: 0, width: '100%', height: '100%', borderRadius: 0, transition: t(MOTION.bookExpand) };
  } else {
    const top = phase === 'out' ? rect.top - 30 : rect.top;
    const ms = phase === 'out' ? MOTION.bookOut : phase === 'back' ? MOTION.bookBack : 0;
    style = { left: rect.left, top, width: rect.width, height: rect.height, borderRadius: '2px 3px 3px 2px', transition: t(ms) };
  }
  const coverOpacity = phase === 'page' ? 0 : 1;
  return (
    <div className="fly" style={style} data-testid="flight" data-phase={phase} aria-hidden="true">
      <div className="fly-cover" style={{ opacity: coverOpacity, transition: `opacity ${MOTION.coverFade}ms ${EASE}`, background: COVER_PALETTE[fly.color % 8] }}>
        {fly.cover ? (
          <img src={fly.cover} alt="" />
        ) : (
          <div className="fly-text">
            <i className="fly-rule" />
            <div className="fly-title">{fly.title}</div>
            <div className="fly-author">{fly.author}</div>
          </div>
        )}
      </div>
    </div>
  );
}
