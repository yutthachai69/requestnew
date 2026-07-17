import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { getMssqlConfig } from '../lib/mssql-config';
import 'dotenv/config';

// PostgreSQL connection
const adapter = new PrismaMssql(getMssqlConfig());
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding "ทั่วไป 2" Workflow...');

    // 1. Get All Categories
    const categories = await prisma.category.findMany();

    if (categories.length === 0) {
        throw new Error('No categories found to seed.');
    }

    // Helper to get Role ID
    const getRoleId = async (name: string) => {
        const role = await prisma.role.findUnique({ where: { roleName: name } });
        if (!role) throw new Error(`Role ${name} not found`);
        return role.id;
    };

    const ridHead = await getRoleId('Head of Department');
    const ridAccountant = await getRoleId('Accountant');
    const ridFinal = await getRoleId('Final Approver');
    const ridIT = await getRoleId('IT');
    const ridITReviewer = await getRoleId('IT Reviewer');

    const statusIds = Object.fromEntries(
        (await prisma.status.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id])
    );
    const sid = (code: string) => statusIds[code] ?? 0;

    // Create or update the shared 'ทั่วไป 2' CorrectionType once
    let correctionType = await prisma.correctionType.findUnique({
        where: { name: 'ทั่วไป 2' }
    });

    if (!correctionType) {
        correctionType = await prisma.correctionType.create({
            data: {
                name: 'ทั่วไป 2',
                displayOrder: 99,
                categories: {
                    connect: categories.map(c => ({ id: c.id }))
                }
            }
        });
        console.log(`Created Shared CorrectionType: ${correctionType.name} (ID: ${correctionType.id})`);
    } else {
        // Ensure it's connected to all categories
        await prisma.correctionType.update({
            where: { id: correctionType.id },
            data: {
                categories: {
                    connect: categories.map(c => ({ id: c.id }))
                }
            }
        });
        console.log(`Updated Shared CorrectionType: ${correctionType.name} (ID: ${correctionType.id})`);
    }

    for (const cat of categories) {
        // Clear existing transitions for this specific CorrectionType and Category
        await prisma.workflowTransition.deleteMany({
            where: {
                categoryId: cat.id,
                correctionTypeId: correctionType.id
            }
        });

        // Create Custom Workflow Transitions for "ทั่วไป 2" (Skipping Accountant check after IT)

        // 1. PENDING -> WAITING_ACCOUNT_1 (Head Approve)
        await prisma.workflowTransition.create({ data: { categoryId: cat.id, correctionTypeId: correctionType.id, currentStatusId: sid('PENDING'), actionId: 1, requiredRoleId: ridHead, nextStatusId: sid('WAITING_ACCOUNT_1'), stepSequence: 1, filterByDepartment: true } });

        // 2. WAITING_ACCOUNT_1 -> WAITING_FINAL_APP (Accountant Approve)
        await prisma.workflowTransition.create({ data: { categoryId: cat.id, correctionTypeId: correctionType.id, currentStatusId: sid('WAITING_ACCOUNT_1'), actionId: 1, requiredRoleId: ridAccountant, nextStatusId: sid('WAITING_FINAL_APP'), stepSequence: 2, filterByDepartment: false } });

        // 3. WAITING_FINAL_APP -> IT_WORKING (Final Approve)
        await prisma.workflowTransition.create({ data: { categoryId: cat.id, correctionTypeId: correctionType.id, currentStatusId: sid('WAITING_FINAL_APP'), actionId: 1, requiredRoleId: ridFinal, nextStatusId: sid('IT_WORKING'), stepSequence: 3, filterByDepartment: false } });

        // 4. IT_WORKING -> WAITING_IT_CLOSE (IT Process -> Skip Accountant, go straight to IT Reviewer)
        await prisma.workflowTransition.create({ data: { categoryId: cat.id, correctionTypeId: correctionType.id, currentStatusId: sid('IT_WORKING'), actionId: 3, requiredRoleId: ridIT, nextStatusId: sid('WAITING_IT_CLOSE'), stepSequence: 4, filterByDepartment: false } });

        // 5. WAITING_IT_CLOSE -> CLOSED (IT Reviewer Close)
        await prisma.workflowTransition.create({ data: { categoryId: cat.id, correctionTypeId: correctionType.id, currentStatusId: sid('WAITING_IT_CLOSE'), actionId: 4, requiredRoleId: ridITReviewer, nextStatusId: sid('CLOSED'), stepSequence: 5, filterByDepartment: false } });

        // Rejection Paths
        const rejectTargets = [
            { status: 'PENDING', role: ridHead },
            { status: 'WAITING_ACCOUNT_1', role: ridAccountant },
            { status: 'WAITING_FINAL_APP', role: ridFinal },
            { status: 'IT_WORKING', role: ridIT },
            { status: 'WAITING_IT_CLOSE', role: ridITReviewer },
        ];

        for (const t of rejectTargets) {
            await prisma.workflowTransition.create({
                data: {
                    categoryId: cat.id,
                    correctionTypeId: correctionType.id,
                    currentStatusId: sid(t.status),
                    actionId: 2, // REJECT
                    requiredRoleId: t.role,
                    nextStatusId: sid('REVISION'),
                    stepSequence: 0,
                    filterByDepartment: t.status === 'PENDING',
                }
            });
        }

        console.log(`✅ Workflow for "ทั่วไป 2" in "${cat.name}" seeded successfully.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await prisma.$disconnect();
    });
