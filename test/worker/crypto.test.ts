import { describe, expect, it } from 'vitest';
import {
  decryptPrivatePayload,
  encryptPrivatePayload,
} from '../../src/worker/crypto.js';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

async function encryptLegacyPayload(payload: object, leadId: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = Uint8Array.from(atob(key), (character) => character.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = new Uint8Array(12).fill(7);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(`quotengine:lead:${leadId}`),
    },
    cryptoKey,
    encoder.encode(JSON.stringify(payload)),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

describe('private lead encryption', () => {
  it('round-trips private fields and binds ciphertext to the lead ID', async () => {
    const payload = {
      fullName: 'A',
      phone: '+999 000 0000000',
      email: 'a@example.com',
      contactPreference: 'whatsapp' as const,
      message: 'C',
      attribution: { source: 'google' },
      result: null,
    };
    const encrypted = await encryptPrivatePayload(payload, 'lead-1', key);

    expect(encrypted).not.toContain('"fullName":"A"');
    await expect(decryptPrivatePayload(encrypted, 'lead-1', key)).resolves.toEqual(payload);
    await expect(decryptPrivatePayload(encrypted, 'lead-2', key)).rejects.toThrow();
  });

  it('normalizes version 1 contact, review and result payloads after the direct-estimate migration', async () => {
    const encrypted = await encryptLegacyPayload({
      fullName: 'Legacy Patient',
      contact: 'legacy@example.com',
      message: 'Legacy request',
      result: {
        requiresClinicalReview: true,
        disclaimer: 'Legacy disclaimer',
        consultationOnly: false,
        quote: { id: 'legacy-quote' },
        text: 'Legacy estimate',
        json: { id: 'legacy-quote' },
        priceRange: null,
        assessment: {
          imageQuality: 'good',
          candidateTreatments: [{
            itemId: 'implant-standard',
            quantity: 1,
            rationale: 'Legacy candidate before arch was required',
            needsConfirmation: true,
          }],
        },
      },
      review: {
        decision: 'approved',
        reviewer: 'dentist@example.com',
        reviewedAt: '2026-07-12T10:00:00.000Z',
      },
    }, 'legacy-lead');

    await expect(decryptPrivatePayload(encrypted, 'legacy-lead', key)).resolves.toEqual({
      fullName: 'Legacy Patient',
      phone: '',
      email: 'legacy@example.com',
      contactPreference: 'email',
      message: 'Legacy request',
      attribution: {},
      result: {
        resultBasis: 'vision_items',
        requiresClinicalConfirmation: true,
        disclaimer: 'Legacy disclaimer',
        consultationOnly: false,
        quote: { id: 'legacy-quote' },
        text: 'Legacy estimate',
        json: { id: 'legacy-quote' },
        priceRange: null,
        commercialEstimate: null,
        assessment: {
          imageQuality: 'good',
          candidateTreatments: [{
            itemId: 'implant-standard',
            quantity: 1,
            rationale: 'Legacy candidate before arch was required',
            needsConfirmation: true,
          }],
        },
      },
      legacyClinicalReview: {
        decision: 'approved',
        reviewer: 'dentist@example.com',
        reviewedAt: '2026-07-12T10:00:00.000Z',
      },
    });
  });
});
