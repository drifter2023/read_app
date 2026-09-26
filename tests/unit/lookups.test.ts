import { beforeEach, describe, expect, it } from 'vitest';
import { forgetLemma, isSaved, listLookups, recordLookup, seenLemmas, setSaved, type NewLookup } from '../../src/core/annot/lookups.ts';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { saveParsedBook } from '../../src/core/library/library.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

let db: Db;
const book = (id: string) => ({ id, title: id, author: 'A', wordCount: 2, chapters: [{ title: 'I', paras: [['Hi there.']], wordCount: 2 }] });
const row = (bookId: string, lemma: string): NewLookup => ({
  bookId, surface: lemma, lemma, zh: '去', phonetic: '/goʊ/', sentence: 'He went.', loc: { chapter: 0, para: 0, sentence: 0, offset: 4 }, at: 1,
});

beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await saveParsedBook(db, book('a'), 'epub', 0);
  await saveParsedBook(db, book('b'), 'epub', 0);
});

describe('lookups', () => {
  it('records a rich Lookup row and returns its id (R-05 on open)', async () => {
    const id = await recordLookup(db, row('a', 'go'));
    const [r] = await listLookups(db, 'a');
    expect(r).toMatchObject({ id, bookId: 'a', lemma: 'go', zh: '去', sentence: 'He went.', saved: false });
    expect(r!.loc).toEqual({ chapter: 0, para: 0, sentence: 0, offset: 4 });
  });

  it('seen is the distinct lemmas of this book only (R-06)', async () => {
    await recordLookup(db, row('a', 'go'));
    await recordLookup(db, row('a', 'go'));
    await recordLookup(db, row('a', 'run'));
    await recordLookup(db, row('b', 'quay'));
    expect(await seenLemmas(db, 'a')).toEqual(new Set(['go', 'run']));
  });

  it('saves and unsaves (R-09)', async () => {
    const id = await recordLookup(db, row('a', 'go'));
    expect(await isSaved(db, 'a', 'go')).toBe(false);
    await setSaved(db, id, true);
    expect(await isSaved(db, 'a', 'go')).toBe(true);
    expect((await listLookups(db, 'a'))[0]!.saved).toBe(true);
  });

  it('deleting a book deletes its lookups (H-05)', async () => {
    await recordLookup(db, row('a', 'go'));
    await db.run('DELETE FROM book WHERE id = ?', ['a']);
    expect(await listLookups(db, 'a')).toEqual([]);
  });
  it('forgetLemma undoes a mistaken lookup in this book only: rows, saved state, seen', async () => {
    const id = await recordLookup(db, row('a', 'go'));
    await setSaved(db, id, true);
    await recordLookup(db, row('a', 'go'));
    await recordLookup(db, row('a', 'run'));
    await recordLookup(db, row('b', 'go'));
    await forgetLemma(db, 'a', 'go');
    expect([...await seenLemmas(db, 'a')]).toEqual(['run']);
    expect(await isSaved(db, 'a', 'go')).toBe(false);
    expect([...await seenLemmas(db, 'b')]).toEqual(['go']);
  });
});
