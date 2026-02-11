
import { PrismaClient } from '@prisma/client';
import { findPossibleTransitions } from '../lib/workflow'; // Need to adjust import path or copy function
import { getUserRoleNamesForWorkflowRole } from '../lib/auth-constants';

const prisma = new PrismaClient();

// Mock findPossibleTransitions to avoid importing issues if lib/workflow depends on things
// Actuall, let's try to import if possible, but we are in scripts/
// We might need to use tsx to run this

async function main() {
    const requestId = 61; // Replace with a real request ID that is failing
    const userId = 1; // Replace with user ID trying to approve

    console.log(`Checking logic for Request ID: ${requestId}`);

    const req = await prisma.iTRequestF07.findUnique({
        where: { id: requestId },
        include: {
            requester: true,
            category: true,
            currentStatus: true,
            correctionTypes: true
        },
    });

    if (!req) {
        console.log('Request not found');
        return;
    }

    const user = await prisma.user.findFirst({ where: { id: userId }, include: { role: true } });
    if (!user) {
        console.log('User not found');
        return;
    }

    console.log(`Request Status: ${req.status} (ID: ${req.currentStatusId})`);
    console.log(`User Role: ${user.role.roleName} (ID: ${user.roleId})`);

    const categoryId = req.categoryId;
    const currentStatusId = req.currentStatusId ?? 1;
    const correctionTypeIds = req.correctionTypes.map(c => c.correctionTypeId);

    console.log('--- Finding Transitions ---');
    // Re-implementing logic here to debug
    let transitions = [];

    if (correctionTypeIds.length > 0) {
        for (const typeId of correctionTypeIds) {
            const t = await prisma.workflowTransition.findMany({
                where: { categoryId, currentStatusId, correctionTypeId: typeId },
                include: { action: true, requiredRole: true, nextStatus: true }
            });
            if (t.length > 0) {
                console.log(`Found specific transitions for CorrectionType ${typeId}`);
                transitions = t;
                break;
            }
        }
    }

    if (transitions.length === 0) {
        console.log('Searching generic transitions...');
        transitions = await prisma.workflowTransition.findMany({
            where: { categoryId, currentStatusId, correctionTypeId: null },
            include: { action: true, requiredRole: true, nextStatus: true }
        });
    }

    console.log(`Found ${transitions.length} transitions.`);

    for (const t of transitions) {
        const requiredRoleName = t.requiredRole.roleName;
        const allowedUserRoles = getUserRoleNamesForWorkflowRole(requiredRoleName);
        const userRoleName = user.role.roleName;

        const isMatch = allowedUserRoles.includes(userRoleName);

        console.log(`Transition ${t.id}: ${t.action.actionName} -> ${t.nextStatus.code}`);
        console.log(`  Required: ${requiredRoleName} -> Expanded: [${allowedUserRoles.join(', ')}]`);
        console.log(`  User Role: ${userRoleName} -> Match? ${isMatch}`);
    }
}

main();
