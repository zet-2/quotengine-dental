import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DENTAL_KB_VERSION,
  DENTAL_PIPELINE_VERSION,
  DENTAL_PROMPT_VERSION,
  DENTAL_TOOL_SCHEMA_VERSION,
} from '../../src/dental/modelMetadata.js';
import { COMMERCIAL_CATALOG_VERSION } from '../../src/dental/commercialCatalog.js';

function readJson(relativeUrl: string): unknown {
  return JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8'));
}

interface OpenApiSpec {
  readonly openapi: string;
  readonly info: { readonly version: string };
  readonly paths: Record<string, Record<string, unknown>> & {
    readonly '/api/leads': {
      readonly post: {
        readonly requestBody: {
          readonly content: {
            readonly 'multipart/form-data': {
              readonly schema: {
                readonly required: readonly string[];
                readonly properties: {
                  readonly treatmentGoal: { readonly default: string };
                  readonly targetArea: { readonly default: string };
                  readonly image: { readonly description: string };
                };
              };
            };
          };
        };
      };
    };
  };
  readonly components: {
    readonly schemas: {
      readonly LeadStatus: { readonly enum: readonly string[] };
      readonly PublicLead: {
        readonly properties: { readonly consent: { readonly $ref: string } };
      };
      readonly StoredDentalResult: {
        readonly properties: {
          readonly assessment: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly quote: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly json: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly priceRange: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly commercialEstimate: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
        };
      };
      readonly IndicativeEstimate: {
        readonly properties: {
          readonly requiresInPersonConfirmation: { readonly const: boolean };
          readonly targetArea: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly quote: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly priceRange: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
          readonly commercialEstimate: { readonly anyOf: readonly [{ readonly $ref: string }, unknown] };
        };
      };
    };
  };
}

describe('repository contracts', () => {
  it('keeps every Worker route synchronized with the OpenAPI document', () => {
    const source = readFileSync(
      new URL('../../src/worker/createApp.ts', import.meta.url),
      'utf8',
    );
    const implemented = [...source.matchAll(/app\.(get|post|delete)\('([^']+)'/g)]
      .map((match) => `${match[1]!.toUpperCase()} ${match[2]!.replace(':id', '{id}')}`)
      .sort();

    const spec = readJson('../../openapi/quotengine.openapi.json') as OpenApiSpec;
    const documented = Object.entries(spec.paths)
      .flatMap(([path, operations]) => Object.keys(operations)
        .filter((method) => ['get', 'post', 'delete'].includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`))
      .sort();

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe('4.0.0');
    expect(documented).toEqual(implemented);
    expect(Object.keys(spec.paths).some((path) => path.includes('approve'))).toBe(false);
    expect(Object.keys(spec.paths).some((path) => path.includes('reject'))).toBe(false);
  });

  it('documents compatible funnel defaults and direct-estimate states', () => {
    const spec = readJson('../../openapi/quotengine.openapi.json') as OpenApiSpec;
    const multipart = spec.paths['/api/leads'].post.requestBody.content['multipart/form-data'].schema;

    expect(multipart.required).toEqual(expect.arrayContaining([
      'fullName',
      'phone',
      'email',
      'contactPreference',
      'healthDataConsent',
    ]));
    expect(multipart.required).not.toEqual(expect.arrayContaining([
      'treatmentGoal',
      'targetArea',
      'image',
    ]));
    expect(multipart.properties.treatmentGoal.default).toBe('unsure');
    expect(multipart.properties.targetArea.default).toBe('both');
    expect(multipart.properties.image.description).toContain('fixed_full_arch');
    expect(spec.components.schemas.LeadStatus.enum).toEqual([
      'received',
      'estimate_ready',
      'processing_failed',
    ]);
    expect(spec.components.schemas.IndicativeEstimate.properties.requiresInPersonConfirmation.const)
      .toBe(true);
    expect(spec.components.schemas.IndicativeEstimate.properties.targetArea.anyOf[0].$ref)
      .toBe('#/components/schemas/PatientTargetArea');
  });

  it('keeps the stable patient and admin payloads fully referenced in OpenAPI', () => {
    const schemas = (readJson('../../openapi/quotengine.openapi.json') as OpenApiSpec)
      .components.schemas;

    expect(schemas.PublicLead.properties.consent.$ref)
      .toBe('#/components/schemas/ConsentRecord');
    expect(schemas.StoredDentalResult.properties.assessment.anyOf[0].$ref)
      .toBe('#/components/schemas/StoredDentalAssessment');
    expect(schemas.StoredDentalResult.properties.quote.anyOf[0].$ref)
      .toBe('#/components/schemas/Quote');
    expect(schemas.StoredDentalResult.properties.json.anyOf[0].$ref)
      .toBe('#/components/schemas/RenderedQuote');
    expect(schemas.StoredDentalResult.properties.priceRange.anyOf[0].$ref)
      .toBe('#/components/schemas/PriceRange');
    expect(schemas.StoredDentalResult.properties.commercialEstimate.anyOf[0].$ref)
      .toBe('#/components/schemas/CommercialEstimate');
    expect(schemas.IndicativeEstimate.properties.quote.anyOf[0].$ref)
      .toBe('#/components/schemas/PatientQuote');
    expect(schemas.IndicativeEstimate.properties.priceRange.anyOf[0].$ref)
      .toBe('#/components/schemas/PriceRange');
    expect(schemas.IndicativeEstimate.properties.commercialEstimate.anyOf[0].$ref)
      .toBe('#/components/schemas/CommercialEstimate');
  });

  it('requires an explicit rights decision for every registered external dataset', () => {
    const registry = readJson('../../eval/datasets/registry.json') as {
      schemaVersion: number;
      reviewedAt: string;
      datasets: Array<{
        id: string;
        datasetUrl: string;
        license: string;
        commercialUse: string;
        decision: string;
      }>;
    };
    const ids = registry.datasets.map((dataset) => dataset.id);

    expect(registry.schemaVersion).toBe(1);
    expect(registry.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(registry.datasets.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dataset of registry.datasets) {
      expect(dataset.datasetUrl).toMatch(/^https:\/\//);
      expect(dataset.license.trim()).not.toBe('');
      expect(dataset.commercialUse.trim()).not.toBe('');
      expect(dataset.decision.trim()).not.toBe('');
    }
  });

  it('exposes non-placeholder reproducibility versions for persisted estimates', () => {
    expect(DENTAL_PIPELINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DENTAL_PROMPT_VERSION).toContain('direct-estimate');
    expect(DENTAL_TOOL_SCHEMA_VERSION).toMatch(/^\d+$/);
    expect(DENTAL_KB_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(COMMERCIAL_CATALOG_VERSION).toMatch(
      /^\d{4}-\d{2}-\d{2}\.demo-v\d+$/,
    );
  });
});
