'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeApprovalByToken } from '@/lib/services/approvalService';
import { handleActionError } from '@/lib/api-error';

function getClientIp(headersList: Headers): string {
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  );
}

export type ApprovalActionResult = {
  success: boolean;
  message?: string;
};

export async function handleApprovalAction(
  token: string,
  status: 'APPROVED' | 'REJECTED',
  expectedUpdatedAt: string,
): Promise<ApprovalActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' };
  }

  const userId = (session.user as { id?: string }).id;
  const roleName = (session.user as { roleName?: string }).roleName ?? '';
  const userName = session.user.name ?? '';

  if (!userId) {
    return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };
  }

  try {
    const outcome = await executeApprovalByToken({
      expectedUpdatedAt,
      token,
      status,
      actor: {
        userId: Number(userId),
        roleName,
        userName,
        ipAddress: getClientIp(await headers()),
      },
    });

    revalidatePath(`/approve/${token}`);
    revalidatePath('/pending-tasks');
    revalidatePath('/dashboard');

    if (!outcome.ok) {
      return { success: false, message: outcome.message };
    }

    if (outcome.type === 'REJECT') {
      return { success: true, message: 'ส่งกลับแก้ไขเรียบร้อย' };
    }

    if (outcome.type === 'WAITING') {
      return {
        success: true,
        message: `บันทึกการอนุมัติแล้ว (รอผู้อื่น ${outcome.count}/${outcome.total})`,
      };
    }

    if (outcome.isClosing) {
      return { success: true, message: 'ดำเนินการและปิดงานเรียบร้อย' };
    }

    return { success: true, message: 'อนุมัติเรียบร้อย ส่งต่อขั้นถัดไปแล้ว' };
  } catch (error) {
    const { error: message } = handleActionError(error, 'handleApprovalAction');
    return { success: false, message };
  }
}
