/**
 * Tests for implantCountRange — turns a point implant estimate into an indicative
 * range (~±30%), reflecting that exact implant count from a 2D panoramic is uncertain.
 */
import { describe, it, expect } from 'vitest';
import { implantCountRange } from '../../src/dental/implantRange.js';

describe('implantCountRange', () => {
  it('returns [0,0] for zero implants', () => {
    expect(implantCountRange(0)).toEqual({ low: 0, high: 0 });
  });

  it('widens a point estimate by ~±30%', () => {
    expect(implantCountRange(4)).toEqual({ low: 3, high: 5 });
    expect(implantCountRange(7)).toEqual({ low: 5, high: 9 });
  });

  it('keeps a single implant as [1,1]', () => {
    expect(implantCountRange(1)).toEqual({ low: 1, high: 1 });
  });

  it('never drops below 1 for a positive estimate', () => {
    expect(implantCountRange(2).low).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds the adult-dentition safety cap', () => {
    expect(implantCountRange(32)).toEqual({ low: 22, high: 32 });
    expect(implantCountRange(64)).toEqual({ low: 22, high: 32 });
  });
});
