import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/worker/errors.js';
import { validateAndSanitizeImage } from '../../src/worker/image.js';
import { testPng } from './helpers.js';

describe('Worker image validation', () => {
  it('detects PNG from bytes, ignores the filename, and strips text metadata', async () => {
    const source = testPng(64, 64, true);
    const image = await validateAndSanitizeImage(
      new File([source], 'patient-name.jpg', { type: 'image/jpeg' }),
      env.IMAGES,
    );

    expect(image.mediaType).toBe('image/jpeg');
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(new TextDecoder().decode(image.bytes)).not.toContain('Patient Name');
    expect(image.bytes.byteLength).toBeGreaterThan(0);
  });

  it('rejects images outside the allowed pixel dimensions', async () => {
    await expect(
      validateAndSanitizeImage(new File([testPng(1, 1)], 'tiny.png'), env.IMAGES),
    ).rejects.toMatchObject<HttpError>({ code: 'invalid_image_dimensions', status: 422 });
  });

  it('rejects a file whose declared type looks safe but whose bytes are not an image', async () => {
    await expect(
      validateAndSanitizeImage(
        new File(['not-an-image'], 'fake.png', { type: 'image/png' }),
        env.IMAGES,
      ),
    ).rejects.toMatchObject<HttpError>({ code: 'unsupported_image', status: 422 });
  });
});
import { env } from 'cloudflare:test';
