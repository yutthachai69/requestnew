
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration for the 6 Steps
const STEPS = [
    {
        step: 1,
        fromCode: 'WAITING_HOD',
        action: 'APPROVE',
        role: 'Head of Department',
        toCode: 'WAITING_ACCOUNT_1', // Custom status to distinguish from Acc2
        description: 'HOD Approves -> Send to Account 1'
    },
    {
        step: 2,
        fromCode: 'WAITING_ACCOUNT_1',
        action: 'APPROVE',
        role: 'Accountant',
        toCode: 'WAITING_FINAL_APP',
        description: 'Account 1 Approves -> Send to Final Approver'
    },
    {
        step: 3,
        fromCode: 'WAITING_FINAL_APP',
        action: 'APPROVE',
        role: 'Final Approver',
        toCode: 'IT_WORKING',
        description: 'Final Approves -> Send to IT for Processing'
    },
    {
        step: 4,
        fromCode: 'IT_WORKING',
        action: 'IT_PROCESS',
        role: 'IT',
        toCode: 'WAITING_ACCOUNT_2', // Custom status
        description: 'IT Processes -> Send to Account 2 (Asset Check?)'
    },
    {
        step: 5,
        fromCode: 'WAITING_ACCOUNT_2',
        action: 'APPROVE',
        role: 'Accountant',
        toCode: 'WAITING_IT_CLOSE',
        description: 'Account 2 Approves -> Send to IT to Close'
    },
    {
        step: 6,
        fromCode: 'WAITING_IT_CLOSE',
        action: 'CONFIRM_COMPLETE',
        role: 'IT',
        toCode: 'CLOSED',
        description: 'IT Closes -> Done'
    }
];

// Rejection Transitions (Generic for all steps usually, or specific)
// For simplicity, we add a generic REJECT transition for each "Waiting" status to 'REJECTED'
const REJECT_ACTION = 'REJECT';

async function main() {
    console.log('Starting Workflow Reset for F07...');

    // 1. Find Category
    const category = await prisma.category.findFirst({
        where: { name: { contains: 'IT' } } // Adjust if multiple IT categories exist
    });
    if (!category) throw new Error('Category not found');
    console.log(`Target Category: ${category.name} (ID: ${category.id})`);

    // 2. Ensure Roles Exist & Get IDs
    const roleMap: Record<string, number> = {};
    for (const step of STEPS) {
        if (!roleMap[step.role]) {
            const role = await prisma.role.findFirst({ where: { roleName: step.role } });
            if (!role) throw new Error(`Role ${step.role} not found`);
            roleMap[step.role] = role.id;
        }
    }
    console.log('Roles verified.');

    // 3. Ensure Statuses Exist & Get IDs (Create if missing)
    const statusMap: Record<string, number> = {};
    const allCodes = new Set([...STEPS.map(s => s.fromCode), ...STEPS.map(s => s.toCode), 'REJECTED']);

    for (const code of allCodes) {
        let status = await prisma.status.findUnique({ where: { code } });
        if (!status) {
            console.log(`Creating missing status: ${code}`);
            let displayName = code;
            let color = 'gray';
            // Simple heuristic for display names
            if (code.includes('HOD')) displayName = 'รอหัวหน้าแผนกอนุมัติ';
            if (code.includes('ACCOUNT_1')) displayName = 'รอตรวจสอบบัญชี (1)';
            if (code.includes('FINAL')) displayName = 'รออนุมัติขั้นสุดท้าย';
            if (code.includes('IT_WORKING')) { displayName = 'IT กำลังดำเนินงาน'; color = 'blue'; }
            if (code.includes('ACCOUNT_2')) displayName = 'รอตรวจสอบบัญชี (2)';
            if (code.includes('IT_CLOSE')) displayName = 'รอ IT สรุปปิดงาน';
            if (code === 'CLOSED') { displayName = 'ปิดงานแล้ว'; color = 'green'; }
            if (code === 'REJECTED') { displayName = 'ปฏิเสธ/ส่งกลับ'; color = 'red'; }

            status = await prisma.status.create({
                data: { code, displayName, colorCode: color }
            });
        }
        statusMap[code] = status.id;
    }
    console.log('Statuses verified.');

    // 4. Get Action IDs
    const actionsToCheck = ['APPROVE', 'REJECT', 'IT_PROCESS', 'CONFIRM_COMPLETE'];
    const actionMap: Record<string, number> = {};
    for (const name of actionsToCheck) {
        const act = await prisma.action.findUnique({ where: { actionName: name } });
        if (!act) throw new Error(`Action ${name} not found`);
        actionMap[name] = act.id;
    }

    // 5. DELETE Existing Transitions for this Category
    console.log('Deleting old transitions...');
    // @ts-ignore
    await prisma.workflowTransition.deleteMany({
        where: { categoryId: category.id }
    });

    // 6. Insert New Transitions
    console.log('Inserting new 6-step workflow...');
    for (const step of STEPS) {
        // Main Transition
        // @ts-ignore
        await prisma.workflowTransition.create({
            data: {
                categoryId: category.id,
                currentStatusId: statusMap[step.fromCode],
                actionId: actionMap[step.action],
                requiredRoleId: roleMap[step.role],
                nextStatusId: statusMap[step.toCode],
                stepSequence: step.step,
                correctionTypeId: null // Generic
            }
        });
        console.log(`Created: [Step ${step.step}] ${step.fromCode} -> ${step.toCode}`);

        // Add Reject Transition for this status (if it's an approval step)
        if (step.action === 'APPROVE') {
            // @ts-ignore
            await prisma.workflowTransition.create({
                data: {
                    categoryId: category.id,
                    currentStatusId: statusMap[step.fromCode],
                    actionId: actionMap['REJECT'],
                    requiredRoleId: roleMap[step.role],
                    nextStatusId: statusMap['REJECTED'],
                    stepSequence: step.step,
                    correctionTypeId: null
                }
            });
        }
    }

    console.log('Workflow Reset Complete!');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
