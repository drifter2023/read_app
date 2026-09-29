// Sends one long sentence through every prompt in prompts.ts and writes a side-by-side report.
// Usage: put DEEPSEEK_API_KEY=sk-… in .env.local (gitignored), then `node scripts/prompt-lab/run.ts`.
// The key is read from the environment or .env.local and never printed or written anywhere.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DEEPSEEK, MODEL } from '../../src/core/ai/deepseek.ts';
import { userMessage } from '../../src/core/grammar/prompt.ts';
import { VARIANTS, type Variant } from './prompts.ts';

const PREV = 'Only Gatsby, the man who gives his name to this book, was exempt from my reaction—Gatsby, who represented everything for which I have an unaffected scorn.';
const TARGET = 'If personality is an unbroken series of successful gestures, then there was something gorgeous about him, some heightened sensitivity to the promises of life, as if he were related to one of those intricate machines that register earthquakes ten thousand miles away.';
const REPEATS = 2;
/** DeepSeek suggests 1.3 for translation; the app uses 0.5. B is also tried at 1.3. */
const RUNS: { variant: Variant; temperature: number }[] = [
  ...VARIANTS.map((variant) => ({ variant, temperature: 0.5 })),
  { variant: VARIANTS.find((v) => v.id === 'B')!, temperature: 1.3 },
];
const OUT = 'docs/prompt-lab/2026-09-29-translation.md';

async function key(): Promise<string> {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const env = await readFile('.env.local', 'utf8').catch(() => '');
  const m = /^DEEPSEEK_API_KEY=(.+)$/m.exec(env);
  if (!m) throw new Error('No key: add DEEPSEEK_API_KEY=… to .env.local');
  return m[1]!.trim().replace(/^["']|["']$/g, '');
}

interface Result { text: string; ms: number; input: number; output: number; finish: string }

async function ask(k: string, system: string, temperature: number): Promise<Result> {
  const t0 = performance.now();
  const res = await fetch(`${DEEPSEEK}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, stream: false, thinking: { type: 'disabled' }, max_tokens: 900, temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage(PREV, TARGET) }],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`); // status only: the body could echo request details
  const j = await res.json() as { choices: { message: { content: string }; finish_reason: string }[]; usage: { prompt_tokens: number; completion_tokens: number } };
  return { text: j.choices[0]!.message.content.trim(), ms: Math.round(performance.now() - t0), input: j.usage.prompt_tokens, output: j.usage.completion_tokens, finish: j.choices[0]!.finish_reason };
}

const k = await key();
const lines: string[] = [
  '# Prompt lab: grammar analysis with a sentence translation',
  '',
  `Model \`${MODEL}\`, thinking off, max_tokens 900. Each prompt ran ${REPEATS}× on the same sentence. Prompts: \`scripts/prompt-lab/prompts.ts\`.`,
  '',
  `**前一句：** ${PREV}`,
  '',
  `**目标句：** ${TARGET}`,
  '',
];
for (const { variant, temperature } of RUNS) {
  lines.push(`## ${variant.id} · ${variant.name} · temperature ${temperature}`, '', variant.idea, '');
  for (let i = 1; i <= REPEATS; i++) {
    process.stdout.write(`${variant.id} t=${temperature} run ${i}… `);
    try {
      const r = await ask(k, variant.system, temperature);
      console.log(`${r.ms} ms, ${r.output} tokens out`);
      lines.push(`### Run ${i} — ${r.ms} ms · ${r.input} in / ${r.output} out · finish ${r.finish}`, '', '```text', r.text, '```', '');
    } catch (e) {
      console.log((e as Error).message);
      lines.push(`### Run ${i} — failed: ${(e as Error).message}`, '');
    }
  }
}
await mkdir('docs/prompt-lab', { recursive: true });
await writeFile(OUT, `${lines.join('\n')}\n`);
console.log(`Wrote ${OUT}`);
