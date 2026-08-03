import { HttpError } from './errors.js';
import type { ValidatedImage } from './types.js';

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 8_000;
const MIN_IMAGE_EDGE = 64;
const MAX_IMAGE_PIXELS = 32_000_000;
const MAX_CANONICAL_EDGE = 4_096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function validateDeclaredFormat(bytes: Uint8Array): void {
  if (startsWith(bytes, PNG_SIGNATURE) || startsWith(bytes, [0xff, 0xd8, 0xff])) return;
  throw new HttpError(422, 'unsupported_image', 'Only genuine JPEG and PNG images are accepted');
}

function validateDimensions(width: number, height: number): void {
  if (
    width < MIN_IMAGE_EDGE ||
    height < MIN_IMAGE_EDGE ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE
  ) {
    throw new HttpError(
      422,
      'invalid_image_dimensions',
      `Image dimensions must be between ${MIN_IMAGE_EDGE} and ${MAX_IMAGE_EDGE} pixels`,
    );
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new HttpError(
      422,
      'image_pixel_count_too_large',
      `Image must contain at most ${MAX_IMAGE_PIXELS} pixels`,
    );
  }
}

function canonicalDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_CANONICAL_EDGE / width, MAX_CANONICAL_EDGE / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

async function canonicalizeImage(
  source: Uint8Array,
  images: ImagesBinding,
): Promise<ValidatedImage> {
  let info: ImageInfoResponse;
  try {
    info = await images.info(byteStream(source));
  } catch {
    throw new HttpError(422, 'invalid_image', 'The uploaded file could not be decoded as an image');
  }
  if (!('width' in info)) throw new HttpError(422, 'unsupported_image', 'SVG images are not accepted');
  validateDimensions(info.width, info.height);
  const dimensions = canonicalDimensions(info.width, info.height);

  let response: Response;
  try {
    const output = await images
      .input(byteStream(source))
      .transform({ ...dimensions, fit: 'scale-down' })
      .output({ format: 'image/jpeg', quality: 95, anim: false });
    response = output.response();
  } catch {
    throw new HttpError(422, 'invalid_image', 'The uploaded image could not be normalized');
  }
  if (!response.ok) throw new HttpError(422, 'invalid_image', 'Image normalization failed');
  const contentLength = Number(response.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'normalized_image_too_large', 'The normalized image is too large');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'normalized_image_too_large', 'The normalized image is too large');
  }
  return {
    bytes,
    mediaType: 'image/jpeg',
    extension: 'jpg',
    width: dimensions.width,
    height: dimensions.height,
  };
}

export async function validateAndSanitizeImage(
  file: File,
  images: ImagesBinding,
): Promise<ValidatedImage> {
  if (file.size === 0) throw new HttpError(422, 'empty_image', 'The radiograph is empty');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'image_too_large', `The radiograph must be at most ${MAX_IMAGE_BYTES} bytes`);
  }
  const source = new Uint8Array(await file.arrayBuffer());
  validateDeclaredFormat(source);
  return canonicalizeImage(source, images);
}
