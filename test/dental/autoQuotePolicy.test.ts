import { describe, expect, it } from 'vitest';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import {
  evaluateAutoQuotePolicy,
  MAX_AUTO_QUOTE_CANDIDATES,
} from '../../src/dental/autoQuotePolicy.js';
import type { CandidateTreatment, DentalAssessment } from '../../src/dental/types.js';

function treatment(overrides: Partial<CandidateTreatment> = {}): CandidateTreatment {
  return {
    itemId: 'implant-standard',
    quantity: 1,
    arch: 'upper',
    rationale: 'visible missing tooth',
    needsConfirmation: true,
    ...overrides,
  };
}

function assessment(candidateTreatments: readonly CandidateTreatment[]): DentalAssessment {
  return {
    archFindings: [],
    candidateTreatments,
    imageQuality: 'fair',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: true,
  };
}

describe('automatic patient-facing quote policy', () => {
  it('allows a bounded clinical proposal', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ quantity: 3 })]),
      dentalClinicKB,
    )).toEqual({ allowed: true, reason: 'allowed' });
  });

  it('rejects four or more implants until a complete full-arch package exists', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ quantity: 4, arch: 'upper' })]),
      dentalClinicKB,
    )).toEqual({ allowed: false, reason: 'implant_scope_not_supported' });
  });

  it('rejects unknown and known items outside the automatic-quote allowlist', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ itemId: 'invented-treatment' })]),
      dentalClinicKB,
    ).reason).toBe('unknown_item');
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ itemId: 'xray-panoramic' })]),
      dentalClinicKB,
    ).reason).toBe('non_auto_quoteable_item');
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ itemId: 'extraction' })]),
      dentalClinicKB,
    ).reason).toBe('non_auto_quoteable_item');
  });

  it('rejects unbounded candidate and aggregate quantities', () => {
    expect(evaluateAutoQuotePolicy(
      assessment(Array.from({ length: MAX_AUTO_QUOTE_CANDIDATES + 1 }, () => treatment())),
      dentalClinicKB,
    ).reason).toBe('too_many_candidates');
    expect(evaluateAutoQuotePolicy(
      assessment([
        treatment({ itemId: 'crown-porcelain', quantity: 20 }),
        treatment({ itemId: 'crown-porcelain', quantity: 20, arch: 'lower' }),
      ]),
      dentalClinicKB,
    ).reason).toBe('aggregate_quantity_exceeded');
  });

  it('rejects a model claim that a proposed line needs no confirmation', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([treatment({ needsConfirmation: false })]),
      dentalClinicKB,
    ).reason).toBe('confirmation_flag_missing');
  });

  it('abstains when the model combines alternative commercial variants', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([
        treatment({ itemId: 'implant-standard' }),
        treatment({ itemId: 'implant-premium' }),
      ]),
      dentalClinicKB,
    ).reason).toBe('mutually_exclusive_variants');

    expect(evaluateAutoQuotePolicy(
      assessment([
        treatment({ itemId: 'crown-porcelain', quantity: 2 }),
        treatment({ itemId: 'crown-zirconia', quantity: 2 }),
      ]),
      dentalClinicKB,
    ).allowed).toBe(false);
  });

  it('still aggregates duplicate lines of the same commercial variant', () => {
    expect(evaluateAutoQuotePolicy(
      assessment([
        treatment({ itemId: 'implant-standard', quantity: 1, arch: 'upper' }),
        treatment({ itemId: 'implant-standard', quantity: 2, arch: 'lower' }),
      ]),
      dentalClinicKB,
    )).toEqual({ allowed: true, reason: 'allowed' });
  });
});
