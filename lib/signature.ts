/**
 * ตรวจสอบลายเซ็นที่ส่งมาเป็น data URL
 *
 * หน้าโปรไฟล์จำกัดขนาด 2MB และชนิดไฟล์ไว้ฝั่ง client แล้ว แต่ API เปิดรับ
 * JSON ตรง ๆ ได้ — ถ้าไม่ตรวจซ้ำฝั่งเซิร์ฟเวอร์ ผู้ใช้ที่ยิง API เองสามารถ
 * ยัด base64 ขนาดเท่าไรก็ได้ลงคอลัมน์ NVarChar(Max) ซึ่งจะติดไปกับทุก
 * response ที่ส่งลายเซ็น และทุกครั้งที่ render PDF
 */

/** ขนาดสูงสุดของรูปลายเซ็นหลังถอด base64 (ตรงกับลิมิตฝั่ง client) */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/** ชนิดรูปที่รับ พร้อม magic bytes สำหรับตรวจว่าเป็นรูปจริง */
const ALLOWED_IMAGE_TYPES: Record<string, number[][]> = {
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpeg: [[0xff, 0xd8, 0xff]],
  jpg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF (ตามด้วย WEBP ที่ offset 8)
};

const DATA_URL = /^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

export type SignatureValidationResult =
  | { ok: true; bytes: number; imageType: string }
  | { ok: false; message: string };

function matchesMagicBytes(buffer: Buffer, imageType: string): boolean {
  const signatures = ALLOWED_IMAGE_TYPES[imageType];
  if (!signatures) return false;
  const matched = signatures.some((sig) =>
    sig.every((byte, index) => buffer.length > index && buffer[index] === byte)
  );
  if (!matched) return false;
  // WebP ต้องมี "WEBP" ต่อจาก RIFF ไม่งั้นเป็นไฟล์ RIFF ชนิดอื่น (เช่น .wav)
  if (imageType === 'webp') {
    return buffer.length > 11 && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return true;
}

/**
 * ตรวจ data URL ของลายเซ็น — คืนเหตุผลเป็นภาษาไทยเมื่อไม่ผ่าน
 * (ค่า null หมายถึง "ลบลายเซ็น" ให้ผู้เรียกจัดการก่อนเรียกฟังก์ชันนี้)
 */
export function validateSignatureDataUrl(value: string): SignatureValidationResult {
  const match = DATA_URL.exec(value.trim());
  if (!match) {
    return { ok: false, message: 'รูปแบบไฟล์ลายเซ็นไม่ถูกต้อง (ต้องเป็นรูปภาพแบบ base64)' };
  }

  const imageType = match[1].toLowerCase();
  const base64 = match[2];

  if (!(imageType in ALLOWED_IMAGE_TYPES)) {
    return {
      ok: false,
      message: `ชนิดรูปลายเซ็นไม่รองรับ (รองรับ ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')})`,
    };
  }

  // ประเมินขนาดจากความยาว base64 ก่อน เพื่อไม่ต้อง decode ข้อมูลก้อนใหญ่
  const approximateBytes = Math.floor((base64.length * 3) / 4);
  if (approximateBytes > MAX_SIGNATURE_BYTES) {
    return { ok: false, message: 'ขนาดรูปลายเซ็นต้องไม่เกิน 2MB' };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, message: 'ข้อมูลลายเซ็นเสียหาย' };
  }

  if (buffer.length === 0) {
    return { ok: false, message: 'ข้อมูลลายเซ็นว่างเปล่า' };
  }
  if (buffer.length > MAX_SIGNATURE_BYTES) {
    return { ok: false, message: 'ขนาดรูปลายเซ็นต้องไม่เกิน 2MB' };
  }
  if (!matchesMagicBytes(buffer, imageType)) {
    return { ok: false, message: 'เนื้อหาไฟล์ไม่ตรงกับชนิดรูปที่ระบุ' };
  }

  return { ok: true, bytes: buffer.length, imageType };
}
