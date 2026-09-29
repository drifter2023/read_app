import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { loadGrammar, saveGrammar } from '../../src/core/grammar/history.ts';
import { PROMPT_VERSION } from '../../src/core/grammar/prompt.ts';
import { deleteBook, saveParsedBook } from '../../src/core/library/library.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

let db: Db;
const book = (id: string) => ({ id, title: id, author: 'A', wordCount: 2, chapters: [{ title: 'I', paras: [['Hi there.']], wordCount: 2 }] });
const ref = { bookId: 'a', chapter: 0, para: 2, sentence: 1 };
const TEXT = 'His yellow-grey eyes were horizontal.';
const G = { pattern: '主系表', points: [{ label: '主干', text: 'eyes were horizontal' }] };

beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await saveParsedBook(db, book('a'), 'epub', 0);
});

describe('grammar history (G-03)', () => {
  it('keeps an analysis per sentence and returns it for the same text', async () => {
    expect(await loadGrammar(db, ref, TEXT)).toBeNull();
    await saveGrammar(db, ref, TEXT, G);
    expect(await loadGrammar(db, ref, TEXT)).toEqual(G);
    expect(await loadGrammar(db, { ...ref, sentence: 2 }, TEXT)).toBeNull();
    const again = { ...G, pattern: '简单句' };
    await saveGrammar(db, ref, TEXT, again); // a retry replaces the old one
    expect(await loadGrammar(db, ref, TEXT)).toEqual(again);
  });

  it('misses when the sentence text changed (a re-import) or the prompt version changed', async () => {
    await saveGrammar(db, ref, TEXT, G);
    expect(await loadGrammar(db, ref, `${TEXT} `)).toBeNull();
    await db.run('UPDATE grammar SET prompt_version = ?', [PROMPT_VERSION - 1]);
    expect(await loadGrammar(db, ref, TEXT)).toBeNull();
  });

  it('goes with its book', async () => {
    await saveGrammar(db, ref, TEXT, G);
    await deleteBook(db, 'a');
    const [row] = await db.all<{ n: number }>('SELECT count(*) AS n FROM grammar');
    expect(row!.n).toBe(0);
  });
});
