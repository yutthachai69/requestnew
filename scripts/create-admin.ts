/**
 * สร้างหรือรีเซ็ตรหัสผ่าน user admin (ใช้เมื่อล็อกอินไม่ได้ หรือยังไม่มี user)
 * รัน: npx tsx scripts/create-admin.ts
 * หรือ: npm run create-admin
 *
 * User ที่ได้: admin / admin123 (และ manager / manager123 ถ้ามี Role + Department แล้ว)
 */
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  try {
    await prisma.role.upsert({
      where: { id: 1 },
      update: {},
      create: { roleName: 'Admin', allowBulkActions: true },
    });
    await prisma.department.upsert({
      where: { id: 1 },
      update: {},
      create: { name: 'IT', isActive: true },
    });

    const adminPasswordHash = hashPassword('admin123');
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: { password: adminPasswordHash, isActive: true },
      create: {
        username: 'admin',
        password: adminPasswordHash,
        fullName: 'ผู้ดูแลระบบ',
        email: 'admin@company.local',
        roleId: 1,
        departmentId: 1,
        isActive: true,
      },
    });
    console.log('✅ Admin user พร้อมใช้: admin / admin123');

    const role3 = await prisma.role.findFirst({ where: { roleName: 'Head of Department' } }) ?? await prisma.role.findUnique({ where: { id: 3 } });
    if (role3) {
      const managerPasswordHash = hashPassword('manager123');
      await prisma.user.upsert({
        where: { username: 'manager' },
        update: { password: managerPasswordHash, isActive: true },
        create: {
          username: 'manager',
          password: managerPasswordHash,
          fullName: 'หัวหน้าแผนก IT',
          email: 'manager@company.local',
          roleId: role3.id,
          departmentId: 1,
          isActive: true,
        },
      });
      console.log('✅ Manager user พร้อมใช้: manager / manager123');
    }
  } finally {
    await prisma.$disconnect?.();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
