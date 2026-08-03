import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  COMMERCIAL_CATALOG_APPROVAL_ID,
  COMMERCIAL_CATALOG_PRODUCTION_READY,
  COMMERCIAL_CATALOG_VERSION,
  commercialCatalogApprovalPayload,
  createDemoFullArchEstimate,
  createDemoFullArchResult,
  DEMO_FULL_ARCH_STANDARD,
} from '../../src/dental/commercialCatalog.js';

describe('synthetic demo commercial catalog', () => {
  it('keeps the demo price isolated and versioned', () => {
    expect(COMMERCIAL_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.demo-v\d+$/);
    expect(DEMO_FULL_ARCH_STANDARD).toEqual(expect.objectContaining({
      status: 'synthetic_demo_catalog',
      catalogScope: 'example_dental_practice',
      currency: 'EUR',
      unit: 'per_arch',
      unitRange: { low: 2_700, high: 4_000 },
    }));
    expect(COMMERCIAL_CATALOG_PRODUCTION_READY).toBe(false);
    expect(COMMERCIAL_CATALOG_APPROVAL_ID).toBe(
      `sha256:${createHash('sha256').update(commercialCatalogApprovalPayload()).digest('hex')}`,
    );
  });

  it.each([
    ['upper', 1, 2_700, 4_000],
    ['lower', 1, 2_700, 4_000],
    ['both', 2, 5_400, 8_000],
  ] as const)('prices %s deterministically', (targetArea, archCount, low, high) => {
    const estimate = createDemoFullArchEstimate(targetArea, 'it');
    expect(estimate.archCount).toBe(archCount);
    expect(estimate.totalRange).toEqual({ low, high });
    expect(estimate.totalRange.low).toBe(estimate.unitRange.low * archCount);
    expect(estimate.totalRange.high).toBe(estimate.unitRange.high * archCount);
    expect(estimate.terms).toEqual(expect.objectContaining({
      basis: 'synthetic_demo_catalog_not_clinic_price',
      inclusions: expect.arrayContaining([expect.stringContaining('soluzione fissa standard')]),
      assumptions: expect.arrayContaining([expect.stringContaining('Idoneità')]),
      exclusions: expect.arrayContaining([expect.stringContaining('Sedazione')]),
      tax: expect.objectContaining({ status: 'not_confirmed' }),
      validity: expect.objectContaining({
        status: 'temporary_until_clinic_catalog_approval',
      }),
    }));
  });

  it('creates a non-diagnostic scenario without a fabricated assessment or quote', () => {
    const result = createDemoFullArchResult('upper', 'it');
    expect(result).toEqual(expect.objectContaining({
      resultBasis: 'commercial_scenario',
      assessment: null,
      consultationOnly: false,
      quote: null,
      priceRange: null,
      requiresClinicalConfirmation: true,
    }));
    expect(result.disclaimer).toContain('catalogo sintetico');
    expect(result.disclaimer).toContain('non è una diagnosi');
  });
});
