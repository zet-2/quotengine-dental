const PNG_64_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAi4CAAAAKUlEQVR4nO3MQREAAAwCIKMb3RD77SAA6VEEAoFAIBAIBAKBQCAQfA8G320AeUC9G5AAAAAASUVORK5CYII=';
const PNG_1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function textChunk(text: string): Uint8Array {
  const type = new TextEncoder().encode('tEXt');
  const data = new TextEncoder().encode(text);
  const chunk = new Uint8Array(12 + data.length);
  chunk.set(uint32(data.length), 0);
  chunk.set(type, 4);
  chunk.set(data, 8);
  chunk.set(uint32(crc32(new Uint8Array([...type, ...data]))), 8 + data.length);
  return chunk;
}

function insertBeforeIend(png: Uint8Array, chunk: Uint8Array): Uint8Array {
  const iendOffset = png.length - 12;
  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.subarray(0, iendOffset), 0);
  result.set(chunk, iendOffset);
  result.set(png.subarray(iendOffset), iendOffset + chunk.length);
  return result;
}

export function testPng(width = 64, height = 64, includeText = false): Uint8Array {
  const base = width === 1 && height === 1 ? base64Bytes(PNG_1_BASE64) : base64Bytes(PNG_64_BASE64);
  return includeText ? insertBeforeIend(base, textChunk('Patient Name')) : base;
}

export function leadForm(storageConsent: boolean, overrides: Record<string, string> = {}): FormData {
  const values = {
    fullName: 'Mario Rossi',
    phone: '+999 000 0000000',
    email: 'mario.rossi@example.com',
    contactPreference: 'whatsapp',
    treatmentGoal: 'replace_few_teeth',
    targetArea: 'upper',
    message: 'Mi mancano alcuni denti e vorrei una valutazione.',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'implant-consultation-demo',
    utmTerm: 'impianti dentali',
    utmContent: 'hero-form',
    landingPath: '/it/preventivo',
    language: 'it',
    healthDataConsent: 'true',
    radiographStorageConsent: storageConsent ? 'true' : 'false',
    consentVersion: 'draft-2026-07-13',
    consentTextSha256: '0000000000000000000000000000000000000000000000000000000000000001',
    privacyNoticeSha256: '0000000000000000000000000000000000000000000000000000000000000011',
    ...overrides,
  };
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  form.set('image', new File([testPng(64, 64, true)], 'patient-name.png', { type: 'image/png' }));
  return form;
}
