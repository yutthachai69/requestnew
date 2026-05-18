import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { hashPassword, isBcryptHash, verifyPassword } from './hash';

describe('hashPassword', () => {
  it('returns a bcrypt hash', () => {
    const hash = hashPassword('secret');
    expect(isBcryptHash(hash)).toBe(true);
    expect(hash).not.toBe('secret');
  });
});

describe('verifyPassword', () => {
  it('verifies bcrypt passwords', () => {
    const hash = hashPassword('my-pass');
    expect(verifyPassword('my-pass', hash)).toEqual({ ok: true, needsUpgrade: false });
    expect(verifyPassword('wrong', hash)).toEqual({ ok: false, needsUpgrade: false });
  });

  it('verifies legacy SHA-256 and flags upgrade', () => {
    const legacy = crypto.createHash('sha256').update('old-pass').digest('hex');
    expect(verifyPassword('old-pass', legacy)).toEqual({ ok: true, needsUpgrade: true });
    expect(verifyPassword('wrong', legacy)).toEqual({ ok: false, needsUpgrade: true });
  });

  it('rejects empty or unknown hash formats', () => {
    expect(verifyPassword('x', '')).toEqual({ ok: false, needsUpgrade: false });
    expect(verifyPassword('x', 'not-a-hash')).toEqual({ ok: false, needsUpgrade: false });
  });
});
