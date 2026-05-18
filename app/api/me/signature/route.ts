import { requireAuth, isAuthError } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;

    const { signatureData } = await req.json();

    if (signatureData !== null && typeof signatureData !== 'string') {
      return NextResponse.json({ error: 'ข้อมูลลายเซ็นไม่ถูกต้อง' }, { status: 400 });
    }

    if (signatureData && !signatureData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'รูปแบบไฟล์ลายเซ็นไม่ถูกต้อง' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: auth.id },
      data: { signatureUrl: signatureData },
    });

    return NextResponse.json({ success: true, message: 'บันทึกลายเซ็นสำเร็จ' });
  } catch (error) {
    console.error('Error saving signature:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' }, { status: 500 });
  }
}
