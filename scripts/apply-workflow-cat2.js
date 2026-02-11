
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const categoryId = 2; // Category to fix
    console.log(`Applying Workflow to Category ID: ${categoryId}`);

    const getId = async (table, col, val) => {
        const res = await client.query(`SELECT id FROM "${table}" WHERE "${col}" = $1`, [val]);
        if (!res.rows.length) throw new Error(`${table} ${val} not found`);
        return res.rows[0].id;
    };

    const statusIds = {};
    const statusCodes = ['PENDING', 'WAITING_ACCOUNT_1', 'WAITING_FINAL_APP', 'IT_WORKING', 'WAITING_ACCOUNT_2', 'WAITING_IT_CLOSE', 'CLOSED', 'REJECTED'];

    try {
        for (const c of statusCodes) statusIds[c] = await getId('Status', 'code', c);
    } catch (e) {
        console.error('Failed to get status IDs:', e);
        await client.end();
        return;
    }

    const STEPS = [
        { step: 1, from: 'PENDING', action: 'APPROVE', role: 'Head of Department', to: 'WAITING_ACCOUNT_1' },
        { step: 2, from: 'WAITING_ACCOUNT_1', action: 'APPROVE', role: 'Accountant', to: 'WAITING_FINAL_APP' },
        { step: 3, from: 'WAITING_FINAL_APP', action: 'APPROVE', role: 'Final Approver', to: 'IT_WORKING' },
        { step: 4, from: 'IT_WORKING', action: 'IT_PROCESS', role: 'IT', to: 'WAITING_ACCOUNT_2' },
        { step: 5, from: 'WAITING_ACCOUNT_2', action: 'APPROVE', role: 'Accountant', to: 'WAITING_IT_CLOSE' },
        { step: 6, from: 'WAITING_IT_CLOSE', action: 'CONFIRM_COMPLETE', role: 'IT', to: 'CLOSED' }
    ];

    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM "WorkflowTransition" WHERE "categoryId" = $1', [categoryId]);

        const rejectActionId = await getId('Action', 'actionName', 'REJECT');

        for (const s of STEPS) {
            const actionId = await getId('Action', 'actionName', s.action);
            const roleId = await getId('Role', 'roleName', s.role);

            await client.query(`
              INSERT INTO "WorkflowTransition" 
              ("categoryId", "currentStatusId", "actionId", "requiredRoleId", "nextStatusId", "stepSequence", "correctionTypeId")
              VALUES ($1, $2, $3, $4, $5, $6, NULL)
          `, [categoryId, statusIds[s.from], actionId, roleId, statusIds[s.to], s.step]);

            if (s.action === 'APPROVE') {
                await client.query(`
                INSERT INTO "WorkflowTransition" 
                ("categoryId", "currentStatusId", "actionId", "requiredRoleId", "nextStatusId", "stepSequence", "correctionTypeId")
                VALUES ($1, $2, $3, $4, $5, $6, NULL)
            `, [categoryId, statusIds[s.from], rejectActionId, roleId, statusIds['REJECTED'], s.step]);
            }
        }

        await client.query('COMMIT');
        console.log('SUCCESS: Workflow applied to Category 2!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
