
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';

const sqlitePath = path.resolve(process.cwd(), 'prisma', 'dev.db');
const url = `file:${sqlitePath.replace(/\\/g, '/')}`;
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
    // 1. Get Latest Request
    const request = await prisma.iTRequestF07.findFirst({
        orderBy: { id: 'desc' },
        include: { currentStatus: true, category: true }
    });

    if (!request) {
        console.log('No requests found in DB.');
        return;
    }

    console.log(`\n=== REQUEST #${request.id} ===`);
    console.log(`WorkOrder: ${request.workOrderNo}`);
    console.log(`Status: ${request.currentStatus?.code} (${request.currentStatus?.displayName})`);
    console.log(`Start Status: ${request.status}`); // Legacy field
    console.log(`Category: ID ${request.categoryId} - "${request.category.name}"`);

    // 2. Check Transitions for this Category
    console.log(`\n=== TRANSITIONS for Category ID ${request.categoryId} ===`);
    const transitions = await prisma.workflowTransition.findMany({
        where: { categoryId: request.categoryId },
        include: { currentStatus: true, nextStatus: true, action: true, requiredRole: true },
        orderBy: { stepSequence: 'asc' }
    });

    if (transitions.length === 0) {
        console.log('⚠️ NO TRANSITIONS FOUND for this category! This causes fallback to legacy "One Step Close" logic.');
    } else {
        transitions.forEach(t => {
            console.log(`[${t.stepSequence}] ${t.currentStatus.code} + ${t.action.actionName} (Role: ${t.requiredRole.roleName}) -> ${t.nextStatus.code}`);
        });
    }

    // 3. Check Account Role
    const accRole = await prisma.role.findFirst({ where: { roleName: 'Accountant' } });
    console.log(`\n=== DEBUG DATA ===`);
    console.log(`Accountant Role ID: ${accRole?.id}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
