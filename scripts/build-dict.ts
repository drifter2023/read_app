// Builds public/dict.db from ECDICT + ipa-dict en_US + WordNet exception lists (README → Assets).
// Sources are downloaded once into .cache/dict/ at build time; the app itself never touches the network.
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { americanIpa, defaultSense, parseSenses, type PosClass, type Sense } from '../src/core/dict/gloss.ts';
import { resolveLemma } from '../src/core/dict/lemma.ts';
import type { FormLink, Lexicon } from '../src/core/dict/types.ts';
import type { ParsedBook } from '../src/core/types.ts';

const CACHE = '.cache/dict';
const OUT = 'public/dict.db';
const SOURCES: Record<string, string> = {
  'ecdict.csv': 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
  'ECDICT-LICENSE': 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/LICENSE',
  'en_US.txt': 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt',
  'ipa-LICENSE': 'https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/LICENSE',
  'verb.exc': 'https://raw.githubusercontent.com/delver/wordnet-db/master/dict/verb.exc',
  'noun.exc': 'https://raw.githubusercontent.com/delver/wordnet-db/master/dict/noun.exc',
  'adj.exc': 'https://raw.githubusercontent.com/delver/wordnet-db/master/dict/adj.exc',
  'adv.exc': 'https://raw.githubusercontent.com/delver/wordnet-db/master/dict/adv.exc',
};
/** Rank cutoff on min(nonzero bnc, frq). Tuned so the entry table lands near 60k. */
const RANK_CUTOFF = 60000;
const MIN_BOOK_COVERAGE = 0.98;
/**
 * Forms that ECDICT files under a verb but that the bundled novels mostly use as words in their own
 * right (e.g. "wound" → wind, "ground" → grind). For these the tap shows the word itself.
 */
const PREFER_EXACT = new Set([
  'ground', 'wound', 'bound', 'leaves', 'glasses', 'people', 'means', 'news', 'arms', 'building',
  'meeting', 'evening', 'morning', 'feeling', 'ceiling', 'clothes', 'papers', 'quarters', 'orders', 'woods',
  'drawing', 'pants', 'goods',
]);
const WORDNET_NOTICE = 'WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved. THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED.';

interface Row { word: string; translation: string; collins: number; oxford: number; tag: string; rank: number; exchange: string }

