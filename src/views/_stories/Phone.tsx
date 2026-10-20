// Story frames (Storybook only). A 402 × 874 phone screen; `transform` makes it the containing block for the
// app's position:fixed layers, so a reader page or sheet stays inside the frame. Square corners: a rounded
// frame would clip the components' own (square) bottom edges and look like part of their design.
import type { CSSProperties, ReactNode } from 'react';
import { LINES } from './fixtures.ts';

export function Phone({ children, bg = 'var(--paper)' }: { children: ReactNode; bg?: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: 'rgba(127,127,127,.12)' }}>
      <div style={{ position: 'relative', width: 402, height: 874, overflow: 'hidden', transform: 'translateZ(0)', background: bg, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Blur, fade and 夜读 accent of a line `d` rows from the focus band, like the engine paints it (full
 * tier, defaults). The accent is `--reader-accent`, which is the plain ink in 纸白.
 */
function look(d: number, sharpAll: boolean, lit = false): CSSProperties {
  if (lit) return { filter: 'none', opacity: 1, color: 'var(--reader-accent)' };
  if (sharpAll) return { filter: 'none', opacity: 1 };
  if (d <= 0) return { filter: 'none', opacity: 1, color: 'var(--reader-accent)' };
  const t = Math.min(1, d / 6);
  return { filter: `blur(${(7 * t).toFixed(1)}px)`, opacity: 1 - 0.85 * t };
}

/** While 带读 plays: only the lit lines are sharp and coloured; the rest one step deeper. */
function guided(d: number, lit: boolean): CSSProperties {
  if (lit) return look(0, false, true);
  const t = Math.min(1, Math.max(0, d) / 6 + 0.18);
  return { filter: `blur(${(9 * t).toFixed(1)}px)`, opacity: 1 - 0.92 * t };
}

/**
 * A still reader page (4a): eyebrow, masks and Gatsby's opening lines, as the engine lays them out.
 * Lines `band[0]..band[1]` are sharp; `gapAfter` opens a drawer host under that line (its `children`);
 * `hl` marks one word on a line, as the reader does while that word's drawer is open.
 */
export function ReaderPage({ band = [0, 7], gapAfter, hl, sharp = false, lit, children, overlay, style }: {
  band?: [number, number]; gapAfter?: number; hl?: { line: number; word: string }; sharp?: boolean;
  /** 带读: the lit sentence's lines (first, last). */
  lit?: [number, number];
  children?: ReactNode; overlay?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div className={sharp ? 'rd-page rd-clear' : 'rd-page'} style={{ '--focus-pct': 30, '--blur-max': '7px', ...style } as CSSProperties}>
      <div className="rd-scroll" style={{ paddingTop: 300 }}>
        <div className="rd-content">
          <div className="rd-head" style={{ ...look(band[0] + 2, sharp) }}>Chapter I</div>
          <div className="rd-blank" />
          {LINES.map((text, i) => {
            const d = i < band[0] ? band[0] - i : i - band[1];
            const line = !text ? <div key={i} className="rd-blank" /> : (
              <div key={i} className={i === gapAfter ? 'rd-line rd-gapline' : 'rd-line'}
                style={lit ? guided(d, i >= lit[0] && i <= lit[1]) : look(d, sharp)}>
                {hl && hl.line === i ? withHighlight(text, hl.word) : text}
              </div>
            );
            return i === gapAfter
              ? [line, <div key={`gap${i}`} className="rd-gap">{children}</div>]
              : line;
          })}
        </div>
      </div>
      <div className="rd-mask rd-mask-top" />
      <div className="rd-mask rd-mask-bottom" />
      <div className="rd-vignette" />
      <div className="rd-eyebrow"><span className="rd-eyebrow-chapter">Chapter I</span><span className="rd-eyebrow-pct">1%</span></div>
      {overlay}
    </div>
  );
}

function withHighlight(text: string, word: string): ReactNode {
  const at = text.indexOf(word);
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="rd-hl">{word}</span>{text.slice(at + word.length)}</>;
}

/** A Home screen around a card or row: the `.home` root (fonts, --sec) and Home's own scroll padding. */
export function HomeScreen({ children }: { children: ReactNode }) {
  return (
    <Phone bg="var(--home-bg)">
      <div className="home"><div className="home-scroll">{children}</div></div>
    </Phone>
  );
}
