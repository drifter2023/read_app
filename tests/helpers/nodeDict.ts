import { DatabaseSync } from 'node:sqlite';
import type { PosClass } from '../../src/core/dict/gloss.ts';
import type { DictSource } from '../../src/core/dict/service.ts';
import type { FormLink } from '../../src/core/dict/types.ts';

/** node:sqlite twin of src/core/dict/sqljs.ts, for unit tests. */
export function nodeDictSource(d: DatabaseSync): DictSource {
  const has = d.prepare('SELECT 1 FROM entry WHERE word = ?');
  const entry = d.prepare('SELECT phonetic, pos, gloss FROM entry WHERE word = ?');
  const sense = d.prepare('SELECT pos, gloss FROM sense WHERE word = ? AND cls = ?');
  const forms = d.prepare('SELECT lemma, kind FROM forms WHERE form = ? ORDER BY rank');
  return {
    has: (w) => has.get(w) !== undefined,
    entry: (w) => entry.get(w) as { phonetic: string; pos: string; gloss: string } | undefined,
    sense: (w, cls: PosClass) => sense.get(w, cls) as { pos: string; gloss: string } | undefined,
    lemmasOf: (f) => forms.all(f) as unknown as FormLink[],
    formsOfLemmas: (ls) => ls.length
      ? (d.prepare(`SELECT form FROM forms WHERE lemma IN (${ls.map(() => '?').join(',')})`).all(...ls) as { form: string }[]).map((r) => r.form)
      : [],
  };
}

/** A tiny dict.db with the production schema. */
export function fixtureDict(): DictSource {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE entry (word TEXT PRIMARY KEY, phonetic TEXT NOT NULL, pos TEXT NOT NULL, gloss TEXT NOT NULL);
    CREATE TABLE sense (word TEXT NOT NULL, cls TEXT NOT NULL, pos TEXT NOT NULL, gloss TEXT NOT NULL, PRIMARY KEY (word, cls));
    CREATE TABLE forms (form TEXT NOT NULL, lemma TEXT NOT NULL, kind TEXT, rank INTEGER NOT NULL, PRIMARY KEY (form, lemma));`);
  const e = d.prepare('INSERT INTO entry VALUES (?, ?, ?, ?)');
  for (const row of [
    ['carry', '/ˈkæri/', 'vt.', '携带，运送，支持，传送'],
    ['look', '/lʊk/', 'vi.', '看，注意，朝着，显得'],
    ['go', '/goʊ/', 'vi.', '去，走，达到，运转'],
    ['be', '/bi/', 'v.', '是，表示，在'],
    ['can', '/kæn/', 'aux.', '能，可以'],
    ['run', '/rʌn/', 'vi.', '跑，奔跑，跑步，赛跑'],
    ['boat', '/boʊt/', 'n.', '船'],
    ['wound', '/wund/', 'n.', '创伤，伤口，伤疤，伤害'],
    ['North', '/nɔrθ/', 'n.', '北方，北'],
    ['I', '/aɪ/', 'pron.', '我'],
    ['do', '/du/', 'v.', '做，进行，完成'],
    ['well-dressed', '', 'adj.', '穿得很体面的'],
    ['bright', '/braɪt/', 'adj.', '明亮的，聪明的'],
    ['eye', '/aɪ/', 'n.', '眼睛，视力'],
  ]) e.run(...row);
  const s = d.prepare('INSERT INTO sense VALUES (?, ?, ?, ?)');
  s.run('look', 'n', 'n.', '一看，神色，样子，面容');
  s.run('can', 'v', 'vt.', '装罐');
  s.run('run', 'n', 'n.', '跑，赛跑，奔跑');
  const f = d.prepare('INSERT INTO forms VALUES (?, ?, ?, ?)');
  for (const row of [
    ['carried', 'carry', 'v', 0], ['went', 'go', 'v', 0], ['was', 'be', 'v', 0], ['could', 'can', 'v', 0],
    ['looks', 'look', null, 0], ['boats', 'boat', 'n', 0], ['ran', 'run', 'v', 0], ['running', 'run', 'v', 0],
  ] as const) f.run(...row);
  return nodeDictSource(d);
}
