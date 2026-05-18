import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 10;
const LEGACY_SHA256_HEX = /^[a-f0-9]{64}$/i;

/** เก็บรหัสผ่านใหม่ด้วย bcrypt */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export type VerifyPasswordResult = {
  ok: boolean;
  /** true เมื่อผ่านด้วย SHA-256 เก่า — ควรอัปเกรดเป็น bcrypt หลัง login */
  needsUpgrade: boolean;
};

/** ตรวจรหัสผ่าน — รองรับ bcrypt และ SHA-256 เก่าใน DB */
export function verifyPassword(password: string, storedHash: string): VerifyPasswordResult {
  if (!storedHash) return { ok: false, needsUpgrade: false };

  if (storedHash.startsWith('$2')) {
    return {
      ok: bcrypt.compareSync(password, storedHash),
      needsUpgrade: false,
    };
  }

  if (LEGACY_SHA256_HEX.test(storedHash)) {
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    return {
      ok: legacy === storedHash,
      needsUpgrade: true,
    };
  }

  return { ok: false, needsUpgrade: false };
}

export function isBcryptHash(storedHash: string): boolean {
  return storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$');
}
