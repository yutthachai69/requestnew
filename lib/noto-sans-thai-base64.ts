/**
 * Noto Sans Thai Thin – Base64 สำหรับ embed ใน PDF หรือที่ต้องใช้ font แบบ embed
 * เทียบ frontend/src/helpers/NotoSansThai-Thin-normal.js
 *
 * การใช้ในแอป Next.js:
 * - ตัวอักษรไทยบนเว็บ: ใช้ next/font เช่น next/font/google with 'Noto Sans Thai'
 * - สร้าง PDF (jsPDF / pdf-lib ฯลฯ): ใช้ notoSansThaiThinBase64 เพื่อ embed ฟอนต์
 *
 * ค่า: ตั้ง NOTO_SANS_THAI_THIN_BASE64 ใน .env หรือ copy base64 ทั้งก้อนจากไฟล์เดิม
 * มาแทนที่ค่าด้านล่างได้ (ไฟล์เดิมมีขนาดใหญ่)
 */
export const notoSansThaiThinBase64: string =
  process.env.NOTO_SANS_THAI_THIN_BASE64 ?? '';
