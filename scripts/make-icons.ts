// Renders design/icon/icon.html to the iOS app icon and the web app icons (run when the design changes).
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.goto(`file://${resolve('design/icon/icon.html')}`);
const master = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
await page.locator('.icon').screenshot({ path: master });
await browser.close();

await mkdir('public/icons', { recursive: true });
for (const size of [180, 192, 512]) {
  execFileSync('sips', ['-z', String(size), String(size), master, '--out', `public/icons/icon-${size}.png`], { stdio: 'ignore' });
}
console.log('icons written');
