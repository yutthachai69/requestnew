// actions/f07-action.ts
'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendApprovalEmail } from '@/lib/mail'
import { getApprovalTemplate } from '@/lib/email-helper'
import { getFirstApproverForCategoryFromTransitions, getFirstApproverForCategory, getDeptManagerEmail } from '@/lib/workflow';
import { requesterRoles } from '@/lib/auth-constants';

import { saveFile } from '@/lib/storage';

export async function submitF07(formData: FormData) {
    const session = await getServerSession(authOptions)
    const userId = session?.user ? (session.user as { id?: string }).id : null
    if (!userId) {
        redirect('/login?callbackUrl=/request/new')
    }
    const roleName = (session?.user as { roleName?: string })?.roleName
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

    // 2. คำนวณปี พ.ศ. ปัจจุบัน
    const currentYearBE = new Date().getFullYear() + 543
    const shortYear = currentYearBE.toString().slice(-2)

    try {
        // 3. บันทึกลงฐานข้อมูล (Transaction)
        const newRequest = await prisma.$transaction(async (tx) => {
            // --- ส่วนที่ 1: รันเลขที่เอกสาร ---
            let config = await tx.docConfig.findFirst({
                where: { categoryId: categoryId, year: currentYearBE }
            })

            if (!config) {
                config = await tx.docConfig.create({
                    data: {
                        categoryId: categoryId,
                        year: currentYearBE,
                        prefix: 'IT-F07',
                        lastRunningNumber: 0
                    }
                })
            }

            const nextNumber = config.lastRunningNumber + 1
            await tx.docConfig.update({
                where: { id: config.id },
                data: { lastRunningNumber: nextNumber }
            })

            const workOrderNo = `${config.prefix}-${shortYear}-${nextNumber.toString().padStart(3, '0')}`

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
                    attachmentPath: await (async () => {
                        const files = formData.getAll('attachments') as File[];
                        if (!files.length) return null;

                        const paths: string[] = [];
                        for (const file of files) {
                            if (file.size > 0 && file.name !== 'undefined') {
                                try {
                                    const path = await saveFile(file);
                                    paths.push(path);
                                } catch (e) {
                                    console.error('File upload failed:', e);
                                }
                            }
                        }
                        return paths.length > 0 ? JSON.stringify(paths) : null;
                    })()
                }
            })
        })

        console.log(`✅ บันทึกสำเร็จ: ${newRequest.workOrderNo}`)

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

            const { subject, body } = getApprovalTemplate(newRequest, approver.fullName);
            await sendApprovalEmail({
                to: [approver.email],
                subject,
                body,
                senderName: thaiName, // ชื่อผู้แจ้งจากฟอร์ม
                replyTo: session?.user?.email || undefined, // อีเมลผู้แจ้งสำหรับ Reply-To
            });
            console.log(`📧 ส่งเมลหาผู้อนุมัติ: ${approver.fullName} เรียบร้อย`);
        } else {
            console.warn('⚠️ ไม่พบอีเมลผู้อนุมัติ (Workflow/หัวหน้าแผนก) ระบบข้ามการส่งเมลอัตโนมัติ');
        }

        revalidatePath('/dashboard')

        return {
            success: true,
            message: 'บันทึกคำร้องสำเร็จ',
            workOrderNo: newRequest.workOrderNo,
            id: newRequest.id
        }

    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error)
        return { error: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง' }
    }
}