await mkdir(CACHE, { recursive: true });
for (const [name, url] of Object.entries(SOURCES)) {
  const path = `${CACHE}/${name}`;
  if (existsSync(path)) continue;
  console.log(`downloading ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

// ---- ECDICT ----
const rows = new Map<string, Row>();
const csv = parseCsv(await readFile(`${CACHE}/ecdict.csv`, 'utf8'));
const header = csv.next().value as string[];
const col = (n: string): number => header.indexOf(n);
const [cWord, cTr, cCollins, cOxford, cTag, cBnc, cFrq, cEx] =
  ['word', 'translation', 'collins', 'oxford', 'tag', 'bnc', 'frq', 'exchange'].map(col) as number[];
for (const r of csv) {
  const word = r[cWord!] ?? '';
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) continue;
  const ranks = [Number(r[cBnc!]), Number(r[cFrq!])].filter((x) => x > 0);
  rows.set(word, {
    word, translation: r[cTr!] ?? '', collins: Number(r[cCollins!]) || 0, oxford: Number(r[cOxford!]) || 0,
    tag: r[cTag!] ?? '', rank: ranks.length ? Math.min(...ranks) : Infinity, exchange: r[cEx!] ?? '',
  });
}
const glossed = new Map<string, Sense[]>();
for (const r of rows.values()) {
  const senses = parseSenses(r.translation);
  if (senses.length) glossed.set(r.word, senses);
}
const rankOf = (w: string): number => rows.get(w)?.rank ?? Infinity;

// ---- forms → lemma ----
const KIND: Record<string, PosClass> = { p: 'v', d: 'v', i: 'v', '3': 'v', s: 'n', r: 'adj', t: 'adj' };
/** form → lemma → implied class; `null` when the form is ambiguous (e.g. "looks": plural or 3rd person). */
const forms = new Map<string, Map<string, PosClass | null>>();
const addForm = (form: string, lemma: string, kind: PosClass | null): void => {
  if (!form || form === lemma || PREFER_EXACT.has(form) || !/^[A-Za-z][A-Za-z'-]*$/.test(form)) return;
  let m = forms.get(form);
  if (!m) forms.set(form, (m = new Map()));
  m.set(lemma, m.has(lemma) && m.get(lemma) !== kind ? null : kind);
};
for (const r of rows.values()) {
  for (const part of r.exchange.split('/')) {
    const [code, value] = part.split(':');
    if (!value) continue;
    if (code && KIND[code]) for (const f of value.split(/[,;]/)) addForm(f.trim(), r.word, KIND[code]);
  }
  const lemma = /(?:^|\/)0:([^/]+)/.exec(r.exchange)?.[1];
  const which = /(?:^|\/)1:([^/]+)/.exec(r.exchange)?.[1] ?? '';
  if (lemma) {
    const kinds = new Set([...which].map((c) => KIND[c]).filter(Boolean));
    addForm(r.word, lemma, kinds.size === 1 ? [...kinds][0]! : null);
  }
}
for (const [f, kind] of [['verb', 'v'], ['noun', 'n'], ['adj', 'adj'], ['adv', 'adv']] as const) {
  for (const line of (await readFile(`${CACHE}/${f}.exc`, 'utf8')).split('\n')) {
    const [form, ...lemmas] = line.trim().split(/\s+/);
    for (const l of lemmas) if (!form?.includes('_') && !l.includes('_')) addForm(form!, l, kind);
  }
}
const lemmasSorted = (form: string): FormLink[] =>
  [...(forms.get(form) ?? [])].map(([lemma, kind]) => ({ lemma, kind })).sort((a, b) => rankOf(a.lemma) - rankOf(b.lemma));

// ---- resolve every word in the bundled books ----
const full: Lexicon = { has: (w) => glossed.has(w), lemmasOf: lemmasSorted };
const bookLemmas = new Set<string>();
let tokens = 0;
let names = 0;
const misses = new Map<string, number>();
for (const file of (await readdir('public/books')).filter((f) => f.endsWith('.json'))) {
  const book = JSON.parse(await readFile(`public/books/${file}`, 'utf8')) as ParsedBook;
  for (const ch of book.chapters) {
    for (const p of ch.paras) {
      for (const s of p) {
        let first = true;
        for (const m of s.matchAll(/[A-Za-z]+(?:['’⁠-][A-Za-z]+)*/g)) {
          const lemma = resolveLemma(m[0], full, { sentenceInitial: first });
          const name = !first && /^[A-Z]/.test(m[0]);
          first = false;
          if (lemma) { bookLemmas.add(lemma.lemma); tokens++; continue; }
          if (name) { names++; continue; } // proper nouns are excluded from the R-04 hit rate
          tokens++;
          misses.set(m[0], (misses.get(m[0]) ?? 0) + 1);
        }
      }
    }
  }
}
const missCount = [...misses.values()].reduce((a, b) => a + b, 0);
const coverage = 1 - missCount / tokens;
console.log(`books: ${tokens} word tokens, ${(coverage * 100).toFixed(2)}% resolved (${names} name tokens skipped)`);
console.log(`top misses: ${[...misses].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => `${w}×${n}`).join(' ')}`);
if (coverage < MIN_BOOK_COVERAGE) throw new Error(`book coverage ${coverage} is below ${MIN_BOOK_COVERAGE}`);

// ---- trim and write ----
const keep = new Set<string>();
for (const [w] of glossed) {
  const r = rows.get(w)!;
  if (r.rank <= RANK_CUTOFF || r.oxford || r.collins > 0 || r.tag || bookLemmas.has(w)) keep.add(w);
}
const ipa = new Map<string, string>();
for (const line of (await readFile(`${CACHE}/en_US.txt`, 'utf8')).split('\n')) {
  const [w, p] = line.split('\t');
  if (w && p && !ipa.has(w)) ipa.set(w, americanIpa(p));
}

await rm(OUT, { force: true });
const db = new DatabaseSync(OUT);
db.exec(`PRAGMA journal_mode = DELETE; PRAGMA page_size = 4096;
  CREATE TABLE entry (word TEXT PRIMARY KEY, phonetic TEXT NOT NULL, pos TEXT NOT NULL, gloss TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE sense (word TEXT NOT NULL, cls TEXT NOT NULL, pos TEXT NOT NULL, gloss TEXT NOT NULL, PRIMARY KEY (word, cls)) WITHOUT ROWID;
  CREATE TABLE forms (form TEXT NOT NULL, lemma TEXT NOT NULL, kind TEXT, rank INTEGER NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
db.exec('BEGIN');
const insE = db.prepare('INSERT INTO entry VALUES (?, ?, ?, ?)');
const insS = db.prepare('INSERT INTO sense VALUES (?, ?, ?, ?)');
let senseRows = 0;
for (const w of [...keep].sort()) {
  const senses = glossed.get(w)!;
  const def = defaultSense(w, senses)!;
  insE.run(w, ipa.get(w.toLowerCase()) ?? '', def.pos, def.gloss);
  // Other readings, used when the inflection or the previous word points at a different class.
  for (const s of senses) if (s !== def) { insS.run(w, s.cls, s.pos, s.gloss); senseRows++; }
}
const insF = db.prepare('INSERT INTO forms VALUES (?, ?, ?, ?)');
let formRows = 0;
for (const form of [...forms.keys()].sort()) {
  lemmasSorted(form).filter((l) => keep.has(l.lemma)).forEach((l, i) => { insF.run(form, l.lemma, l.kind, i); formRows++; });
}
const insM = db.prepare('INSERT INTO meta VALUES (?, ?)');
insM.run('built', new Date().toISOString().slice(0, 10));
insM.run('license.ecdict', await readFile(`${CACHE}/ECDICT-LICENSE`, 'utf8'));
insM.run('license.ipa-dict', await readFile(`${CACHE}/ipa-LICENSE`, 'utf8'));
insM.run('license.wordnet', WORDNET_NOTICE);
db.exec('COMMIT');
db.exec('CREATE INDEX forms_lemma ON forms (lemma); ANALYZE; VACUUM;');
db.close();
const size = (await readFile(OUT)).length;
console.log(`dict.db: ${keep.size} entries, ${senseRows} extra senses, ${formRows} forms, ${(size / 1e6).toFixed(1)} MB`);

/** RFC 4180 CSV: quoted fields may contain commas, newlines and doubled quotes. */
function* parseCsv(text: string): Generator<string[]> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const row: string[] = [];
    for (;;) {
      let field = '';
      if (text[i] === '"') {
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) { field += text.slice(i); i = n; break; }
          field += text.slice(i, q);
          i = q + 1;
          if (text[i] === '"') { field += '"'; i++; } else break;
        }
      } else {
        let j = i;
        while (j < n && text[j] !== ',' && text[j] !== '\n' && text[j] !== '\r') j++;
        field = text.slice(i, j);
        i = j;
      }
      row.push(field);
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      break;
    }
    yield row;
  }
}
