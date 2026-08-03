import { HttpError } from './errors.js';
import { sha256Hex } from './crypto.js';
import type { LeadSubmission, PrivateLeadPayload } from './types.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!UUID_V4_PATTERN.test(key)) {
    throw new HttpError(
      400,
      'idempotency_key_required',
      'Idempotency-Key must be a cryptographically random UUID v4',
    );
  }
  return key;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Bind a retry key to normalized fields and any image actually processed, without plaintext. */
export async function createSubmissionFingerprints(
  submission: LeadSubmission,
): Promise<{ readonly current: string; readonly legacyWithoutIntent: string }> {
  const imageDigest = submission.image
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', submission.image.bytes))
    : null;
  const image = submission.image && imageDigest
    ? {
        sha256: bytesToHex(imageDigest),
        mediaType: submission.image.mediaType,
        width: submission.image.width,
        height: submission.image.height,
      }
    : null;
  const canonical = (includeIntent: boolean): string => JSON.stringify({
    fullName: submission.fullName,
    phone: submission.phone,
    email: submission.email,
    contactPreference: submission.contactPreference,
    ...(includeIntent ? { intent: submission.intent } : {}),
    message: submission.message,
    attribution: {
      source: submission.attribution.source ?? null,
      medium: submission.attribution.medium ?? null,
      campaign: submission.attribution.campaign ?? null,
      term: submission.attribution.term ?? null,
      content: submission.attribution.content ?? null,
      landingPath: submission.attribution.landingPath ?? null,
    },
    language: submission.language,
    healthDataConsent: submission.healthDataConsent,
    radiographStorageConsent: submission.radiographStorageConsent,
    consentVersion: submission.consentVersion,
    consentTextSha256: submission.consentTextSha256,
    privacyNoticeUrl: submission.privacyNoticeUrl,
    privacyNoticeSha256: submission.privacyNoticeSha256,
    image,
  });
  const [current, legacyWithoutIntent] = await Promise.all([
    sha256Hex(canonical(true)),
    sha256Hex(canonical(false)),
  ]);
  return { current, legacyWithoutIntent };
}

export async function createSubmissionFingerprint(submission: LeadSubmission): Promise<string> {
  return (await createSubmissionFingerprints(submission)).current;
}

/*
 * The historical field order above is deliberate: changing it would invalidate
 * retries created before the intent fields were introduced.
 */

/** Never return an earlier patient's token when a client reuses a key for different content. */
export function requireMatchingSubmission(
  payload: PrivateLeadPayload,
  fingerprint: string,
  legacyFingerprint?: string,
): void {
  const compatibleFingerprint = payload.intent ? fingerprint : legacyFingerprint ?? fingerprint;
  if (payload.submissionFingerprint !== compatibleFingerprint) {
    throw new HttpError(
      409,
      'idempotency_conflict',
      'Idempotency-Key was already used for a different submission',
    );
  }
}
