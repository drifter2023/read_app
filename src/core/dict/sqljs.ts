import type { Database, Statement } from 'sql.js';
import type { PosClass } from './gloss.ts';
import type { DictSource, WordLevel } from './service.ts';
import type { FormLink } from './types.ts';

/** dict.db opened read-only in sql.js. Every query is a prepared statement, synchronous and sub-millisecond. */
export function sqlJsDictSource(db: Database): DictSource {
  const hasSt = db.prepare('SELECT 1 FROM entry WHERE word = ?');
  const entrySt = db.prepare('SELECT phonetic, pos, gloss FROM entry WHERE word = ?');
  const senseSt = db.prepare('SELECT pos, gloss FROM sense WHERE word = ? AND cls = ?');
  const formsSt = db.prepare('SELECT lemma, kind FROM forms WHERE form = ? ORDER BY rank');
  const levelSt = db.prepare('SELECT rank, tier, collins, oxford FROM entry WHERE word = ?');
  const one = <T>(st: Statement, params: (string | number)[]): T | undefined => {
    st.bind(params);
    const row = st.step() ? (st.getAsObject() as T) : undefined;
    st.reset();
    return row;
  };
  return {
    has: (w) => one(hasSt, [w]) !== undefined,
    entry: (w) => one(entrySt, [w]),
    sense: (w, cls: PosClass) => one(senseSt, [w, cls]),
    lemmasOf(form) {
      formsSt.bind([form]);
      const out: FormLink[] = [];
      while (formsSt.step()) out.push(formsSt.getAsObject() as unknown as FormLink);
      formsSt.reset();
      return out;
    },
    level: (w) => one<WordLevel>(levelSt, [w]),
    levels() {
      const [res] = db.exec('SELECT word, rank, tier, collins, oxford FROM entry');
      return (res?.values ?? []).map(([word, rank, tier, collins, oxford]) =>
        ({ word: String(word), rank: Number(rank), tier: Number(tier), collins: Number(collins), oxford: Number(oxford) }));
    },
    formsOfLemmas(lemmas) {
      if (!lemmas.length) return [];
      const [res] = db.exec(`SELECT form FROM forms WHERE lemma IN (${lemmas.map(() => '?').join(',')})`, [...lemmas]);
      return (res?.values ?? []).map((r) => String(r[0]));
    },
  };
}
