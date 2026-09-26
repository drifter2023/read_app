import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Writes dist/sw.js after the build: a cache-first service worker that precaches every built file
 * (app, fonts, dict.db, books, covers), so the mobile web app runs offline after its first visit.
 */
export function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spotlight-precache-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    async closeBundle() {
      const files: string[] = [];
      const walk = async (dir: string) => {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.name !== 'sw.js' && !/\.(map|woff)$/.test(e.name) && e.name !== '_headers') files.push(relative(outDir, p)); // Safari 16+ uses woff2
        }
      };
      await walk(outDir);
      files.sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(await readFile(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = (await readFile('scripts/sw-template.js', 'utf8'))
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(['./', ...files.map((f) => `./${f}`)]));
      await writeFile(join(outDir, 'sw.js'), sw);
    },
  };
}
