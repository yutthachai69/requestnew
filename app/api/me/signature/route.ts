import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api-error';
import { validateSignatureDataUrl } from '@/lib/signature';

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const { signatureData } = await req.json();

    if (signatureData !== null && typeof signatureData !== 'string') {
      return NextResponse.json({ error: 'ข้อมูลลายเซ็นไม่ถูกต้อง' }, { status: 400 });
    }

    // ตรวจซ้ำฝั่งเซิร์ฟเวอร์: ขนาด ชนิดไฟล์ และ magic bytes
    // (ฝั่ง client ตรวจแล้ว แต่ API ถูกเรียกตรงได้)
    if (signatureData) {
      const validation = validateSignatureDataUrl(signatureData);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.message }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: auth.id },
      data: { signatureUrl: signatureData },
    });

    return NextResponse.json({ success: true, message: 'บันทึกลายเซ็นสำเร็จ' });
  } catch (error) {
    return handleApiError(error, 'POST /api/me/signature');
  }
}
