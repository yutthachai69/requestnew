// app/actions/it-request.ts
'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createITRequest(formData: FormData) {
  try {
    const categoryId = Number(formData.get('categoryId'))
    const currentYearBE = new Date().getFullYear() + 543
    const shortYear = currentYearBE.toString().slice(-2)

    const result = await prisma.$transaction(async (tx) => {
      // 1. รันเลขที่เอกสารอัตโนมัติ (Logic จาก DocConfig)
      let config = await tx.docConfig.findFirst({
        where: { categoryId, year: currentYearBE }
      })

      if (!config) {
        config = await tx.docConfig.create({
          data: { categoryId, year: currentYearBE, prefix: 'IT-F07', lastRunningNumber: 0 }
        })
      }

      const nextNumber = config.lastRunningNumber + 1
      await tx.docConfig.update({
        where: { id: config.id },
        data: { lastRunningNumber: nextNumber }
      })

      const workOrderNo = `${config.prefix}-${shortYear}-${nextNumber.toString().padStart(3, '0')}`

      // 2. บันทึกคำร้อง (ITRequestF07)
      const request = await tx.iTRequestF07.create({
        data: {
          workOrderNo,
          thaiName: formData.get('thaiName') as string,
          departmentId: Number(formData.get('departmentId')),
          locationId: Number(formData.get('locationId')),
          categoryId: categoryId,
          problemDetail: formData.get('problemDetail') as string,
          systemType: formData.get('systemType') as string,
          isMoneyRelated: formData.get('isMoneyRelated') === 'true',
          requesterId: 1, // สมมติว่าเป็น User ID 1 ไปก่อนจนกว่าจะทำระบบ Login
          status: 'PENDING',
          approvalToken: crypto.randomUUID(), // สร้าง Token ลับสำหรับส่งทางเมล
        }
      })

      // 3. TODO: ใส่ Logic ส่งอีเมลหาหัวหน้าแผนก (เดี๋ยวเรามาเขียนฟังก์ชันส่งเมลแยกกัน)
      // Log removed

      return request
    })

    revalidatePath('/dashboard')
    return { success: true, data: result }
  } catch (error) {
    console.error(error)
    return { success: false, error: 'ไม่สามารถส่งคำร้องได้' }
  }
}