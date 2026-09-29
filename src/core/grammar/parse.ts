/** One sentence's grammar notes: the overall pattern, then labelled points. */
export interface Grammar { pattern: string; points: { label: string; text: string }[] }

/** The line still being written, shaped for display with a caret. */
export type Pending = { kind: 'pattern'; text: string } | { kind: 'point'; label: string; text: string };

export interface ParsedGrammar extends Grammar { pending: Pending | null }

/** The prompt allows five points; the drawer scrolls inside when they run long. */
export const MAX_POINTS = 5;

const PATTERN = /^句型\s*[：:]\s*(.*)$/;
const BAR = /\s*[｜|]\s*/;

/** Leading list marks and Markdown bold, which the prompt forbids but a model may still write. */
function clean(line: string): string {
  return line.replace(/\*\*/g, '').replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim();
}

/**
 * Parses the prompt's line format ("句型：…", then "标签｜说明" per line) from a stream prefix.
 * Finished lines become the pattern and points; the unfinished last line is `pending`. With
 * `final`, every line is finished, unless `truncated` (the token limit cut the answer): then the
 * last line, which never got its newline, is dropped.
 */
export function parseGrammar(text: string, opts: { final?: boolean; truncated?: boolean } = {}): ParsedGrammar {
  const lines = text.split('\n');
  const open = !opts.final || (opts.truncated && !text.endsWith('\n')) ? lines.pop() ?? '' : '';
  const out: ParsedGrammar = { pattern: '', points: [], pending: null };
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const m = PATTERN.exec(line);
    if (m) {
      if (!out.pattern && m[1]) out.pattern = m[1].trim();
      continue;
    }
    const [label, ...rest] = line.split(BAR);
    const body = rest.join('｜').trim();
    if (rest.length && label && body && out.points.length < MAX_POINTS) out.points.push({ label, text: body });
  }
  if (!opts.final) out.pending = pendingOf(clean(open), out);
  return out;
}

function pendingOf(line: string, g: Grammar): Pending | null {
  if (!line) return null;
  const m = PATTERN.exec(line);
  if (m) return g.pattern ? null : { kind: 'pattern', text: m[1]!.trim() };
  if (g.points.length >= MAX_POINTS) return null;
  const [label, ...rest] = line.split(BAR);
  if (rest.length) return { kind: 'point', label: label!, text: rest.join('｜').trim() };
  // A label being typed ("定语从"); anything longer is chatter that will be ignored.
  return line.length <= 6 && !line.startsWith('句') ? { kind: 'point', label: line, text: '' } : null;
}

/** A finished answer is worth showing and keeping only with a pattern and at least one point. */
export function isUsable(g: Grammar): boolean {
  return g.pattern.length > 0 && g.points.length > 0;
}
