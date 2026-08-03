import { describe, expect, it } from 'vitest';
import { buildRegistry, listClientIds, loadClients } from '../../src/clients/index.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

describe('client registry', () => {
  it('auto-discovers shipped client knowledge bases', async () => {
    const clients = await loadClients();
    expect(listClientIds(clients)).toEqual(['dental-clinic']);
    expect(clients['dental-clinic']?.clientName).toBe('Quotengine Demo Dental Practice');
  });
});

describe('buildRegistry', () => {
  it('keys knowledge bases by clientId and freezes the registry', () => {
    const registry = buildRegistry([dentalClinicKB]);
    expect(listClientIds(registry)).toEqual(['dental-clinic']);
    expect(registry['dental-clinic']).toBe(dentalClinicKB);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('throws on duplicate clientIds', () => {
    expect(() => buildRegistry([dentalClinicKB, dentalClinicKB])).toThrow(
      /Duplicate clientId 'dental-clinic'/,
    );
  });

  it('throws when no knowledge bases are provided', () => {
    expect(() => buildRegistry([])).toThrow(/No client knowledge bases found/);
  });
});
