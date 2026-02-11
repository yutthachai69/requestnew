import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/requests/[id]/pdf
 * สร้าง PDF ใบ F07 ที่มีข้อความจากคำร้องฝังในไฟล์ (เลือก/ค้นหาข้อความได้)
 *
 * หมายเหตุเรื่องภาษาไทยใน pdf-lib:
 * - pdf-lib ไม่รองรับ Thai Character Shaping (สระบน/ล่าง วรรณยุกต์) จึงอาจเกิด "สระลอย" หรือตัวอักษรซ้อน
 * - แก้เบื้องต้น: ใช้ฟอนต์ไทย (Noto Sans Thai) และระยะบรรทัด (line height) ที่ใหญ่พอ
 * - ถ้าต้องการผลลัพธ์ตรงกับ F07FormPrint 100% แนะนำให้ใช้ Puppeteer/Playwright ทำ Print to PDF จากหน้า HTML โดยตรง (ดู docs/PDF-THAI.md)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await params).id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName;

  try {
    const req = await prisma.iTRequestF07.findUnique({
      where: { id },
      include: { department: true, category: true, location: true },
    });

    if (!req) return NextResponse.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
    if (roleName !== 'Admin' && userId && req.requesterId !== Number(userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pdfBytes = await buildF07Pdf(req);
    const body = Buffer.from(pdfBytes);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="F07-${req.workOrderNo ?? id}.pdf"`,
      },
    });
  } catch (e) {
    console.error('GET /api/requests/[id]/pdf', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const THAI_FONT_CDN = 'https://cdn.jsdelivr.net/npm/@electron-fonts/noto-sans-thai@1.2.0/fonts/NotoSansThai-Regular.ttf';
let cachedThaiFontBytes: Uint8Array | null = null;

async function loadThaiFontFromCDN(): Promise<Uint8Array | null> {
  if (cachedThaiFontBytes) return cachedThaiFontBytes;
  try {
    const res = await fetch(THAI_FONT_CDN, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1000) return null;
    cachedThaiFontBytes = new Uint8Array(buf);
    return cachedThaiFontBytes;
  } catch {
    return null;
  }
}

/** เก็บเฉพาะตัวที่ Helvetica (WinAnsi) วาดได้ — ถ้าไม่มีฟอนต์ไทยใช้แทนที่ตัวอื่นเป็น ? */
function sanitizeForWinAnsi(text: string): string {
  if (!text) return text;
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) return c; // ASCII printable
      if (code === 0xa0) return ' '; // nbsp
      return '?';
    })
    .join('');
}

async function buildF07Pdf(req: {
  workOrderNo: string | null;
  thaiName: string;
  phone: string | null;
  problemDetail: string;
  systemType: string;
  createdAt: Date;
  department: { name: string } | null;
  location: { name: string } | null;
  category: { name: string } | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  let font = await doc.embedFont(StandardFonts.Helvetica);
  let fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let useThaiFont = false;

  // 1) ฟอนต์ไทยจาก .env
  const thaiFontBase64 = process.env.NOTO_SANS_THAI_THIN_BASE64;
  if (thaiFontBase64 && thaiFontBase64.length > 100) {
    try {
      const fontBytes = new Uint8Array(Buffer.from(thaiFontBase64, 'base64'));
      font = await doc.embedFont(fontBytes);
      fontBold = font;
      useThaiFont = true;
    } catch {
      // ใช้ fallback ต่อ
    }
  }

  // 2) ฟอนต์ไทยจากแพ็กเกจใน node_modules (@electron-fonts/noto-sans-thai)
  if (!useThaiFont) {
    const fontPath = path.join(process.cwd(), 'node_modules', '@electron-fonts', 'noto-sans-thai', 'fonts', 'NotoSansThai-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      try {
        const fontBytes = new Uint8Array(fs.readFileSync(fontPath));
        font = await doc.embedFont(fontBytes);
        fontBold = font;
        useThaiFont = true;
      } catch (e) {
        console.warn('PDF: embed Thai font failed', e);
      }
    }
  }

  // 3) ฟอนต์ไทยจากไฟล์ lib/fonts (รัน npm run download-thai-font ครั้งเดียว)
  if (!useThaiFont) {
    const fontPath = path.join(process.cwd(), 'lib', 'fonts', 'NotoSansThai-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      try {
        const fontBytes = new Uint8Array(fs.readFileSync(fontPath));
        font = await doc.embedFont(fontBytes);
        fontBold = font;
        useThaiFont = true;
      } catch {
        // ใช้ fallback ต่อ
      }
    }
  }

  // 4) ฟอนต์ไทยจาก CDN (โหลดครั้งแรกแล้วแคชในหน่วยความจำ)
  if (!useThaiFont) {
    const fontBytes = await loadThaiFontFromCDN();
    if (fontBytes) {
      try {
        font = await doc.embedFont(fontBytes);
        fontBold = font;
        useThaiFont = true;
      } catch {
        // ใช้ Helvetica + sanitize ต่อ
      }
    }
  }

  const t = (s: string) => (useThaiFont ? s : sanitizeForWinAnsi(s));
  const LINE_HEIGHT_THAI = 18;

  // โหลดโลโก้ TSM (ถ้ามี)
  let logoImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  const logoPath = path.join(process.cwd(), 'public', 'tsmlogo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logoBytes = new Uint8Array(fs.readFileSync(logoPath));
      logoImage = await doc.embedPng(logoBytes);
    } catch {
      // ไม่มีโลโก้ ก็ข้าม
    }
  }

  // A4 ขนาดจริง; pdf-lib ใช้ Y จากล่าง (0) ขึ้นบน (842)
  const pageHeight = 841.89;
  const pageWidth = 595.28;
  const page = doc.addPage([pageWidth, pageHeight]);
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const size = 10;
  const black = rgb(0, 0, 0);
  const grayBg = rgb(0.95, 0.95, 0.95);
  const blueFill = rgb(0.55, 0.82, 1);
  const blueBorder = rgb(0.1, 0.4, 0.85);
  const grayText = rgb(0.2, 0.2, 0.2);

  // จุดอ้างอิงกล่อง (Box Reference Points) — Y คงที่เพื่อไม่ให้ Layout เลื่อน
  const HEADER_TOP = 800;
  const HEADER_BOTTOM = 730;
  const USER_TOP = 720;
  const USER_BOTTOM = 680;
  const DETAIL_TOP = 670;
  const DETAIL_BOTTOM = 400;
  const IT_TOP = 390;
  const IT_BOTTOM = 200;

  // ----- กรอบนอกสุด -----
  page.drawRectangle({
    x: margin,
    y: margin,
    width: contentWidth,
    height: pageHeight - margin * 2,
    borderWidth: 1.5,
    borderColor: black,
  });

  // ----- 1. ส่วนหัว (Header Box: y 800–730) -----
  if (logoImage) {
    const logoDims = logoImage.scaleToFit(60, 60);
    page.drawImage(logoImage, {
      x: margin + 10,
      y: HEADER_TOP - 55,
      width: logoDims.width,
      height: logoDims.height,
    });
  }
  page.drawText('TSM GROUP', { x: margin + 80, y: HEADER_TOP - 20, size: 16, font: fontBold, color: black });
  page.drawText(t('กลุ่มเอสเอ็ม'), { x: margin + 80, y: HEADER_TOP - 35, size: 10, font, color: grayText });
  page.drawText(t('เปลี่ยนก่อนการเคลื่อนที่ ชีวิตที่สร้างสรรค์'), { x: margin + 80, y: HEADER_TOP - 50, size: 10, font, color: grayText });

  page.drawText(t('แบบฟอร์มขอแก้ไขข้อมูลระบบ'), {
    x: margin + contentWidth - 180,
    y: HEADER_TOP - 20,
    size: 14,
    font: fontBold,
    color: black,
  });
  page.drawText(t(`สถานที่ตั้ง: ${req.location?.name ?? ''}`), {
    x: margin + contentWidth - 180,
    y: HEADER_TOP - 34,
    size: size,
    font,
  });
  page.drawText(t(`วันที่แจ้ง: ${formatDate(req.createdAt.toISOString())}`), {
    x: margin + contentWidth - 180,
    y: HEADER_TOP - 48,
    size: size,
    font,
  });

  page.drawLine({
    start: { x: margin, y: HEADER_BOTTOM },
    end: { x: margin + contentWidth, y: HEADER_BOTTOM },
    thickness: 1.5,
    color: black,
  });

  // ----- 2. ข้อมูลผู้ขอ (User Info Box: y 720–680) -----
  page.drawRectangle({
    x: margin,
    y: USER_BOTTOM,
    width: contentWidth,
    height: USER_TOP - USER_BOTTOM,
    borderWidth: 1,
    borderColor: black,
  });
  const userTextY = USER_BOTTOM + (USER_TOP - USER_BOTTOM) / 2 - size / 2 + 10;
  page.drawText(t(`ชื่อภาษาไทย: ${req.thaiName}`), { x: margin + 10, y: userTextY, size, font });
  page.drawText(t(`แผนก: ${req.department?.name ?? ''}`), { x: margin + 220, y: userTextY, size, font });
  page.drawText(t('ตำแหน่ง: ........................'), { x: margin + 350, y: userTextY, size, font });
  page.drawText(t(`โทรศัพท์: ${req.phone ?? ''}`), { x: margin + contentWidth - 100, y: userTextY, size, font });

  page.drawLine({
    start: { x: margin, y: USER_BOTTOM },
    end: { x: margin + contentWidth, y: USER_BOTTOM },
    thickness: 1,
    color: black,
  });

  // ----- 3. รายละเอียดการแก้ไข (Detail Box: y 670–400) -----
  const detailBoxY = DETAIL_BOTTOM;

  const detailHeight = DETAIL_TOP - DETAIL_BOTTOM;
  page.drawRectangle({
    x: margin,
    y: detailBoxY,
    width: contentWidth,
    height: detailHeight,
    borderWidth: 1,
    borderColor: black,
  });

  page.drawText(t('รายละเอียดในการแก้ไขข้อมูลระบบ'), {
    x: margin + 10,
    y: detailBoxY + detailHeight - 15,
    size: 11,
    font: fontBold,
  });
  page.drawLine({
    start: { x: margin, y: detailBoxY + detailHeight - 22 },
    end: { x: margin + contentWidth, y: detailBoxY + detailHeight - 22 },
    thickness: 1,
    color: black,
  });

  const isErp = /^ERP\s*Softpro$/i.test(req.systemType ?? '');
  page.drawRectangle({
    x: margin + 15,
    y: detailBoxY + detailHeight - 42,
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: black,
    color: isErp ? grayBg : undefined,
  });
  const cbY = detailBoxY + detailHeight - 42;
  const checkSize = 7;
  const checkX1 = margin + 15 + (10 - checkSize) / 2 + 0.5;
  const checkY = cbY + 6;
  if (isErp) page.drawText('✓', { x: checkX1, y: checkY, size: checkSize, font: fontBold });
  page.drawText(t('ระบบ ERP Softpro'), { x: margin + 30, y: cbY + 1, size, font });

  page.drawRectangle({
    x: margin + 140,
    y: cbY,
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: black,
    color: !isErp ? grayBg : undefined,
  });
  const checkX2 = margin + 140 + (10 - checkSize) / 2 + 0.5;
  if (!isErp) page.drawText('✓', { x: checkX2, y: checkY, size: checkSize, font: fontBold });
  page.drawText(t('อื่นๆ (ระบุ)'), { x: margin + 155, y: cbY + 1, size, font });
  if (req.systemType && !isErp) {
    page.drawText(t(req.systemType), { x: margin + 230, y: cbY + 1, size, font });
  }

  const probBoxW = contentWidth * 0.65;
  const probBoxH = 180;
  const probBoxLeft = margin + 10;
  const probBoxBottom = detailBoxY + 30;

  page.drawRectangle({
    x: probBoxLeft,
    y: probBoxBottom,
    width: probBoxW,
    height: probBoxH,
    borderWidth: 1,
    borderColor: black,
  });
  page.drawRectangle({
    x: probBoxLeft,
    y: probBoxBottom + probBoxH - 22,
    width: probBoxW,
    height: 22,
    color: grayBg,
  });
  page.drawLine({
    start: { x: probBoxLeft, y: probBoxBottom + probBoxH - 22 },
    end: { x: probBoxLeft + probBoxW, y: probBoxBottom + probBoxH - 22 },
    thickness: 1,
    color: black,
  });
  page.drawText(t('ระบุรายละเอียดของปัญหา'), {
    x: probBoxLeft + 6,
    y: probBoxBottom + probBoxH - 17,
    size,
    font: fontBold,
  });

  const rowHeight = (probBoxH - 22) / 7;
  const problemLines = (req.problemDetail || '').split('\n').slice(0, 7);
  for (let i = 0; i < 7; i++) {
    const rowBottomY = probBoxBottom + (6 - i) * rowHeight;
    const lineY = rowBottomY + 2;
    page.drawLine({
      start: { x: probBoxLeft + 4, y: lineY },
      end: { x: probBoxLeft + probBoxW - 4, y: lineY },
      thickness: 1,
      color: black,
    });
    const textY = rowBottomY + Math.min(rowHeight * 0.4, LINE_HEIGHT_THAI * 0.5);
    page.drawText(t(problemLines[i] ?? ' '), {
      x: probBoxLeft + 6,
      y: textY,
      size,
      font,
    });
  }

  const sigX = margin + probBoxW + 20;
  const sigLabels = [t('ผู้ขอ'), t('ผู้ตรวจสอบ'), t('ผู้ตรวจสอบ (บัญชี)'), t('ผู้อนุมัติ')];
  const sigRowGap = 38;
  const sigBaseY = detailBoxY + detailHeight - 115;
  const sigTextOffset = 6;
  sigLabels.forEach((label, i) => {
    const sigY = sigBaseY - i * sigRowGap;
    const textY = sigY + sigTextOffset;
    page.drawText(label, { x: sigX, y: textY, size, font });
    page.drawText(label === t('ผู้ขอ') ? t(req.thaiName) : ' ', { x: sigX + 70, y: textY, size, font });
    page.drawLine({
      start: { x: sigX + 65, y: sigY },
      end: { x: margin + contentWidth - 15, y: sigY },
      thickness: 0.5,
      color: black,
    });
  });

  page.drawLine({
    start: { x: margin, y: detailBoxY },
    end: { x: margin + contentWidth, y: detailBoxY },
    thickness: 1,
    color: black,
  });

  const noteY = detailBoxY + 12;
  page.drawText(
    t('หมายเหตุ : สำนักงานกรุงเทพ ผู้ตรวจสอบ = ผู้จัดการฝ่าย // โรงงาน ผู้ตรวจสอบ = หน.แผนก/หน.ส่วน/ผู้จัดการฝ่าย, ผู้อนุมัติ = ผู้จัดการฝ่ายสำนักงาน/รองผู้อำนวยการโรงงาน/ผู้จัดการโรงงาน'),
    { x: margin + 10, y: noteY, size: 7, font }
  );

  // ----- 4. ส่วน IT (IT Box: y 390–200) -----
  const itHeight = IT_TOP - IT_BOTTOM;
  page.drawRectangle({
    x: margin,
    y: IT_BOTTOM,
    width: contentWidth,
    height: itHeight,
    borderWidth: 1,
    borderColor: black,
  });
  page.drawText(t('ส่วนเทคโนโลยีสารสนเทศ'), {
    x: margin + 10,
    y: IT_TOP - 15,
    size: 11,
    font: fontBold,
  });
  page.drawLine({
    start: { x: margin, y: IT_TOP - 22 },
    end: { x: margin + contentWidth, y: IT_TOP - 22 },
    thickness: 1,
    color: black,
  });

  page.drawText(t('ผู้อนุมัติ'), { x: margin + 10, y: IT_TOP - 52, size, font });
  page.drawText(t('ผู้แก้ไข'), { x: margin + 10, y: IT_TOP - 52 - LINE_HEIGHT_THAI, size, font });
  page.drawText(t('ปัญหาอุปสรรค (ถ้ามี)'), { x: margin + 10, y: IT_TOP - 52 - LINE_HEIGHT_THAI * 2, size, font });

  page.drawRectangle({
    x: margin + contentWidth - 210,
    y: IT_BOTTOM + 10,
    width: 200,
    height: 60,
    color: blueFill,
    borderWidth: 1,
    borderColor: blueBorder,
  });
  page.drawText(t(`หมายเลขที่งาน: ${req.workOrderNo ?? ''}`), {
    x: margin + contentWidth - 200,
    y: IT_BOTTOM + 50,
    size: 10,
    font: fontBold,
  });
  page.drawText(t('วันที่แก้ไข: ........................'), {
    x: margin + contentWidth - 200,
    y: IT_BOTTOM + 34,
    size: size,
    font,
  });
  page.drawText(t('เวลา: ..............'), {
    x: margin + contentWidth - 200,
    y: IT_BOTTOM + 18,
    size: size,
    font,
  });

  // ----- ท้ายกระดาษ -----
  page.drawText('IT01-IT-F07 Rev.3', {
    x: margin + contentWidth - 90,
    y: margin + 14,
    size: 9,
    font: fontBold,
  });

  return doc.save();
}
