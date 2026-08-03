import { z } from 'zod';
import type { PrivateLeadPayload } from './types.js';
import { base64ToBytes, bytesToBase64, bytesToBase64Url } from './encoding.js';
import { PATIENT_TARGET_AREAS, PATIENT_TREATMENT_GOALS } from '../dental/patientIntent.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PAYLOAD_VERSION = 'v2';

const PrivateLeadPayloadSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  email: z.string(),
  contactPreference: z.enum(['whatsapp', 'phone', 'email']),
  message: z.string(),
  attribution: z.object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
    term: z.string().optional(),
    content: z.string().optional(),
    landingPath: z.string().optional(),
  }),
  intent: z.object({
    treatmentGoal: z.enum(PATIENT_TREATMENT_GOALS),
    targetArea: z.enum(PATIENT_TARGET_AREAS),
  }).optional(),
  result: z.unknown().nullable(),
  leadAccessToken: z.string().optional(),
  submissionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  legacyClinicalReview: z.object({
    decision: z.enum(['approved', 'rejected']),
    reviewer: z.string(),
    reviewedAt: z.string(),
    note: z.string().optional(),
  }).nullable().optional(),
});

const LegacyPrivateLeadPayloadSchema = z.object({
  fullName: z.string(),
  contact: z.string(),
  message: z.string(),
  result: z.unknown().nullable(),
  review: z.object({
    decision: z.enum(['approved', 'rejected']),
    reviewer: z.string(),
    reviewedAt: z.string(),
    note: z.string().optional(),
  }).nullable().default(null),
});

function normalizeStoredResult(result: unknown): unknown {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return result;

  const {
    requiresClinicalReview: _legacyReviewFlag,
    ...currentResult
  } = result as Record<string, unknown>;
  return {
    ...currentResult,
    resultBasis: currentResult['resultBasis'] ??
      (currentResult['commercialEstimate'] ? 'commercial_scenario' : 'vision_items'),
    commercialEstimate: currentResult['commercialEstimate'] ?? null,
    // Version 1 estimates were also non-final. Enforce the current invariant even
    // if an old or malformed payload omitted the previous review flag.
    requiresClinicalConfirmation: true,
  };
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await sha256(value));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function timingSafeSecretEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export function createAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(base64Key);
  if (bytes.byteLength !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function additionalData(leadId: string): Uint8Array {
  return encoder.encode(`quotengine:lead:${leadId}`);
}

export async function encryptPrivatePayload(
  payload: PrivateLeadPayload,
  leadId: string,
  base64Key: string,
): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importEncryptionKey(base64Key);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(leadId) },
    key,
    plaintext,
  );
  return `${PAYLOAD_VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptPrivatePayload(
  value: string,
  leadId: string,
  base64Key: string,
): Promise<PrivateLeadPayload> {
  const [version, ivValue, encryptedValue] = value.split('.');
  if ((version !== 'v1' && version !== PAYLOAD_VERSION) || !ivValue || !encryptedValue) {
    throw new Error('Unsupported encrypted payload format');
  }
  const key = await importEncryptionKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(ivValue),
      additionalData: additionalData(leadId),
    },
    key,
    base64ToBytes(encryptedValue),
  );
  const decoded: unknown = JSON.parse(decoder.decode(plaintext));
  const current = PrivateLeadPayloadSchema.safeParse(decoded);
  if (current.success) {
    return {
      ...current.data,
      result: normalizeStoredResult(current.data.result),
    } as PrivateLeadPayload;
  }

  // Version 1 payloads can still be read after the direct-estimate migration. Existing
  // rows used one free-form contact field and a clinical-review object.
  const legacy = LegacyPrivateLeadPayloadSchema.parse(decoded);
  const legacyContactIsEmail = legacy.contact.includes('@');
  return {
    fullName: legacy.fullName,
    phone: legacyContactIsEmail ? '' : legacy.contact,
    email: legacyContactIsEmail ? legacy.contact : '',
    contactPreference: legacyContactIsEmail ? 'email' : 'phone',
    message: legacy.message,
    attribution: {},
    result: normalizeStoredResult(legacy.result),
    legacyClinicalReview: legacy.review,
  } as PrivateLeadPayload;
}
