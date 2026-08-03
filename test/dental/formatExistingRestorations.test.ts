/**
 * Tests for formatExistingRestorations — a localized, non-billed transparency note
 * stating what is already in the patient's mouth and that the estimate is new-work-only.
 */
import { describe, it, expect } from 'vitest';
import { formatExistingRestorations } from '../../src/dental/formatExistingRestorations.js';
import type { ExistingRestoration } from '../../src/dental/types.js';

describe('formatExistingRestorations', () => {
  it('returns null when there are none', () => {
    expect(formatExistingRestorations([], 'it')).toBeNull();
    expect(formatExistingRestorations(undefined, 'it')).toBeNull();
  });

  it('summarises existing restorations in Italian and flags new-work-only', () => {
    const r: ExistingRestoration[] = [{ type: 'implant', arch: 'upper', count: 2 }];
    const note = formatExistingRestorations(r, 'it');
    expect(note).not.toBeNull();
    expect(note!).toContain('2');
    expect(note!.toLowerCase()).toContain('impianto');
    expect(note!.toLowerCase()).toContain('superiore');
    expect(note!.toLowerCase()).toContain('lavoro nuovo');
  });

  it('summarises in English', () => {
    const note = formatExistingRestorations([{ type: 'crown', count: 3 }], 'en');
    expect(note!.toLowerCase()).toContain('crown');
    expect(note!.toLowerCase()).toContain('new work');
  });
});
