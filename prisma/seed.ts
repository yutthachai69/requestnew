import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hashPassword } from '../lib/hash';

// PostgreSQL connection
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Roles
  console.log('Seeding Roles...');
  const roles = [
    { roleName: 'Admin', description: 'ผู้ดูแลระบบ' },
    { roleName: 'User', description: 'ผู้ใช้งานทั่วไป' },
    { roleName: 'Head of Department', description: 'หัวหน้าแผนก' },
    { roleName: 'Accountant', description: 'เจ้าหน้าที่บัญชี' },
    { roleName: 'Final Approver', description: 'ผู้อนุมัติขั้นสุดท้าย' },
    { roleName: 'IT', description: 'เจ้าหน้าที่ IT' },
    { roleName: 'IT Reviewer', description: 'ผู้ตรวจรับงาน IT' },

    { roleName: 'Warehouse', description: 'คลังสินค้า' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { roleName: r.roleName },
      update: { description: r.description },
      create: r,
    });
  }

  // Helper to get Role ID
  const getRoleId = async (name: string) => {
    const role = await prisma.role.findUnique({ where: { roleName: name } });
    if (!role) throw new Error(`Role ${name} not found`);
    return role.id;
  };

  const ridAdmin = await getRoleId('Admin');
  const ridUser = await getRoleId('User');
  const ridHead = await getRoleId('Head of Department');
  const ridAccountant = await getRoleId('Accountant');
  const ridFinal = await getRoleId('Final Approver');
  const ridIT = await getRoleId('IT');
  const ridITReviewer = await getRoleId('IT Reviewer');

  // 2. Departments
  console.log('Seeding Departments...');
  const departments = [
    { name: 'IT', isActive: true },
    { name: 'ฝ่ายไร่', isActive: true },
    { name: 'ห้องชั่งอ้อย', isActive: true },
    { name: 'คลังสินค้า', isActive: true },
    { name: 'บัญชี', isActive: true },
    { name: 'ศูนย์ขนถ่าย', isActive: true },
  ];

  for (const d of departments) {
    await prisma.department.upsert({
      where: { name: d.name },
      update: { isActive: d.isActive },
      create: d,
    });
  }

  // Helper to get Dept ID
  const getDeptId = async (name: string) => {
    const dept = await prisma.department.findUnique({ where: { name } });
    if (!dept) throw new Error(`Department ${name} not found`);
    return dept.id;
  };

  // 3. Users -> Create specific users requested
  console.log('Seeding Users...');
  const commonPassword = hashPassword('1234'); // Default password

  const users = [
    // Requesters
    { username: 'req_cane', fullName: 'Requester Cane', email: 'req_cane@example.com', roleId: ridUser, departmentId: await getDeptId('ฝ่ายไร่') },
    { username: 'req_weigh', fullName: 'Requester Weighbridge', email: 'req_weigh@example.com', roleId: ridUser, departmentId: await getDeptId('ห้องชั่งอ้อย') },
    { username: 'req_store', fullName: 'Requester Store', email: 'req_store@example.com', roleId: ridUser, departmentId: await getDeptId('คลังสินค้า') },

    // Approvers (Heads)
    { username: 'head_cane', fullName: 'Head of Cane', email: 'head_cane@example.com', roleId: ridHead, departmentId: await getDeptId('ฝ่ายไร่') },
    { username: 'head_weigh', fullName: 'Head of Weighbridge', email: 'head_weigh@example.com', roleId: ridHead, departmentId: await getDeptId('ห้องชั่งอ้อย') },
    { username: 'head_store', fullName: 'Head of Store', email: 'head_store@example.com', roleId: ridHead, departmentId: await getDeptId('คลังสินค้า') },

    // Central Approvers
    { username: 'accountant', fullName: 'Accountant User', email: 'accountant@example.com', roleId: ridAccountant, departmentId: await getDeptId('บัญชี') },
    { username: 'final', fullName: 'Final Approver', email: 'final@example.com', roleId: ridFinal, departmentId: null }, // Executive often no specific dept or 'Management'

    // IT
    { username: 'it_operator', fullName: 'IT Operator', email: 'it_op@example.com', roleId: ridIT, departmentId: await getDeptId('IT') },
    { username: 'it_reviewer', fullName: 'IT Reviewer', email: 'it_rev@example.com', roleId: ridITReviewer, departmentId: await getDeptId('IT') },

    // Admin
    { username: 'admin', fullName: 'System Admin', email: 'admin@requestonline.com', roleId: ridAdmin, departmentId: await getDeptId('IT') },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        fullName: u.fullName,
        email: u.email,
        roleId: u.roleId,
        departmentId: u.departmentId
      },
      create: { ...u, password: commonPassword, isActive: true },
    });
  }

  // 4. Statuses (Unchanged)
  console.log('Seeding Statuses...');
  const statuses = [
    { code: 'PENDING', displayName: 'รอหัวหน้าแผนกอนุมัติ', colorCode: '#F59E0B', displayOrder: 1, isInitialState: true },
    { code: 'WAITING_ACCOUNT_1', displayName: 'รอนำส่งบัญชีตรวจสอบ', colorCode: '#3B82F6', displayOrder: 2, isInitialState: false },
    { code: 'WAITING_FINAL_APP', displayName: 'รอผู้อนุมัติสูงสุด', colorCode: '#8B5CF6', displayOrder: 3, isInitialState: false },
    { code: 'IT_WORKING', displayName: 'รอ IT ดำเนินการ', colorCode: '#6366F1', displayOrder: 4, isInitialState: false },
    { code: 'WAITING_ACCOUNT_2', displayName: 'รอตรวจสอบหลังแก้ไข', colorCode: '#0EA5E9', displayOrder: 5, isInitialState: false },
    { code: 'WAITING_IT_CLOSE', displayName: 'รอ IT ปิดงาน', colorCode: '#06B6D4', displayOrder: 6, isInitialState: false },
    { code: 'CLOSED', displayName: 'ปิดงานเรียบร้อย', colorCode: '#10B981', displayOrder: 7, isInitialState: false },
    { code: 'REJECTED', displayName: 'ถูกปฏิเสธ', colorCode: '#EF4444', displayOrder: 8, isInitialState: false },
    { code: 'REVISION', displayName: 'ส่งกลับแก้ไข', colorCode: '#F97316', displayOrder: 9, isInitialState: false },
  ];

  for (const s of statuses) {
    await prisma.status.upsert({
      where: { code: s.code },
      update: { displayName: s.displayName, colorCode: s.colorCode, displayOrder: s.displayOrder, isInitialState: s.isInitialState },
      create: s,
    });
  }
  const statusIds = Object.fromEntries(
    (await prisma.status.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id])
  );
  const sid = (code: string) => statusIds[code] ?? 0;

  // 5. Actions (Unchanged)
  console.log('Seeding Actions...');
  const actions = [
    { id: 1, actionName: 'APPROVE', displayName: 'อนุมัติ' },
    { id: 2, actionName: 'REJECT', displayName: 'ปฏิเสธ/ส่งกลับ' },
    { id: 3, actionName: 'IT_PROCESS', displayName: 'ดำเนินการเสร็จสิ้น (IT)' },
    { id: 4, actionName: 'CONFIRM_COMPLETE', displayName: 'ยืนยันปิดงาน' },
  ];

  for (const a of actions) {
    await prisma.action.upsert({
      where: { id: a.id },
      update: { actionName: a.actionName, displayName: a.displayName },
      create: a,
    });
  }

  // 6. Categories & Workflows
  console.log('Seeding Categories & Workflows...');
  await prisma.location.upsert({ where: { name: 'สำนักงานใหญ่' }, update: {}, create: { name: 'สำนักงานใหญ่' } });

  // Define Categories based on user input mapping
  // "ฝ่ายไร่/ศูนย์ขนถ่าย" -> Cane Category
  // "ห้องชั่งอ้อย" -> Weighbridge Category
  // "คลังสินค้า" -> Warehouse Category
  // "ทั่วไป" -> General

  const categories = [
    { name: 'เก็บเกี่ยวและขนส่ง', requiresCCSClosing: true }, // Renamed from ฝ่ายไร่/ศูนย์ขนถ่าย
    { name: 'ธุรการวัตถุดิบ', requiresCCSClosing: true },     // New Split
    { name: 'ห้องชั่งอ้อย', requiresCCSClosing: true },
    { name: 'คลังสินค้า', requiresCCSClosing: false },
    { name: 'ทั่วไป', requiresCCSClosing: true },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { requiresCCSClosing: c.requiresCCSClosing },
      create: { name: c.name, requiresCCSClosing: c.requiresCCSClosing },
    });
  }

  const allCats = await prisma.category.findMany();

  // Create Workflow Transitions
  for (const cat of allCats) {
    // Clear existing transitions for clean slate (optional, but good for dev)
    await prisma.workflowTransition.deleteMany({ where: { categoryId: cat.id } });

    // Standard Steps
    // 1. PENDING -> WAITING_ACCOUNT_1 (Head Approve)
    await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('PENDING'), actionId: 1, requiredRoleId: ridHead, nextStatusId: sid('WAITING_ACCOUNT_1'), stepSequence: 1, filterByDepartment: true } });

    // 2. WAITING_ACCOUNT_1 -> WAITING_FINAL_APP (Accountant Approve)
    await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('WAITING_ACCOUNT_1'), actionId: 1, requiredRoleId: ridAccountant, nextStatusId: sid('WAITING_FINAL_APP'), stepSequence: 2, filterByDepartment: false } });

    // 3. WAITING_FINAL_APP -> IT_WORKING (Final Approve)
    await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('WAITING_FINAL_APP'), actionId: 1, requiredRoleId: ridFinal, nextStatusId: sid('IT_WORKING'), stepSequence: 3, filterByDepartment: false } });

    // 4. IT_WORKING -> WAITING_ACCOUNT_2 (IT Process)
    await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('IT_WORKING'), actionId: 3, requiredRoleId: ridIT, nextStatusId: sid('WAITING_ACCOUNT_2'), stepSequence: 4, filterByDepartment: false } });

    if (cat.requiresCCSClosing) {
      // 6 Steps: CCS Closing Required

      // 5. WAITING_ACCOUNT_2 -> WAITING_IT_CLOSE (Accountant Check)
      await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('WAITING_ACCOUNT_2'), actionId: 1, requiredRoleId: ridAccountant, nextStatusId: sid('WAITING_IT_CLOSE'), stepSequence: 5, filterByDepartment: false } });

      // 6. WAITING_IT_CLOSE -> CLOSED (IT Reviewer Close)
      await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('WAITING_IT_CLOSE'), actionId: 4, requiredRoleId: ridITReviewer, nextStatusId: sid('CLOSED'), stepSequence: 6, filterByDepartment: false } });

    } else {
      // 5 Steps: Skip CCS Closing

      // 5. WAITING_ACCOUNT_2 -> CLOSED (Accountant Check -> Finish)
      await prisma.workflowTransition.create({ data: { categoryId: cat.id, currentStatusId: sid('WAITING_ACCOUNT_2'), actionId: 1, requiredRoleId: ridAccountant, nextStatusId: sid('CLOSED'), stepSequence: 5, filterByDepartment: false } });
    }

    // Rejection Paths (Available at all steps)
    const rejectTargets = [
      { status: 'PENDING', role: ridHead },
      { status: 'WAITING_ACCOUNT_1', role: ridAccountant },
      { status: 'WAITING_FINAL_APP', role: ridFinal },
      { status: 'IT_WORKING', role: ridIT },
      { status: 'WAITING_ACCOUNT_2', role: ridAccountant },
      { status: 'WAITING_IT_CLOSE', role: ridITReviewer }, // Only if exists
    ];

    for (const t of rejectTargets) {
      // Skip if status doesn't exist in flow (e.g. IT_CLOSE for 5-step)
      if (t.status === 'WAITING_IT_CLOSE' && !cat.requiresCCSClosing) continue;

      await prisma.workflowTransition.create({
        data: {
          categoryId: cat.id,
          currentStatusId: sid(t.status),
          actionId: 2, // REJECT
          requiredRoleId: t.role,
          nextStatusId: sid('REVISION'),
          stepSequence: 0,
          filterByDepartment: t.status === 'PENDING', // Head restricted to dept
        }
      });
    }
  }

  // 7. Email Templates (Keep existing or upset)
  // ... (Keeping previous logic if needed, or assuming they exist)

  console.log('✅ Seeding completed.');
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
