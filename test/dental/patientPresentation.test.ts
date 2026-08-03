import { describe, expect, it } from 'vitest';
import {
  buildDemoIntakeText,
  isDemoGoal,
  renderDemoForm,
  renderDemoResult,
} from '../../src/dental/demoPage.js';
import { createDemoFullArchResult } from '../../src/dental/commercialCatalog.js';
import type { DentalQuoteResult } from '../../src/dental/generateDentalQuote.js';
import { toPatientDentalResult, type PatientDentalResult } from '../../src/dental/patientResult.js';

function internalConsultationResult(): DentalQuoteResult {
  return {
    resultBasis: 'vision_items',
    assessment: {
      archFindings: [
        { arch: 'upper', confidence: 'medium', observation: 'RAW_FINDING_SENTINEL' },
      ],
      candidateTreatments: [
        {
          itemId: 'implant-standard',
          quantity: 2,
          arch: 'upper',
          rationale: 'RAW_RATIONALE_SENTINEL',
          needsConfirmation: true,
        },
      ],
      existingRestorations: [
        { type: 'other', arch: 'upper', count: 2, note: 'RAW_OTHER_SENTINEL' },
      ],
      imageQuality: 'fair',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
    },
    requiresClinicalConfirmation: true,
    disclaimer: 'Preventivo indicativo.',
    consultationOnly: true,
    quote: null,
    text: 'RAW_FORMATTED_TEXT_SENTINEL',
    json: null,
    priceRange: null,
    commercialEstimate: null,
  };
}

describe('patient dental presentation boundary', () => {
  it('removes raw model assessment fields before JSON or HTML presentation', () => {
    const patient = toPatientDentalResult(internalConsultationResult());
    const serialized = JSON.stringify(patient);
    const html = renderDemoResult(patient, 'it');

    expect(patient).not.toHaveProperty('assessment');
    expect(serialized).not.toMatch(/RAW_FINDING|RAW_RATIONALE|RAW_OTHER|RAW_FORMATTED_TEXT/);
    expect(html).not.toMatch(/RAW_FINDING|RAW_RATIONALE|RAW_OTHER|RAW_FORMATTED_TEXT|2× other/);
    expect(html).toContain('non sono sufficienti per produrre una stima');
  });

  it('renders deterministic quote lines semantically without internal IDs or duplicate text', () => {
    const patient: PatientDentalResult = {
      estimateKind: 'indicative_non_binding',
      resultBasis: 'vision_items',
      targetArea: 'upper',
      consultationOnly: false,
      requiresInPersonConfirmation: true,
      disclaimer: 'Indicativo.',
      quote: {
        language: 'it',
        currency: 'EUR',
        lineItems: [{
          label: 'Corona <ceramica>',
          quantity: 2,
          unitPrice: 220,
          lineTotal: 440,
        }],
        subtotal: 440,
        labor: 80,
        fees: 0,
        modifiersApplied: [],
        modifiersTotal: 0,
        markup: 0,
        tax: 104,
        total: 624,
        generatedAt: '2026-07-13T10:00:00.000Z',
      },
      text: null,
      priceRange: null,
      commercialEstimate: null,
    };
    const html = renderDemoResult(patient, 'it');

    expect(html).toContain('<table class="breakdown">');
    expect(html).toContain('Corona &lt;ceramica&gt;');
    expect(html).toContain('Prestazioni cliniche');
    expect(html).toContain('IVA');
    expect(html).toContain('Totale scenario centrale');
    expect(html).toContain('arcata superiore');
    expect(html).not.toMatch(/INTERNAL_ITEM_SENTINEL|RAW_FORMATTED_TEXT_SENTINEL|<pre/);
  });

  it('projects stored quotes without public client, item, modifier or mapper-note identifiers', () => {
    const internal: DentalQuoteResult = {
      ...internalConsultationResult(),
      consultationOnly: false,
      quote: {
        clientId: 'INTERNAL_CLIENT_SENTINEL',
        language: 'it',
        currency: 'EUR',
        lineItems: [{
          itemId: 'INTERNAL_ITEM_SENTINEL',
          label: 'Corona',
          quantity: 1,
          unitPrice: 220,
          laborHoursPerUnit: 1,
          lineTotal: 220,
        }],
        subtotal: 220,
        labor: 40,
        fees: 0,
        modifiersApplied: [{
          id: 'INTERNAL_MODIFIER_SENTINEL',
          label: 'Urgenza',
          type: 'flat',
          value: 20,
          amount: 20,
        }],
        modifiersTotal: 20,
        markup: 0,
        tax: 56,
        total: 336,
        generatedAt: '2026-07-13T10:00:00.000Z',
        notes: 'INTERNAL_NOTE_SENTINEL',
      },
    };

    const serialized = JSON.stringify(toPatientDentalResult(internal));
    expect(serialized).not.toMatch(
      /INTERNAL_CLIENT_SENTINEL|INTERNAL_ITEM_SENTINEL|INTERNAL_MODIFIER_SENTINEL|INTERNAL_NOTE_SENTINEL|laborHoursPerUnit/,
    );
    expect(serialized).toContain('Corona');
    expect(toPatientDentalResult(internal, 'upper').targetArea).toBe('upper');
  });

  it('renders the synthetic full-arch demo scenario without inventing fixture lines', () => {
    const html = renderDemoResult(
      toPatientDentalResult(createDemoFullArchResult('both', 'it')),
      'it',
    );

    expect(html).toContain('Scenario full-arch dimostrativo');
    expect(html).toContain('5400');
    expect(html).toContain('8000');
    expect(html).toContain('2700');
    expect(html).toContain('4000');
    expect(html).toContain('entrambe le arcate');
    expect(toPatientDentalResult(createDemoFullArchResult('both', 'it')).targetArea)
      .toBe('both');
    expect(html).toContain('Non rappresenta prezzi di mercato né il listino di una clinica');
    expect(html).toContain('innesti');
    expect(html).not.toContain('<table class="breakdown">');
    expect(html).not.toMatch(/implant-standard|all-on-4/i);
  });

  it('collects a structured patient goal instead of relying on the image alone', () => {
    const text = buildDemoIntakeText(
      'replace_few_teeth',
      'Mi interessa soprattutto la parte superiore.',
      'it',
    );

    expect(text).toContain('Patient-declared goal:');
    expect(text).toContain('uno a tre denti');
    expect(text).toContain('parte superiore');
    expect(isDemoGoal('replace_few_teeth')).toBe(true);
    expect(isDemoGoal('invented_goal')).toBe(false);
    expect(renderDemoForm()).toContain('name="goal"');
    expect(renderDemoForm()).toContain('name="targetArea"');
    expect(renderDemoForm()).not.toContain('pacchetto non ancora configurato');
  });
});
