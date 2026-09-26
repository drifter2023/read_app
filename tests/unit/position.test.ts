import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { getBook, saveParsedBook } from '../../src/core/library/library.ts';
import { loadPosition, PositionSaver, savePosition } from '../../src/core/reader/position.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('position store', () => {
  let db: Db;
  beforeEach(async () => {
    db = nodeDb();
    await migrate(db);
    await saveParsedBook(db, { id: 'b', title: 'B', author: '', wordCount: 1, chapters: [{ title: 'C', paras: [['x.']], wordCount: 1 }] }, 'epub', 0);
  });

  it('R-07: saves and loads the anchor, and updates book.pct', async () => {
    expect(await loadPosition(db, 'b')).toBeNull();
    await savePosition(db, 'b', { chapter: 3, para: 12, sentence: 2 }, 41, 5);
    await savePosition(db, 'b', { chapter: 3, para: 14, sentence: 0 }, 42, 6);
    expect(await loadPosition(db, 'b')).toEqual({ chapter: 3, para: 14, sentence: 0 });
    expect((await getBook(db, 'b'))!.pct).toBe(42);
  });
});

describe('PositionSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounces to one save of the latest anchor after 1s', async () => {
    const save = vi.fn(async () => {});
    const s = new PositionSaver(save);
    s.push({ chapter: 0, para: 1, sentence: 0 }, 1);
    await vi.advanceTimersByTimeAsync(500);
    s.push({ chapter: 0, para: 2, sentence: 0 }, 2);
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ chapter: 0, para: 2, sentence: 0 }, 2);
  });

  it('flush saves immediately (app backgrounded mid-debounce, Review Focus 5)', async () => {
    const save = vi.fn(async () => {});
    const s = new PositionSaver(save);
    s.push({ chapter: 1, para: 0, sentence: 0 }, 9);
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does nothing', async () => {
    const save = vi.fn(async () => {});
    await new PositionSaver(save).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
