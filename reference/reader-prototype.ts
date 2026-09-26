/**
 * Logic extracted from the prototype (design/聚焦阅读 App.dc.html, option 4a),
 * lightly cleaned. It is a behavioural reference; it is NOT production code.
 * The prototype reads layout per line every frame. Production must use a
 * cached line table instead (see README → Focus band → Performance).
 */

export const EASE = "cubic-bezier(.42,0,.58,1)";
export const OPEN_MS = 330;
export const CLOSE_MS = 250;
export const CONTENT_MS = 250;

// ---------- Focus band ----------
export function paintFocusBand(scroller: HTMLElement, opts: { focusPct?: number; blurMax?: number; sentenceMode?: boolean; currentSentenceLines?: Set<number> }) {
  const box = scroller.getBoundingClientRect();
  if (!box.height) return;
  const pct = Math.min(90, Math.max(10, opts.focusPct ?? 30));
  const half = (box.height * pct) / 200;
  const ramp = Math.max(1, box.height / 2 - half);
  const bmax = opts.blurMax ?? 7;
  const mid = box.top + box.height / 2;

  scroller.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!el.textContent?.trim() || !b.height) { el.style.opacity = "0"; el.style.filter = "none"; return; }
    const d = Math.abs(b.top + b.height / 2 - mid);
    let t = Math.min(1, Math.max(0, (d - half) / ramp));
    if (opts.sentenceMode && !opts.currentSentenceLines?.has(Number(el.dataset.li))) t = Math.min(1, t + 0.18);
    el.style.filter = `blur(${(bmax * t).toFixed(2)}px)`;   // production: quantise to 0.5px, write only on change
    el.style.opacity = (1 - 0.85 * t).toFixed(3);
  });

  const pctRead = Math.round((100 * scroller.scrollTop) / Math.max(1, scroller.scrollHeight - scroller.clientHeight));
  return Math.max(1, pctRead); // shown in the chapter eyebrow
}

// ---------- Scroll binding + drawer close-on-scroll ----------
export function bindReader(scroller: HTMLElement, api: {
  isDrawerOpen: () => boolean; isClosing: () => boolean; closeDrawer: () => void; paint: () => void;
}) {
  let tick = false, userScroll = 0, lockUntil = 0;
  const guard = (ev: Event) => {
    if (api.isDrawerOpen()) {            // the first gesture only closes the drawer
      ev.preventDefault();
      if (!api.isClosing()) { api.closeDrawer(); lockUntil = Date.now() + CLOSE_MS; }
      return;
    }
    if (Date.now() < lockUntil) { ev.preventDefault(); return; }  // prevents a jump during the collapse
    userScroll = Date.now();
  };
  scroller.addEventListener("wheel", guard, { passive: false });
  scroller.addEventListener("touchmove", guard, { passive: false });
  scroller.addEventListener("scroll", () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      tick = false;
      api.paint();
      if (Date.now() - userScroll < 500 && api.isDrawerOpen()) api.closeDrawer();
    });
  }, { passive: true });
}

// ---------- Drawer placement ----------
/** Horizontal centre of the tapped word inside the phone, clamped, used as X in the notch clip-paths. */
export function caretX(word: DOMRect, phone: DOMRect) {
  return Math.min(Math.max(16, word.left + word.width / 2 - phone.left), phone.width - 16);
}

/** After opening: scroll so the drawer's bottom stays 70px above the container bottom. */
export function keepDrawerOnScreen(scroller: HTMLElement, drawer: HTMLElement) {
  const rb = scroller.getBoundingClientRect();
  const db = drawer.getBoundingClientRect();
  const over = db.bottom - (rb.bottom - 70);
  if (over > 8) scroller.scrollTo({ top: scroller.scrollTop + over, behavior: "smooth" });
}

export const notchTop = (x: string) =>
  `polygon(0 0,100% 0,100% 16px,calc(${x} + 12px) 16px,${x} 4px,calc(${x} - 12px) 16px,0 16px)`;
export const notchBottom = (x: string) =>
  `polygon(calc(${x} - 12px) 16px,${x} 0,calc(${x} + 12px) 16px)`;

export const drawerAnim = (closing: boolean) => closing
  ? { drawer: `collapseG ${CLOSE_MS}ms ${EASE} both`, content: `fadeOut ${Math.round(CLOSE_MS * 0.55)}ms ${EASE} both` }
  : { drawer: `splitG ${OPEN_MS}ms ${EASE} both`, content: `riseIn ${CONTENT_MS}ms 0ms ${EASE} both` };

// ---------- Tap: close-then-open ----------
export function onWordTap(word: { lineIndex: number; text: string }, cur: { lineIndex: number; text: string; closing: boolean } | null,
  open: () => void, close: () => void) {
  if (cur && !cur.closing) {
    const same = cur.lineIndex === word.lineIndex && cur.text === word.text;
    close();
    if (!same) setTimeout(open, CLOSE_MS);
    return;
  }
  open();
}

export const normaliseWord = (s: string) => s.trim().replace(/[^A-Za-z'’-]/g, "");

// ---------- Footnotes ----------
/** The prototype matched on the lowercased surface form; production matches on lemma. */
export function footnoteFor(lemma: string, seen: Set<string>, glossZh: (l: string) => string | undefined) {
  return seen.has(lemma) ? glossZh(lemma) ?? "" : "";
}

/* Markup reference (4a), as used in the prototype:

<div data-line data-li={i} style="font:19.5px/34px Newsreader;height:34px;color:#221f1b;position:relative;z-index:5;will-change:filter,opacity">
  <span data-w="word" style="position:relative;z-index:6;cursor:pointer">word
    <span class="footnote" style="position:absolute;left:0;top:23px;font:500 9px/1 'PingFang SC','Noto Sans SC',sans-serif;
      letter-spacing:.04em;color:rgba(34,31,27,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;pointer-events:none">林线</span>
  </span>
</div>

<!-- drawer, inserted right after the tapped line -->
<div style="position:relative;margin:5px -34px 7px">
  <div data-drawer style="display:grid;grid-template-rows:0fr;overflow:hidden;padding:0 34px;animation:splitG 330ms …;
       background:#2c2620;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.022) 0 2px,rgba(0,0,0,.028) 2px 4px),linear-gradient(#332c25,#241f1a);
       box-shadow:inset 0 10px 13px -8px rgba(0,0,0,.95),inset 0 -10px 13px -8px rgba(0,0,0,.95),inset 0 1px 0 rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.55)">
    <div style="overflow:hidden;min-height:0"><div style="padding:26px 0 27px;animation:riseIn 250ms …"> …head / definition / Save… </div></div>
  </div>
  <div style="position:absolute;left:0;right:0;top:-4px;height:16px;background:#faf8f3;z-index:3;clip-path:notchTop(X);filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.5))"></div>
  <div style="position:absolute;left:0;right:0;bottom:-4px;height:16px;background:#faf8f3;z-index:4;clip-path:notchBottom(X);filter:drop-shadow(0 -1px 1.4px rgba(0,0,0,.45))"></div>
</div>
*/
