/**
 * Diagnostic Script: ตรวจสอบปัญหา IT Reviewer ปิดงานแล้วสถานะไม่เปลี่ยน
 * Run: npx tsx scripts/diagnose-it-close.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:1234@localhost:5432/requestonline';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('='.repeat(70));
    console.log('🔍 DIAGNOSE: IT Reviewer Close Issue');
    console.log('='.repeat(70));

    // 1. Check Status table
    console.log('\n📋 1. Status Records:');
    const statuses = await prisma.status.findMany({ orderBy: { displayOrder: 'asc' } });
    for (const s of statuses) {
        console.log(`  ID=${s.id} | Code="${s.code}" | Display="${s.displayName}" | Order=${s.displayOrder}`);
    }

    const waitingITClose = statuses.find(s => s.code === 'WAITING_IT_CLOSE');
    const closedStatus = statuses.find(s => s.code === 'CLOSED');
    console.log(`\n  ⇒ WAITING_IT_CLOSE StatusID = ${waitingITClose?.id ?? '❌ NOT FOUND!'}`);
    console.log(`  ⇒ CLOSED StatusID = ${closedStatus?.id ?? '❌ NOT FOUND!'}`);

    // 2. Check Actions table
    console.log('\n📋 2. Action Records:');
    const actions = await prisma.action.findMany();
    for (const a of actions) {
        console.log(`  ID=${a.id} | Name="${a.actionName}" | Display="${a.displayName}"`);
    }
    const confirmComplete = actions.find(a => a.actionName === 'CONFIRM_COMPLETE');
    console.log(`\n  ⇒ CONFIRM_COMPLETE ActionID = ${confirmComplete?.id ?? '❌ NOT FOUND!'}`);

    // 3. Check Roles related to IT Reviewer
    console.log('\n📋 3. Roles (IT-related):');
    const roles = await prisma.role.findMany();
    for (const r of roles) {
        console.log(`  ID=${r.id} | Name="${r.roleName}"`);
    }
    const itReviewerRole = roles.find(r => r.roleName === 'IT Reviewer');
    console.log(`\n  ⇒ IT Reviewer RoleID = ${itReviewerRole?.id ?? '❌ NOT FOUND!'}`);

    // 4. Check WorkflowTransitions for WAITING_IT_CLOSE → CLOSED
    console.log('\n📋 4. WorkflowTransitions (WAITING_IT_CLOSE → ?):');
    if (waitingITClose) {
        const transitions = await prisma.workflowTransition.findMany({
            where: { currentStatusId: waitingITClose.id },
            include: {
                action: { select: { actionName: true, displayName: true } },
                requiredRole: { select: { roleName: true } },
                nextStatus: { select: { code: true, displayName: true } },
                category: { select: { id: true, name: true } },
            },
        });
        if (transitions.length === 0) {
            console.log('  ❌ ไม่มี WorkflowTransition ที่ออกจากสถานะ WAITING_IT_CLOSE เลย!');
        } else {
            for (const t of transitions) {
                console.log(`  CatID=${t.categoryId} (${t.category.name}) | Action="${t.action.actionName}" | Role="${t.requiredRole.roleName}" | → ${t.nextStatus.code} (${t.nextStatus.displayName}) | CorrTypeID=${t.correctionTypeId ?? 'null'} | Step=${t.stepSequence}`);
            }
        }
    } else {
        console.log('  ❌ ไม่มีสถานะ WAITING_IT_CLOSE ใน DB!');
    }

    // 5. Check all categories — which ones have WAITING_IT_CLOSE transition?
    console.log('\n📋 5. Categories & their WAITING_IT_CLOSE Transitions:');
    const categories = await prisma.category.findMany({ select: { id: true, name: true } });
    for (const cat of categories) {
        const trans = waitingITClose
            ? await prisma.workflowTransition.findMany({
                where: { categoryId: cat.id, currentStatusId: waitingITClose.id },
                include: {
                    action: { select: { actionName: true } },
                    requiredRole: { select: { roleName: true } },
                    nextStatus: { select: { code: true } },
                },
            })
            : [];
        if (trans.length > 0) {
            for (const t of trans) {
                console.log(`  ✅ Cat=${cat.id} "${cat.name}" → Action="${t.action.actionName}" Role="${t.requiredRole.roleName}" → ${t.nextStatus.code}`);
            }
        } else {
            console.log(`  ⚠️  Cat=${cat.id} "${cat.name}" → ไม่มี Transition จาก WAITING_IT_CLOSE`);
        }
    }

    // 6. Check requests stuck at WAITING_IT_CLOSE
    console.log('\n📋 6. Requests ที่ค้างอยู่ที่ WAITING_IT_CLOSE:');
    const stuckRequests = await prisma.iTRequestF07.findMany({
        where: {
            OR: [
                { status: 'WAITING_IT_CLOSE' },
                ...(waitingITClose ? [{ currentStatusId: waitingITClose.id }] : []),
            ],
        },
        select: {
            id: true,
            workOrderNo: true,
            status: true,
            currentStatusId: true,
            categoryId: true,
            category: { select: { name: true } },
            updatedAt: true,
        },
    });

    if (stuckRequests.length === 0) {
        console.log('  ✅ ไม่มี Request ค้างที่ WAITING_IT_CLOSE ตอนนี้');
    } else {
        for (const r of stuckRequests) {
            const statusMatch = waitingITClose && r.currentStatusId === waitingITClose.id;
            console.log(`  ID=${r.id} | WO="${r.workOrderNo}" | status="${r.status}" | currentStatusId=${r.currentStatusId} (match WAITING_IT_CLOSE? ${statusMatch ? '✅' : '❌'}) | Cat=${r.categoryId} "${r.category.name}" | Updated=${r.updatedAt.toISOString()}`);
        }
    }

    // 7. Check users with IT Reviewer role
    console.log('\n📋 7. Users ที่เป็น IT Reviewer:');
    const itUsers = await prisma.user.findMany({
        where: {
            role: { roleName: { in: ['IT Reviewer', 'It viewer', 'IT Veiwer'] } },
        },
        select: { id: true, username: true, fullName: true, role: { select: { roleName: true } }, isActive: true },
    });
    if (itUsers.length === 0) {
        console.log('  ❌ ไม่มี User ที่มี role IT Reviewer!');
    } else {
        for (const u of itUsers) {
            console.log(`  ID=${u.id} | "${u.username}" | "${u.fullName}" | role="${u.role?.roleName}" | active=${u.isActive}`);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📝 สรุป:');
    if (!waitingITClose) console.log('  ❌ ไม่มี Status "WAITING_IT_CLOSE" ใน DB — ต้อง seed ใหม่!');
    if (!closedStatus) console.log('  ❌ ไม่มี Status "CLOSED" ใน DB — ต้อง seed ใหม่!');
    if (!confirmComplete) console.log('  ❌ ไม่มี Action "CONFIRM_COMPLETE" ใน DB — ต้อง seed ใหม่!');
    if (!itReviewerRole) console.log('  ❌ ไม่มี Role "IT Reviewer" ใน DB!');
    console.log('='.repeat(70));
}

main()
    .catch((e) => { console.error('Error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
