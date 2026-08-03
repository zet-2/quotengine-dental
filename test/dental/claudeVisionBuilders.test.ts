/**
 * Tests for the pure builders inside ClaudeDentalVisionMapper. These lock the
 * safety-critical prompt rules, the tool schema, and the image-block mapping.
 * (The network call itself is verified live with an API key.)
 */
import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildTool,
  buildImageBlocks,
} from '../../src/dental/ClaudeDentalVisionMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

describe('ClaudeDentalVisionMapper builders', () => {
  it('buildImageBlocks maps intake images to base64 image blocks', () => {
    const blocks = buildImageBlocks([
      { kind: 'panoramic_xray', mediaType: 'image/jpeg', data: 'abc' },
    ]);
    expect(blocks).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' } },
    ]);
  });

  it('buildImageBlocks returns empty for no images', () => {
    expect(buildImageBlocks([])).toEqual([]);
  });

  it('buildTool exposes the assessment tool with all required fields', () => {
    const tool = buildTool();
    expect(tool.name).toBe('record_dental_assessment');
    const required = (tool.input_schema as { required?: string[] }).required ?? [];
    expect(required).toEqual(
      expect.arrayContaining([
        'archFindings',
        'candidateTreatments',
        'imageQuality',
        'overallConfidence',
        'requiresClinicalConfirmation',
      ]),
    );
  });

  it('buildSystemPrompt is conservative, non-diagnostic, and lists only KB item IDs', () => {
    const prompt = buildSystemPrompt(dentalClinicKB, 'en');
    expect(prompt).toContain(dentalClinicKB.clientName);
    expect(prompt).toContain('NON-DIAGNOSTIC');
    expect(prompt).toContain('requiresClinicalConfirmation');
    expect(prompt).toContain('implant-standard');
    expect(prompt).not.toContain('all-on-4');
  });

  it('buildSystemPrompt tells the model to catalog existing restorations and propose new work only', () => {
    const prompt = buildSystemPrompt(dentalClinicKB, 'en').toLowerCase();
    expect(prompt).toContain('existing restorations');
    expect(prompt).toContain('new work only');
    expect(prompt).toContain('natural teeth and edentulous spans are not restorations');
    expect(prompt).toContain('never record them as "other"');
  });

  it('buildTool exposes an existingRestorations field', () => {
    const props =
      (buildTool().input_schema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toContain('existingRestorations');
  });

  it('buildSystemPrompt instructs conservative (minimum) implant counts', () => {
    const prompt = buildSystemPrompt(dentalClinicKB, 'en').toLowerCase();
    expect(prompt).toContain('fewest implants');
    expect(prompt).toContain('full-arch');
    expect(prompt).toContain('not supported by the current commercial catalog');
  });

  it('buildSystemPrompt marks commercial variants as mutually exclusive', () => {
    const prompt = buildSystemPrompt(dentalClinicKB, 'en');
    expect(prompt).toContain('alternativeGroup: implant-system');
    expect(prompt).toContain('Select at most ONE item ID');
  });
});
