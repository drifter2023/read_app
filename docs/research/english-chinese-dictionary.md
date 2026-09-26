# Research: an open-source English→Chinese dictionary for 聚焦阅读

*2026-09-25 · compiled from three parallel research passes (datasets, licensing, lemma/frequency/size). Not legal advice.*

**Question:** which open-source dictionary data can we bundle offline in the iOS app (Capacitor, App Store) and the mobile web PWA, to fill `dict.db` → `entry(word, phonetic, pos, gloss)` + `forms(form, lemma)`, about 60k entries trimmed by frequency?

## TL;DR

| Option | Fit for our schema | Licence risk | Obligation |
|---|---|---|---|
| **A. ECDICT** | Best: short POS-first glosses, frequency ranks, inflections, all in one CSV | **Medium.** The repo is MIT, but the Chinese glosses came from mixed or unknown sources | MIT notice |
| **B. Wiktionary (kaikki) + Chinese Open Wordnet** | Good glosses, IPA, POS, form-of entries. **No frequency data; some words have no Chinese translation** | Low | Publish `dict.db` under CC BY-SA 4.0; attribution screen |
| C. CC-CEDICT reversed | Poor: noisy, no phonetics or POS | Low | CC BY-SA 4.0 |
| ✗ StarDict 朗道 / 懒虫 | — | **High.** Unreliable "GPL" labels, which conflict with the App Store | Reject |

**Decision (2026-09-25):** ECDICT for the beta, as recommended below.

