import { describe, expect, it } from 'vitest';
import { MAX_SIGNATURE_BYTES, validateSignatureDataUrl } from './signature';

function dataUrl(imageType: string, bytes: number[] | Buffer): string {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `data:image/${imageType};base64,${buffer.toString('base64')}`;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function webp(bytes = 32): Buffer {
  const buffer = Buffer.alloc(bytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  return buffer;
}

describe('validateSignatureDataUrl', () => {
  it('accepts the image types the profile page offers', () => {
    expect(validateSignatureDataUrl(dataUrl('png', PNG)).ok).toBe(true);
    expect(validateSignatureDataUrl(dataUrl('jpeg', JPEG)).ok).toBe(true);
    expect(validateSignatureDataUrl(dataUrl('jpg', JPEG)).ok).toBe(true);
    expect(validateSignatureDataUrl(dataUrl('gif', GIF)).ok).toBe(true);
    expect(validateSignatureDataUrl(dataUrl('webp', webp())).ok).toBe(true);
  });

  it('reports the decoded size and type on success', () => {
    const result = validateSignatureDataUrl(dataUrl('png', PNG));
    expect(result).toMatchObject({ ok: true, bytes: PNG.length, imageType: 'png' });
  });

  it('rejects anything that is not an image data URL', () => {
    for (const bad of [
      '',
      '   ',
      'https://example.com/signature.png',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:application/pdf;base64,JVBERi0=',
      `data:image/png,${'notbase64'}`,
      '<script>alert(1)</script>',
    ]) {
      expect(validateSignatureDataUrl(bad).ok, bad.slice(0, 40)).toBe(false);
    }
  });

  it('rejects an image type the app does not support', () => {
    const result = validateSignatureDataUrl(dataUrl('svg+xml', Buffer.from('<svg/>')));
    expect(result.ok).toBe(false);
    // SVG can carry script; it must not be storable as a signature.
    expect(result.ok === false && result.message).toContain('ไม่รองรับ');
  });

  it('rejects content whose bytes do not match the declared type', () => {
    // Claims PNG but carries JPEG bytes — the same trick the file upload path blocks.
    const result = validateSignatureDataUrl(dataUrl('png', JPEG));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('ไม่ตรงกับชนิด');

    // RIFF header that is not actually WebP (e.g. a .wav file).
    const notWebp = Buffer.alloc(32);
    notWebp.write('RIFF', 0, 'ascii');
    notWebp.write('WAVE', 8, 'ascii');
    expect(validateSignatureDataUrl(dataUrl('webp', notWebp)).ok).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(validateSignatureDataUrl('data:image/png;base64,').ok).toBe(false);
  });

  it('enforces the 2MB limit that the client claims to enforce', () => {
    const justUnder = Buffer.alloc(MAX_SIGNATURE_BYTES - 1024);
    Buffer.from(PNG).copy(justUnder);
    expect(validateSignatureDataUrl(dataUrl('png', justUnder)).ok).toBe(true);

    const tooBig = Buffer.alloc(MAX_SIGNATURE_BYTES + 1024);
    Buffer.from(PNG).copy(tooBig);
    const result = validateSignatureDataUrl(dataUrl('png', tooBig));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('2MB');
  });
});
