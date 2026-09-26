import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EASE, MOTION } from '../../src/core/motion.ts';

const spec = JSON.parse(readFileSync('spec.mvp.json', 'utf8')) as { ease: string; motion: Record<string, number> };

describe('motion constants match spec.mvp.json', () => {
  it('uses the single easing curve', () => expect(EASE).toBe(spec.ease));
  it('uses the spec durations', () => expect({ ...MOTION }).toEqual(spec.motion));
});
