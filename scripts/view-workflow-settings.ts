
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const category = await prisma.category.findFirst();
    if (!category) {
        console.log('No categories found.');
        return;
    }
    console.log(`Checking Workflow for Category: ${category.name} (ID: ${category.id})`);

    // @ts-ignore
    const transitions = await prisma.workflowTransition.findMany({
        where: { categoryId: category.id },
        orderBy: { stepSequence: 'asc' },
        include: {
            currentStatus: true,
            action: true,
            requiredRole: true,
            nextStatus: true,
            correctionType: true
        }
    });

    if (transitions.length === 0) {
        console.log('No transitions found for this category.');
    } else {
        // Console log as a table-like structure
        transitions.forEach((t: any) => {
            console.log(`[Step ${t.stepSequence}] ${t.currentStatus.code} --(${t.action.actionName} by ${t.requiredRole.roleName})--> ${t.nextStatus.code} ${t.correctionType ? `(Type: ${t.correctionType.name})` : '(Generic)'}`);
        });
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
