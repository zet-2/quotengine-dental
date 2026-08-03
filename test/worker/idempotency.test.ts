import { describe, expect, it } from 'vitest';
import {
  createSubmissionFingerprint,
  createSubmissionFingerprints,
  requireMatchingSubmission,
} from '../../src/worker/idempotency.js';
import type { LeadSubmission } from '../../src/worker/types.js';

function submission(overrides: Partial<LeadSubmission> = {}): LeadSubmission {
  return {
    fullName: 'Mario Rossi',
    phone: '+999 000 0000000',
    email: 'mario@example.com',
    contactPreference: 'whatsapp',
    intent: { treatmentGoal: 'replace_few_teeth', targetArea: 'upper' },
    message: 'Preventivo indicativo',
    attribution: { source: 'google', landingPath: '/it/preventivo' },
    language: 'it',
    healthDataConsent: true,
    radiographStorageConsent: false,
    consentVersion: 'v1',
    consentTextSha256: '1'.repeat(64),
    privacyNoticeUrl: 'https://example.com/privacy',
    privacyNoticeSha256: '2'.repeat(64),
    image: {
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: 'image/jpeg',
      extension: 'jpg',
      width: 64,
      height: 64,
    },
    ...overrides,
  };
}

describe('submission fingerprint', () => {
  it('is stable for the same normalized submission', async () => {
    expect(await createSubmissionFingerprint(submission()))
      .toBe(await createSubmissionFingerprint(submission()));
  });

  it('changes with patient, image, storage, or consent context', async () => {
    const baseline = await createSubmissionFingerprint(submission());
    const variants = [
      submission({ email: 'different@example.com' }),
      submission({ radiographStorageConsent: true }),
      submission({ intent: { treatmentGoal: 'fixed_full_arch', targetArea: 'upper' } }),
      submission({ intent: { treatmentGoal: 'replace_few_teeth', targetArea: 'lower' } }),
      submission({ consentVersion: 'v2' }),
      submission({ consentTextSha256: '3'.repeat(64) }),
      submission({ privacyNoticeUrl: 'https://example.com/privacy-v2' }),
      submission({ privacyNoticeSha256: '4'.repeat(64) }),
      submission({
        image: {
          ...submission().image,
          bytes: new Uint8Array([1, 2, 4]),
        },
      }),
    ];

    for (const variant of variants) {
      expect(await createSubmissionFingerprint(variant)).not.toBe(baseline);
    }
  });

  it('recovers pre-intent retries only through the exact legacy fingerprint', async () => {
    const fingerprints = await createSubmissionFingerprints(submission());
    expect(fingerprints.legacyWithoutIntent).toBe(
      '80cf7fe99615ab3f1dc03d0355fe94c0beeb0b4984ea7c25e48363099c9b79bd',
    );
    const legacyPayload = {
      fullName: 'Mario Rossi',
      phone: '+999 000 0000000',
      email: 'mario@example.com',
      contactPreference: 'whatsapp' as const,
      message: 'Preventivo indicativo',
      attribution: { source: 'google' },
      result: null,
      submissionFingerprint: fingerprints.legacyWithoutIntent,
    };

    expect(() => requireMatchingSubmission(
      legacyPayload,
      fingerprints.current,
      fingerprints.legacyWithoutIntent,
    )).not.toThrow();
    const wrongLegacyFingerprint = (await createSubmissionFingerprints(
      submission({ email: 'other@example.com' }),
    )).legacyWithoutIntent;
    expect(() => requireMatchingSubmission(
      legacyPayload,
      fingerprints.current,
      wrongLegacyFingerprint,
    )).toThrow(/different submission/);
  });

  it('fingerprints an absent full-arch image deterministically', async () => {
    const withoutImage = submission({
      intent: { treatmentGoal: 'fixed_full_arch', targetArea: 'both' },
      image: null,
    });
    expect(await createSubmissionFingerprint(withoutImage))
      .toBe(await createSubmissionFingerprint(withoutImage));
  });
});
