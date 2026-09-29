import { describe, expect, it } from 'vitest';
import { isUsable, parseGrammar } from '../../src/core/grammar/parse.ts';
import { PROMPT_VERSION, SYSTEM_PROMPT, userMessage } from '../../src/core/grammar/prompt.ts';

const ANSWER = [
  '句型：主句 + 定语从句',
  '主干｜The letter … finally arrived，arrive 不及物',
  '定语从句｜that she had been waiting for 修饰 letter',
  '时态｜had been waiting 是过去完成进行时',
].join('\n');

describe('grammar prompt v2 (G-06)', () => {
  it('is version 2 and sent verbatim', () => {
    expect(PROMPT_VERSION).toBe(2);
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });

  it('builds the user message with the previous sentence and a word count', () => {
    expect(userMessage(null, 'He looked rather pleasantly like a blond satan.')).toBe(
      '前一句：（无）\n目标句：He looked rather pleasantly like a blond satan.\n单词数：8');
    const long = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    const msg = userMessage(long, 'Yes.');
    expect(msg.split('\n')[0]).toBe(`前一句：… ${Array.from({ length: 60 }, (_, i) => `w${i + 20}`).join(' ')}`);
  });
});

describe('grammar parser (G-06)', () => {
  it('reads the pattern and the points of a finished answer', () => {
    const g = parseGrammar(ANSWER, { final: true });
    expect(g.pattern).toBe('主句 + 定语从句');
    expect(g.points.map((p) => p.label)).toEqual(['主干', '定语从句', '时态']);
    expect(g.points[1]!.text).toBe('that she had been waiting for 修饰 letter');
    expect(g.pending).toBeNull();
    expect(isUsable(g)).toBe(true);
  });

  it('parses every prefix of a stream without losing a finished point', () => {
    let done = 0;
    for (let i = 0; i <= ANSWER.length; i++) {
      const g = parseGrammar(ANSWER.slice(0, i));
      expect(g.points.length).toBeGreaterThanOrEqual(done);
      done = g.points.length;
    }
    expect(done).toBe(2); // the last line is still "pending" until the stream ends
    expect(parseGrammar(ANSWER.slice(0, ANSWER.lastIndexOf('｜') + 4)).pending).toEqual({ kind: 'point', label: '时态', text: 'had' });
    expect(parseGrammar('句型：主句 +').pending).toEqual({ kind: 'pattern', text: '主句 +' });
  });

  it('accepts a half-width bar and ignores stray lines, numbering and bold marks', () => {
    const g = parseGrammar('好的，下面是分析：\n句型：简单句\n\n1. **主干**|He looked like a satan\n以上。', { final: true });
    expect(g.pattern).toBe('简单句');
    expect(g.points).toEqual([{ label: '主干', text: 'He looked like a satan' }]);
  });

  it('keeps at most five points', () => {
    const six = ['句型：并列句', ...[1, 2, 3, 4, 5, 6].map((n) => `要点${n}｜说明${n}`)].join('\n');
    expect(parseGrammar(six, { final: true }).points).toHaveLength(5);
  });

  it('drops the cut-off last line when the answer hit the token limit', () => {
    const cut = `${ANSWER.slice(0, -6)}`;
    expect(parseGrammar(cut, { final: true, truncated: true }).points).toHaveLength(2);
    expect(parseGrammar(cut, { final: true }).points).toHaveLength(3);
  });

  it('is unusable without a pattern or without a point', () => {
    expect(isUsable(parseGrammar('主干｜x', { final: true }))).toBe(false);
    expect(isUsable(parseGrammar('句型：简单句', { final: true }))).toBe(false);
    expect(isUsable(parseGrammar('', { final: true }))).toBe(false);
  });
});
