/** A 9px footnote under a word (R-06), in paragraph-text offsets. */
export interface Footnote { start: number; end: number; text: string }
export interface Span { start: number; end: number }

/**
 * Rewrites one line's DOM: plain text, with `.rd-w` spans around footnoted or highlighted words.
 * Footnotes are absolutely positioned children of the word span, so the line box never changes.
 * Offsets are relative to the paragraph; `lineStart` maps them onto this line.
 */
export function renderLine(el: HTMLElement, text: string, lineStart: number, notes: Footnote[], hl: Span | null): void {
  const doc = el.ownerDocument;
  const marks = new Map<number, { end: number; note?: string; hl?: boolean }>();
  const lineEnd = lineStart + text.length;
  for (const n of notes) {
    const a = Math.max(n.start, lineStart);
    const b = Math.min(n.end, lineEnd);
    if (b > a) marks.set(a, { end: b, note: n.text });
  }
  if (hl) {
    const a = Math.max(hl.start, lineStart);
    const b = Math.min(hl.end, lineEnd);
    if (b > a) marks.set(a, { ...marks.get(a), end: b, hl: true });
  }
  if (!marks.size) {
    if (el.childElementCount || el.textContent !== text) el.textContent = text;
    return;
  }
  const frag = doc.createDocumentFragment();
  let at = lineStart;
  for (const a of [...marks.keys()].sort((x, y) => x - y)) {
    const m = marks.get(a)!;
    if (a < at) continue;
    if (a > at) frag.append(text.slice(at - lineStart, a - lineStart));
    const w = doc.createElement('span');
    w.className = m.hl ? 'rd-w rd-hl' : 'rd-w';
    w.textContent = text.slice(a - lineStart, m.end - lineStart);
    if (m.note) {
      const fn = doc.createElement('span');
      fn.className = 'rd-fn';
      fn.textContent = m.note;
      w.append(fn);
    }
    frag.append(w);
    at = m.end;
  }
  if (at < lineEnd) frag.append(text.slice(at - lineStart));
  el.replaceChildren(frag);
}

/** Character offset of (node, offset) within `line`, ignoring footnote text. */
export function lineOffset(line: HTMLElement, node: Node, offset: number): number {
  let n = 0;
  const walker = line.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if ((t.parentElement as HTMLElement | null)?.classList.contains('rd-fn')) {
      if (t === node) return n; // a caret inside a footnote belongs to the start of its word
      continue;
    }
    if (t === node) return n + offset;
    n += t.textContent?.length ?? 0;
  }
  if (node === line) {
    // A caret between child nodes: count the text before child `offset`.
    let k = 0;
    for (const c of Array.from(line.childNodes).slice(0, offset)) {
      k += c instanceof HTMLElement ? (c.firstChild?.textContent?.length ?? 0) : (c.textContent?.length ?? 0);
    }
    return k;
  }
  return n;
}

/** A Range over [a, b) of the line's own text (not footnotes), for measuring a tapped word. */
export function lineRange(line: HTMLElement, a: number, b: number): Range {
  const doc = line.ownerDocument;
  const r = doc.createRange();
  let n = 0;
  let started = false;
  const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if ((t.parentElement as HTMLElement | null)?.classList.contains('rd-fn')) continue;
    const len = t.textContent?.length ?? 0;
    if (!started && a <= n + len) { r.setStart(t, a - n); started = true; }
    if (started && b <= n + len) { r.setEnd(t, b - n); return r; }
    n += len;
  }
  return r;
}
