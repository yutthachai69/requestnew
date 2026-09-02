import { describe, expect, it } from 'vitest';
import {
  getFilePath,
  isAllowedFileType,
  isFileSizeValid,
  readFile,
  saveFile,
} from './storage';

describe('storage upload validation', () => {
  it('allows only the supported upload extensions', () => {
    expect(isAllowedFileType('document.pdf')).toBe(true);
    expect(isAllowedFileType('photo.PNG')).toBe(true);
    expect(isAllowedFileType('script.html')).toBe(false);
    expect(isAllowedFileType('image.png.exe')).toBe(false);
  });

  it('enforces the 10MB file size limit', () => {
    expect(isFileSizeValid(10 * 1024 * 1024)).toBe(true);
    expect(isFileSizeValid(10 * 1024 * 1024 + 1)).toBe(false);
  });

  it('rejects a file whose content does not match its extension', async () => {
    const fakePng = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'fake.png');
    await expect(saveFile(fakePng)).rejects.toThrow();
  });

  it('rejects traversal and nested paths', () => {
    expect(getFilePath('/api/files/../secret.pdf')).toBeNull();
    expect(getFilePath('/api/files/subdir/secret.pdf')).toBeNull();
    expect(getFilePath('/api/files/subdir\\secret.pdf')).toBeNull();
  });

  it('returns null for a missing file', async () => {
    await expect(readFile('/api/files/does-not-exist.pdf')).resolves.toBeNull();
  });
});
