import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { colorIndex, deleteBook, findDuplicate, getBook, getChapters, listBooks, listShelf, markOpened, restoreBundled, saveParsedBook, seedBundled } from '../../src/core/library/library.ts';
import { savePosition } from '../../src/core/reader/position.ts';
import type { ParsedBook } from '../../src/core/types.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

const book = (id: string, title = id): ParsedBook => ({
  id, title, author: 'A. Writer', wordCount: 7,
  chapters: [
    { title: 'Chapter I', paras: [['One two three.']], wordCount: 3 },
    { title: 'Chapter II', paras: [['Four five.', 'Six seven.']], wordCount: 4 },
  ],
});

let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

describe('library', () => {
  it('stores chapters with cumulative wordStart', async () => {
    await saveParsedBook(db, book('b1'), 'epub', 100);
    const chs = await getChapters(db, 'b1');
    expect(chs.map((c) => [c.idx, c.title, c.wordStart])).toEqual([[0, 'Chapter I', 0], [1, 'Chapter II', 3]]);
    expect(chs[1]!.paras).toEqual([['Four five.', 'Six seven.']]);
    expect(await getBook(db, 'b1')).toMatchObject({ id: 'b1', wordCount: 7, status: 'reading', pct: 0, addedAt: 100, openedAt: null });
  });

  it('seeds each bundled book once, even after the user deletes it', async () => {
    const loaded: string[] = [];
    const load = async (id: string) => { loaded.push(id); return book(id); };
    expect(await seedBundled(db, ['a', 'b'], load, 1)).toEqual(['a', 'b']);
    expect(await seedBundled(db, ['a', 'b'], load, 2)).toEqual([]);
    await db.run('DELETE FROM book WHERE id = ?', ['a']);
    expect(await seedBundled(db, ['a', 'b'], load, 3)).toEqual([]);
    expect(loaded).toEqual(['a', 'b']);
  });

  it('lists most recently opened first, never-opened last', async () => {
    await saveParsedBook(db, book('x'), 'epub', 1);
    await saveParsedBook(db, book('y'), 'epub', 2);
    await saveParsedBook(db, book('z'), 'epub', 3);
    await markOpened(db, 'x', 10);
    await markOpened(db, 'y', 20);
    expect((await listBooks(db)).map((b) => b.id)).toEqual(['y', 'x', 'z']);
  });

  it('colorIndex is stable and within the 8-colour palette', () => {
    expect(colorIndex('The Great Gatsby')).toBe(colorIndex('The Great Gatsby'));
    for (const t of ['a', 'b', 'The Maltese Falcon', '']) expect(colorIndex(t)).toBeGreaterThanOrEqual(0);
    for (const t of ['a', 'b', 'The Maltese Falcon', '']) expect(colorIndex(t)).toBeLessThan(8);
  });
});

describe('shelf (H-01, H-02, H-05)', () => {
  it('lists books newest-opened first with their current chapter', async () => {
    await saveParsedBook(db, book('a'), 'epub', 1);
    await saveParsedBook(db, book('b'), 'epub', 2);
    await saveParsedBook(db, book('c'), 'epub', 3);
    await markOpened(db, 'a', 10);
    await markOpened(db, 'c', 20);
    await db.run('INSERT INTO position (book_id, chapter, para, sentence, updated_at) VALUES (?, 1, 0, 0, 0)', ['c']);
    const shelf = await listShelf(db);
    expect(shelf.map((b) => b.id)).toEqual(['c', 'a', 'b']);
    expect(shelf[0]).toMatchObject({ chapter: 1, chapterTitle: 'Chapter II', chapters: 2 });
    expect(shelf[1]).toMatchObject({ chapter: 0, chapterTitle: 'Chapter I' });
  });

  it('stores the cover URL', async () => {
    await saveParsedBook(db, { ...book('a'), cover: 'covers/a.jpg' }, 'epub', 1);
    expect((await getBook(db, 'a'))!.cover).toBe('covers/a.jpg');
  });

  it('reaching 100% files the book under done with a finish date, once (H-02)', async () => {
    await saveParsedBook(db, book('a'), 'epub', 1);
    await savePosition(db, 'a', { chapter: 1, para: 0, sentence: 1 }, 100, 500);
    await savePosition(db, 'a', { chapter: 1, para: 0, sentence: 1 }, 100, 900);
    expect(await getBook(db, 'a')).toMatchObject({ status: 'done', finishedAt: 500, pct: 100 });
  });

  it('deletes a book with its chapters and position', async () => {
    await saveParsedBook(db, book('a'), 'epub', 1);
    await savePosition(db, 'a', { chapter: 0, para: 0, sentence: 0 }, 5);
    await deleteBook(db, 'a');
    expect(await getBook(db, 'a')).toBeNull();
    expect(await db.all('SELECT * FROM chapter WHERE book_id = ?', ['a'])).toEqual([]);
    expect(await db.all('SELECT * FROM position WHERE book_id = ?', ['a'])).toEqual([]);
  });

  it('restores a deleted bundled book and finds duplicates by title and author', async () => {
    await restoreBundled(db, book('gatsby', 'The Great Gatsby'));
    await restoreBundled(db, book('gatsby', 'The Great Gatsby'));
    expect((await listShelf(db)).length).toBe(1);
    expect(await findDuplicate(db, 'the great gatsby', 'a. writer')).toBe('gatsby');
    expect(await findDuplicate(db, 'Other', 'A. Writer')).toBeNull();
  });
});
