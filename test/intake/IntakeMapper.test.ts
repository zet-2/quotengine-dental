/**
 * Smoke test for IntakeMapper interface module.
 */
import { describe, it, expect } from 'vitest';

describe('IntakeMapper interface', () => {
  it('module is importable', async () => {
    const module = await import('../../src/intake/IntakeMapper.js');
    expect(module).toBeDefined();
  });
});