**Recommendation.**
- **Beta:** use **ECDICT**, with phonetics from **ipa-dict `en_US`** (MIT) and a **`forms` table built from ECDICT `exchange` plus the WordNet exception lists**.
- **Build script:** `scripts/build-dict` should keep the gloss source pluggable.
- **Before a public or paid App Store release:** run the **Option B** build, measure coverage on the three bundled books, and switch if it reaches ≥98%. If B falls short, get legal advice on ECDICT, or ask its author (issue #134).

---

## 1. Candidate datasets

### ECDICT: [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)

**Size:** `ecdict.csv` has 760k entries (65.9 MB). [README](https://github.com/skywind3000/ECDICT)

**Fields** ([README](https://github.com/skywind3000/ECDICT)):
- `word`, `phonetic`, `translation` (Chinese, one sense per line, with a POS prefix such as `n.`/`v.`)
- `pos` holds corpus ratios such as `n:46/v:54`, not a label, so the display POS comes from the `translation` prefix
- `collins`, `oxford`, `tag` (exam lists), `bnc` (rank), `frq` (contemporary rank; the author's [wiki](https://github.com/skywind3000/ECDICT/wiki/%E7%AE%80%E6%98%8E%E8%8B%B1%E6%B1%89%E5%AD%97%E5%85%B8%E5%A2%9E%E5%BC%BA%E7%89%88) says COCA)
- `exchange` (inflections)

**Sample rows** (from [ecdict.csv](https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv)). The glosses are short and put the POS first, which suits our one-line gloss and 9px footnote:
```
inquire,in'kwaiә,...,"v. 询问, 问明, 查究",,2,,cet4 cet6 ielts,8760,6687,p:inquired/i:inquiring/d:inquired/3:inquires,,
```

**Phonetics are messy.** The notation is old-style and mostly British. For example, `inquiry` is stored as `in'kwaiәri`, with an ASCII `'` and **U+04D9 Cyrillic schwa**, while other rows use `ˈ`/`ə`. We should replace this field. [ecdict.csv](https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv)

**Licence:** one MIT `LICENSE` file that covers "software and associated documentation" and says nothing about data. [LICENSE](https://github.com/skywind3000/ECDICT/blob/master/LICENSE) In 2019 the author answered a question about commercial use with "可以，MIT 协议" (yes, it's MIT). [#43](https://github.com/skywind3000/ECDICT/issues/43)

**Where the data came from:**
- The base was an "EDictAZ.txt" file someone else supplied, with no stated source.
- The phonetics were scraped with a crawler.
- Other material came from cdict-1.0-1.rpm and from the English–Chinese part of 屌丝字典. That repo has no licence. [README](https://github.com/skywind3000/ECDICT) · [fxsjy/diaosi](https://api.github.com/repos/fxsjy/diaosi)
- The wiki also lists Wiktionary, WordNet, CEDICT, Google Translate, linguee, Babylon, TheFreeDictionary and Urban Dictionary, and says some glosses were machine-translated. [wiki: 双解释义](https://github.com/skywind3000/ECDICT/wiki/%E5%8F%8C%E8%A7%A3%E9%87%8A%E4%B9%89)
- StarDict labels cdict as "GPL". [huzheng.org](http://download.huzheng.org/zh_CN/)
- An open issue asks whether the data may be used commercially. It has **no answer from the author**; one commenter says some glosses may come from commercial dictionaries. [#134](https://github.com/skywind3000/ECDICT/issues/134)

**Maintenance:** last commit 2025-03-28, last release 2017-09-20. [commits](https://api.github.com/repos/skywind3000/ECDICT/commits) · [releases](https://github.com/skywind3000/ECDICT/releases)

**ECDICT-ultimate** (4.32M entries) adds size and provenance risk and gives us nothing at 60k entries. [repo](https://github.com/skywind3000/ECDICT-ultimate)

*Interpretation:* an MIT licence can only pass on rights the author actually held. No gloss is tagged with its source, so we cannot prove a clean licence for any one entry. The practical risk is an App Store takedown after a complaint, under Guideline 5.2 ("only includes content that you created or that you have a license to use"). [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)

### Wiktionary via [kaikki.org](https://kaikki.org/dictionary/) / wiktextract
- **Licence:** CC BY-SA 4.0 (edits before June 2023 are 3.0, which is compatible) plus GFDL. [Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) · [Wikimedia Diff](https://diff.wikimedia.org/2023/06/29/stepping-into-the-future-wikimedia-projects-transition-to-creative-commons-4-0-license/)
- **English Wiktionary:** IPA tagged US/UK, POS, form-of entries, and Mandarin translations for each sense, e.g. *quay* → 码头 / 埠头, `/kiː/`. [quay.jsonl](https://kaikki.org/dictionary/English/meaning/q/qu/quay.jsonl) The dump is 2.7 GB, updated about weekly. [rawdata](https://kaikki.org/dictionary/rawdata.html)
- **No frequency data.**
- **Coverage gaps.** In a 16-word spot check, 12 had Mandarin translations. *scarcely*, *treeline* and *wistful* had none. [kaikki](https://kaikki.org/dictionary/English/)
- **Chinese Wiktionary** has 74k English word forms, but quality is uneven: some glosses are encyclopedic and common words are missing. [zh index](https://kaikki.org/zhwiktionary/%E8%8B%B1%E8%AA%9E/index.html)
- **FreeDict eng-zho** (26,660 headwords) is a Wiktionary subset made via WikDict/DBnary under CC BY-SA. [FreeDict](https://freedict.org/freedict-database.json) · [WikDict](https://www.wikdict.com/page/about)

### Chinese Open Wordnet (COW, in OMW)
- **Licence:** WordNet-style and permissive. [LICENSE](https://raw.githubusercontent.com/omwn/omw-data/main/wns/cow/LICENSE)
- **Size:** 42,300 synsets and 79,797 Simplified Chinese lemma rows. [wn-data-cmn.tab](https://raw.githubusercontent.com/omwn/omw-data/main/wns/cow/wn-data-cmn.tab)
- **Limits:** organised by synset, with no phonetics or frequency data. Useful as a clean fallback gloss for nouns, verbs, adjectives and adverbs.
- **Avoid** OMW's `wn-wikt-cmn` file; it is CC BY-SA. [file](https://github.com/omwn/omw-data/blob/main/wns/wikt/wn-wikt-cmn.tab)

### CC-CEDICT, reversed
- **Licence:** CC BY-SA 4.0, 125k entries. [MDBG](https://www.mdbg.net/chinese/dictionary?page=cc-cedict)
- Searching it in the English→Chinese direction gives noisy results: *reluctant* → 不舍, 恋恋不舍 … but not 不情愿的. It has no English phonetics or POS. Use it only as a last fallback. [MDBG search](https://www.mdbg.net/chinese/dictionary?page=worddict&wdqb=reluctant)

### StarDict 朗道英汉 / 懒虫简明英汉: reject
- huzheng.org labels them "GPL". [huzheng.org](http://download.huzheng.org/zh_CN/)
- It gives the same label to plainly commercial dictionaries (牛津, 新华字典), so the label is unreliable.
- StarDict was reportedly removed from SourceForge after copyright complaints. [Wikipedia](https://en.wikipedia.org/wiki/StarDict)
- The FSF considers GPL incompatible with App Store terms. [FSF](https://www.fsf.org/blogs/licensing/more-about-the-app-store-gpl-enforcement)

### Phonetics only
- **ipa-dict:** `en_US` is MIT (from cmudict-ipa). **`en_UK` is GPL-3.0; do not use it.** [ipa-dict README](https://github.com/open-dict-data/ipa-dict)
- **CMUdict:** BSD-style; the notice must be reproduced. [LICENSE](https://github.com/cmusphinx/cmudict/blob/master/LICENSE)

## 2. What the licences require of us

- **CC BY-SA 4.0 (Wiktionary, CC-CEDICT):**
  - A trimmed and reshaped database is Adapted Material, so **`dict.db` must be released under CC BY-SA 4.0**. [legal code §3(b), §4](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
  - Share-alike applies only to the adapted work. It does not reach separate app code. [CC FAQ](https://creativecommons.org/faq/)
  - Attribution may be a link. [legal code §3(a)(2)](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en) · [WMF Terms §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)
  - The licence also bans technical measures (DRM) that restrict recipients. [§2(a)(5)(C)](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en) *Interpretation:* publish `dict.db` openly and list it as an open-source component. Apple's EULA carves out open-source components. [Apple EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)
- **WordNet 3.0:** use for any purpose, but the notice and disclaimer must appear on all copies, and Princeton's name may not be used in advertising. [Princeton](https://wordnet.princeton.edu/license-and-commercial-use)
- **The PWA** is also distribution, so the same obligations apply. It avoids the App Store DRM question.

**Checklist**
1. Add an offline **Acknowledgements** screen to both the iOS app and the PWA. It should list every source, its licence and its link, and note "modified: selected, trimmed, reformatted".
2. Store the same notices in a `meta` table inside `dict.db`.
3. If we use any CC BY-SA source, publish `dict.db` and `scripts/build-dict` at a public URL.
4. Replace the README's "MIT; confirm the licence before release" with the licence we actually chose.
5. Get legal review before a paid release.

## 3. forms → lemma

**ECDICT `exchange`** ([README](https://github.com/skywind3000/ECDICT)) is `type:word` pairs joined by `/`:

| Code | Meaning |
|---|---|
| `p` | past tense |
| `d` | past participle |
| `i` | present participle |
| `3` | 3rd person singular |
| `r` / `t` | comparative / superlative |
| `s` | plural |
| `0` | this entry's lemma |
| `1` | which inflection this entry is |

Reversing it gives clean form→lemma rows.

**Other sources**

| Source | Details | Licence | Verdict |
|---|---|---|---|
| ECDICT `lemma.en.txt` | 102k forms. Noisy: `better → well, good`, `was → be, wa` | Header says "research and/or educational purposes" | Last resort, filtered, if at all. [file](https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt) |
| WordNet `verb.exc` / `noun.exc` / `adj.exc` | `form lemma` irregulars, about 100 KB | WordNet licence | **Use.** [mirror](https://github.com/delver/wordnet-db) · [OSI](https://opensource.org/license/wordnet) |
| spaCy `en_lemma_lookup.json` | 41,582 forms | English data is under the WordNet licence | Alternative. [repo](https://github.com/explosion/spacy-lookups-data) |
| michmech lists | — | ODbL (share-alike) | Avoid. [repo](https://github.com/michmech/lemmatization-lists) |
| AGID (SCOWL) | Has confidence markers | Permissive | Alternative. [readme](http://wordlist.aspell.net/agid-readme/) |

**Lookup pipeline** (at tap time, in `src/core/dict`):
1. **Normalise:** NFC, `’`→`'`, strip surrounding punctuation, lower-case.
2. **Exact entry first.** This keeps "better", "found" and "left" as their own entries.
3. **Clitics:** `won't→will`, `can't→can`; otherwise strip `n't 's 're 've 'll 'd 'm` and a trailing `s'`.
4. **`forms` table**, keyed on `(form, lemma)` so ambiguous forms such as *lay* can return both lemmas.
5. **Suffix rules (WordNet morphy)**, accepting a candidate only if it exists in `entry`. [NLTK wordnet.py](https://raw.githubusercontent.com/nltk/nltk/develop/nltk/corpus/reader/wordnet.py)
   - noun: `s ses→s ves→f xes zes ches shes men→man ies→y`
   - verb: `s ies→y es→e es ed→e ed ing→e ing`
   - adj: `er est er→e est→e`
   - plus undoing doubled consonants (running→run)
6. **Hyphens:** try the whole word, then the word with the hyphen removed, then the part that was tapped.
7. **Capitals:** try a sentence-first word lower-cased. A capitalised word in mid-sentence that still misses is a proper noun and is excluded from the R-04 hit-rate count.

## 4. Frequency list for trimming to ~60k

**Use ECDICT's own `bnc` and `frq` ranks** (0 means unranked). [README](https://github.com/skywind3000/ECDICT)
- BNC rank suits 19th- and early-20th-century books. *quay* is BNC rank 8906 but outside the contemporary top 20k.

**Keep an entry if:**
- `min(nonzero bnc, frq) ≤ cutoff`, **or**
- `oxford=1`, **or**
- `collins>0`, **or**
- `tag` is not empty.

**Always keep** every lemma the pipeline resolves from the three bundled books. **Fail the build** if book coverage is below 98%. The only published hit-rate figure is ECDICT's own claim of about 95% for `lemma.en.txt` on BNC word forms, so R-04 must be measured by us. [README](https://github.com/skywind3000/ECDICT)

**Other frequency sources**

| Source | Licence and notes | Verdict |
|---|---|---|
| wordfreq | Data is CC BY-SA 4.0; frozen at about 2021 | Share-alike question if used. [README](https://raw.githubusercontent.com/rspeer/wordfreq/master/README.md) |
| Google Books Ngram | CC BY 3.0 | Possible. [datasets](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html) |
| SUBTLEX-US | No licence stated | Unclear. [UGent](https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus) |
| COCA 60k | Paid; no redistribution | **Avoid.** [licence](https://www.wordfrequency.info/license.asp) |

## 5. Size and runtime

**Estimated size** (synthetic 60k entries plus 100k forms, `WITHOUT ROWID`, real ECDICT gloss text):

| Gloss length | Raw `dict.db` | gzip |
|---|---|---|
| ~20 Chinese characters | ~8 MB | ~3.5 MB |
| ~40 Chinese characters | ~11 MB | ~4.7 MB |
| ~80 Chinese characters | ~16 MB | ~7 MB |

Brotli would likely be about 70–80% of the gzip size (not verified). Removing ECDICT's `[网络]` lines keeps glosses short.

**iOS (Capacitor).** Use `@capacitor-community/sqlite`:
- Put the file in `public/assets/databases/` and call `copyFromAssets`, which copies it to the app's Library or Documents folder. [UtilsFile.swift](https://raw.githubusercontent.com/capacitor-community/sqlite/master/ios/Plugin/UtilsFile.swift) · [API.md](https://raw.githubusercontent.com/capacitor-community/sqlite/master/docs/API.md)
- Open it with a read-only connection (supported since 4.1.0-7). [README](https://raw.githubusercontent.com/capacitor-community/sqlite/master/README.md)
- The copy means the db is stored twice on disk.
- The plugin includes SQLCipher, which may need an export-compliance declaration.

**PWA.**
- **Don't use the plugin's web layer.** It is jeep-sqlite/sql.js, keeps the whole db in memory, and has no read-only connections. [Web-Usage](https://raw.githubusercontent.com/capacitor-community/sqlite/master/docs/Web-Usage.md)
- **Use the official SQLite WASM build** instead:
  - `opfs-sahpool` VFS with `importDb()`: works in Safari 16.4+ and needs no COOP/COEP headers.
  - Fall back to `sqlite3_deserialize` in memory.
  - Build `dict.db` with `journal_mode=DELETE`, because the WASM build cannot read WAL databases.
  - [persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) · [cookbook](https://sqlite.org/wasm/doc/trunk/cookbook.md)
- The service worker pre-caches `dict.db`. Call `navigator.storage.persist()`, because Safari can still evict the data. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- **Conflict with project rules:** the PWA must download about 4–7 MB once when it installs, and "zero network at runtime" can only apply after that.

## 6. Open questions
- What the ECDICT glosses originally came from, and whether the author will state a data licence (issue #134).
- How many of the top 60k lemmas have Mandarin translations in English Wiktionary. This needs the full dump; the spot check was 12 of 16.
- Whether the CC BY-SA ban on technical measures matters for App Store distribution (legal).
- How long a plugin lookup takes across the native bridge on a device, against the ≤100 ms tap-to-drawer target.
- Real brotli sizes, and whether ECDICT's `bnc`/`frq` ranks count lemmas or word forms.
- Licences of cdict-1.0-1.rpm and of Someya's lemma list.
