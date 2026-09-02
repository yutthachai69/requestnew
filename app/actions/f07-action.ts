// actions/f07-action.ts
'use server'

import { getAuthUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendApprovalEmail } from '@/lib/mail'
import { getApprovalTemplate } from '@/lib/email-helper'
import { getFirstApproverForCategoryFromTransitions, getFirstApproverForCategory, getDeptManagerEmail } from '@/lib/workflow';
import { requesterRoles } from '@/lib/auth-constants';

import { saveFile, deleteFile } from '@/lib/storage';
import { handleActionError } from '@/lib/api-error';
import { withTransactionRetry, TRANSACTION_OPTIONS } from '@/lib/transaction-retry';
import { generateRequestNumber } from '@/lib/document-number';

export async function submitF07(formData: FormData) {
    const auth = await getAuthUser()
    if (!auth) {
        redirect('/login?callbackUrl=/request/new')
    }
    const userId = String(auth.id)
    const roleName = auth.roleName
    if (roleName == null || !requesterRoles.includes(roleName)) {
        redirect('/dashboard')
    }
    const requesterId = Number(userId)

    // 1. ดึงค่าจากฟอร์ม
    const thaiName = formData.get('thaiName') as string
    const phone = formData.get('phone') as string
    const departmentId = Number(formData.get('departmentId'))
    const locationId = Number(formData.get('locationId'))
    const categoryId = Number(formData.get('categoryId'))
    const problemDetail = formData.get('problemDetail') as string
    let systemType = (formData.get('systemType') as string) || 'ERP Softpro'
    const systemTypeOther = (formData.get('systemTypeOther') as string)?.trim()
    if (systemType === 'อื่นๆ' && systemTypeOther) systemType = systemTypeOther
    const isMoneyRelated = formData.get('isMoneyRelated') === 'true'

    // 3. เขียนไฟล์แนบลงดิสก์ *ก่อน* เปิด transaction
    //
    // เดิมเรียก saveFile() อยู่ข้างใน SERIALIZABLE transaction ทำให้ transaction
    // ถูกถือค้างไว้ตลอดเวลาที่เขียนไฟล์ (ช้าและไม่แน่นอน เพราะขึ้นกับดิสก์และ
    // ขนาดไฟล์) ซึ่งไปหน่วงคนอื่นที่กำลังออกเลขเอกสารตัวเดียวกัน และทำให้ชน
    // P2028 ("query cannot be executed on an expired transaction") เป็นครั้งคราว
    // ตอนนี้ transaction เหลือแต่งาน DB ล้วน ๆ
    const attachmentFiles = (formData.getAll('attachments') as File[]).filter(
        (file) => file.size > 0 && file.name !== 'undefined'
    );
    const savedPaths: string[] = [];
    for (const file of attachmentFiles) {
        try {
            savedPaths.push(await saveFile(file));
        } catch (e) {
            console.error('File upload failed:', e);
        }
    }
    const attachmentPath = savedPaths.length > 0 ? JSON.stringify(savedPaths) : null;

    try {
        // 4. บันทึกลงฐานข้อมูล (Transaction — เฉพาะงาน DB)
        const newRequest = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
            // --- ส่วนที่ 1: รันเลขที่เอกสาร ---
            // ใช้ generateRequestNumber ตัวเดียวกับเส้นทางอนุมัติ (เดิมไฟล์นี้มี
            // ตรรกะซ้ำของตัวเอง ทำให้แก้ปัญหา deadlock ที่ DocConfig ได้ไม่ทั่วถึง)
            const workOrderNo = await generateRequestNumber(tx, categoryId)

            const initialStatus = await tx.status.findFirst({
                where: { isInitialState: true },
                select: { id: true },
            })
            const currentStatusId = initialStatus?.id ?? 1

            // --- ส่วนที่ 2: บันทึกใบคำร้องจริง (State Machine: ใช้ currentStatusId) ---
            return await tx.iTRequestF07.create({
                data: {
                    workOrderNo: workOrderNo,
                    thaiName,
                    phone,
                    departmentId,
                    locationId,
                    categoryId,
                    problemDetail,
                    systemType,
                    isMoneyRelated,
                    status: 'PENDING',
                    currentStatusId,
                    requesterId,
                    approvalToken: crypto.randomUUID(),
                    attachmentPath,
                    ...(formData.get('correctionTypeIds') && JSON.parse(formData.get('correctionTypeIds') as string).length > 0 ? {
                        correctionTypes: {
                            create: JSON.parse(formData.get('correctionTypeIds') as string).map((id: number) => ({
                                correctionTypeId: id
                            }))
                        }
                    } : {})
                }
            })
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...TRANSACTION_OPTIONS }))

        // Log removed)

        // 🔥 4. ระบบส่งเมลหาผู้อนุมัติ: ใช้ WorkflowTransitions ก่อน; ไม่มีถึงใช้ WorkflowStep/หัวหน้าแผนก
        let approver = await getFirstApproverForCategoryFromTransitions(categoryId, departmentId)
        if (!approver) approver = await getFirstApproverForCategory(categoryId, departmentId)
        if (!approver) approver = await getDeptManagerEmail(departmentId)

        if (approver && approver.email) {
            // ✅ สร้าง Notification ในระบบด้วย
            if (approver.id) {
                const { createNotification } = await import('@/lib/notification');
                await createNotification(approver.id, `มีใบงานใหม่รออนุมัติ: ${newRequest.workOrderNo} (${thaiName})`, newRequest.id);
            }

            const { subject, body } = getApprovalTemplate(newRequest, approver.fullName, {
                approvalToken: newRequest.approvalToken,
            });
            const sent = await sendApprovalEmail({
                to: [approver.email],
                subject,
                body,
                senderName: thaiName,
                replyTo: auth.email || undefined,
            });
            if (!sent.ok) {
                console.error('[mail] ส่งเมลตอนสร้างคำร้องล้มเหลว:', sent);
            }
        } else {
            // ไม่มีใครรับคำร้องนี้ต่อ — ต้องแจ้ง Admin ไม่งั้นคำร้องจะค้างเงียบ
            const { notifyAdminsOfStalledRequest } = await import('@/lib/notification');
            await notifyAdminsOfStalledRequest({
                requestId: newRequest.id,
                workOrderNo: newRequest.workOrderNo,
                reason: 'ไม่พบผู้อนุมัติขั้นแรก หรือผู้อนุมัติไม่มีอีเมลในระบบ (ตรวจ Workflow และหัวหน้าแผนก)',
            });
        }

        revalidatePath('/dashboard')

        return {
            success: true,
            message: 'บันทึกคำร้องสำเร็จ',
            workOrderNo: newRequest.workOrderNo,
            id: newRequest.id
        }

    } catch (error) {
        // คำร้องไม่ถูกบันทึก — เก็บไฟล์ที่เพิ่งเขียนไว้ทิ้ง ไม่ให้เหลือไฟล์กำพร้า
        for (const filePath of savedPaths) {
            await deleteFile(filePath).catch(() => undefined);
        }
        return handleActionError(error, 'submitF07')
    }
}
