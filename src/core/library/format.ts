/** README → Home: minutes left = remaining words ÷ 230. */
export const WORDS_PER_MINUTE = 230;

export function minutesLeft(wordCount: number, pct: number): number {
  return Math.max(0, Math.ceil((wordCount * (1 - Math.min(100, Math.max(0, pct)) / 100)) / WORDS_PER_MINUTE));
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Date eyebrow, e.g. "TUE · 9月22日". */
export function dateEyebrow(d: Date): string {
  return `${DAYS[d.getDay()]} · ${d.getMonth() + 1}月${d.getDate()}日`;
}

/** "9月26日读完" for finished books. */
export function finishedLabel(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日读完`;
}
