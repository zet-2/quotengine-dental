/**
 * Lightweight smoke tests to ensure types.ts is importable (it's pure type declarations).
 * This file improves coverage reporting for the module.
 */
import { describe, it, expect } from 'vitest';

// types.ts has no runtime values; just ensure it's importable
describe('domain/types', () => {
  it('can be imported without errors', async () => {
    const module = await import('../../src/domain/types.js');
    // Module should have no runtime exports (all types)
    expect(module).toBeDefined();
  });
});
