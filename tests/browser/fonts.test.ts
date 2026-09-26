import '../../src/styles/fonts.css';
import { expect, it } from 'vitest';

it('loads the body and label fonts from the bundle', async () => {
  await document.fonts.load('19.5px "Newsreader Variable"');
  await document.fonts.load('11px "IBM Plex Sans"');
  expect(document.fonts.check('19.5px "Newsreader Variable"')).toBe(true);
  expect(document.fonts.check('11px "IBM Plex Sans"')).toBe(true);
});
