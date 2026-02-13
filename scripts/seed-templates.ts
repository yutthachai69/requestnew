import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding Email Templates...');

    const templates = [
        {
            templateName: 'APPROVAL_REQUEST',
            subject: 'มีคำร้องใหม่รอการอนุมัติ: {{workOrderNo}}',
            description: 'ส่งหาผู้อนุมัติเมื่อมีคำร้องใหม่',
            body: `<div style="font-family: sans-serif;">
        <h2>เรียน {{approverName}}</h2>
        <p>มีรายการคำร้องขอแก้ไขข้อมูลใหม่ รอการอนุมัติจากท่าน</p>
        <p><strong>เลขที่เอกสาร:</strong> {{workOrderNo}}</p>
        <p><strong>ผู้ร้องขอ:</strong> {{requesterName}}</p>
        <p><strong>รายละเอียด:</strong> {{problemDetail}}</p>
        
        <p>กรุณาคลิกเพื่อดำเนินการ:</p>
        <p>
          <a href="{{approveLink}}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            เปิดดูรายละเอียดและอนุมัติ
          </a>
        </p>
        <hr />
        <p style="color: gray; font-size: 12px;">อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ</p>
      </div>`,
            placeholders: '{{workOrderNo}}, {{approverName}}, {{requesterName}}, {{problemDetail}}, {{approveLink}}'
        },
        {
            templateName: 'REQUEST_APPROVED',
            subject: 'คำร้องได้รับการอนุมัติ: {{workOrderNo}}',
            description: 'ส่งหาผู้ร้องขอเมื่อรายการได้รับอนุมัติ',
            body: `<div style="font-family: sans-serif;">
        <h2>เรียน {{requesterName}}</h2>
        <p>คำร้องของท่าน <strong>{{workOrderNo}}</strong> ได้รับการอนุมัติแล้ว</p>
        <p>ขณะนี้กำลังดำเนินการในขั้นตอนถัดไป</p>
        <hr />
        <p style="color: gray; font-size: 12px;">อีเมลนี้ส่งจากระบบอัตโนมัติ</p>
      </div>`,
            placeholders: '{{workOrderNo}}, {{requesterName}}'
        },
        {
            templateName: 'REQUEST_REJECTED',
            subject: 'คำร้องถูกปฏิเสธ: {{workOrderNo}}',
            description: 'ส่งหาผู้ร้องขอเมื่อรายการถูกปฏิเสธ',
            body: `<div style="font-family: sans-serif;">
        <h2>เรียน {{requesterName}}</h2>
        <p style="color: red;">คำร้องของท่าน <strong>{{workOrderNo}}</strong> ถูกปฏิเสธ</p>
        <p><strong>เหตุผล:</strong> {{rejectReason}}</p>
        <p><strong>ผู้ดำเนินการ:</strong> {{approverName}}</p>
        <hr />
        <p style="color: gray; font-size: 12px;">อีเมลนี้ส่งจากระบบอัตโนมัติ</p>
      </div>`,
            placeholders: '{{workOrderNo}}, {{requesterName}}, {{rejectReason}}, {{approverName}}'
        },
        {
            templateName: 'IT_COMPLETED',
            subject: 'ดำเนินการแก้ไขเรียบร้อยแล้ว: {{workOrderNo}}',
            description: 'ส่งหาผู้ร้องขอเมื่อ IT ดำเนินการเสร็จสิ้น',
            body: `<div style="font-family: sans-serif;">
          <h2>เรียน {{requesterName}}</h2>
          <p>คำร้อง <strong>{{workOrderNo}}</strong> ทาง IT ได้ดำเนินการแก้ไขเรียบร้อยแล้ว</p>
          <p>กรุณาตรวจสอบความถูกต้อง</p>
          <hr />
          <p style="color: gray; font-size: 12px;">อีเมลนี้ส่งจากระบบอัตโนมัติ</p>
        </div>`,
            placeholders: '{{workOrderNo}}, {{requesterName}}'
        }
    ];

    for (const t of templates) {
        await prisma.emailTemplate.upsert({
            where: { templateName: t.templateName },
            update: {
                description: t.description,
                subject: t.subject,
                body: t.body,
                placeholders: t.placeholders
            },
            create: t
        });
        console.log(`Synced template: ${t.templateName}`);
    }

    console.log('✅ Email Templates seeded.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
