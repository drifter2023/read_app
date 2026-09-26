import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';
import { fullTier, openFromHome, wordInBand } from './helpers.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.db': 'application/octet-stream',
};

/** A throwaway static server for dist/, so the test can take the network away for real. */
function serveDist(port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    try {
      const body = await readFile(join('dist', path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

test('mobile web: after the first visit the app works with the server gone', async ({ page }) => {
  const server = await serveDist(4181);
  await fullTier(page);
  await page.goto('http://localhost:4181/');
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === 'activated' && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
  // A second, online visit: this navigation itself is served by the worker, as a real return visit is.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await new Promise((r) => server.close(r));
  server.closeAllConnections();

  await page.reload();
  await expect(page.locator('.row-title').first()).toBeVisible();
  await openFromHome(page, 'The Great Gatsby');
  const p = await wordInBand(page, 'advice');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('drawer')).toHaveAttribute('data-state', 'ready');
});
