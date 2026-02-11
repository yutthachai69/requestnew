
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

const STEPS = [
    { step: 1, from: 'WAITING_HOD', action: 'APPROVE', role: 'Head of Department', to: 'WAITING_ACCOUNT_1' },
    { step: 2, from: 'WAITING_ACCOUNT_1', action: 'APPROVE', role: 'Accountant', to: 'WAITING_FINAL_APP' },
    { step: 3, from: 'WAITING_FINAL_APP', action: 'APPROVE', role: 'Final Approver', to: 'IT_WORKING' },
    { step: 4, from: 'IT_WORKING', action: 'IT_PROCESS', role: 'IT', to: 'WAITING_ACCOUNT_2' },
    { step: 5, from: 'WAITING_ACCOUNT_2', action: 'APPROVE', role: 'Accountant', to: 'WAITING_IT_CLOSE' },
    { step: 6, from: 'WAITING_IT_CLOSE', action: 'CONFIRM_COMPLETE', role: 'IT', to: 'CLOSED' }
];

async function getOrInitStatus(code, name, color) {
    const res = await client.query('SELECT id FROM "Status" WHERE code = $1', [code]);
    if (res.rows.length) return res.rows[0].id;

    console.log(`Creating status: ${code}`);
    const ins = await client.query(
        'INSERT INTO "Status" (code, "displayName", "colorCode") VALUES ($1, $2, $3) RETURNING id',
        [code, name, color]
    );
    return ins.rows[0].id;
}

async function main() {
    await client.connect();
    console.log('Connected to DB');

    try {
        await client.query('BEGIN');

        // 1. Get Category
        const catRes = await client.query(`SELECT id FROM "Category" WHERE name LIKE '%IT%' LIMIT 1`);
        if (!catRes.rows.length) throw new Error('Category IT not found');
        const categoryId = catRes.rows[0].id;
        console.log('Category ID:', categoryId);

        // 2. Prepare Status IDs
        const statusIds = {};
        statusIds['WAITING_HOD'] = await getOrInitStatus('WAITING_HOD', 'รอหัวหน้าแผนกอนุมัติ', 'gray');
        statusIds['WAITING_ACCOUNT_1'] = await getOrInitStatus('WAITING_ACCOUNT_1', 'รอตรวจสอบบัญชี (1)', 'yellow');
        statusIds['WAITING_FINAL_APP'] = await getOrInitStatus('WAITING_FINAL_APP', 'รออนุมัติขั้นสุดท้าย', 'orange');
        statusIds['IT_WORKING'] = await getOrInitStatus('IT_WORKING', 'IT กำลังดำเนินงาน', 'blue');
        statusIds['WAITING_ACCOUNT_2'] = await getOrInitStatus('WAITING_ACCOUNT_2', 'รอตรวจสอบบัญชี (2)', 'purple');
        statusIds['WAITING_IT_CLOSE'] = await getOrInitStatus('WAITING_IT_CLOSE', 'รอ IT สรุปปิดงาน', 'indigo');
        statusIds['CLOSED'] = await getOrInitStatus('CLOSED', 'ปิดงานแล้ว', 'green');
        statusIds['REJECTED'] = await getOrInitStatus('REJECTED', 'ปฏิเสธ/ส่งกลับ', 'red');

        // 3. Prepare Roles & Actions
        const getRole = async (name) => {
            const r = await client.query('SELECT id FROM "Role" WHERE "roleName" = $1', [name]);
            if (!r.rows.length) throw new Error(`Role ${name} not found`);
            return r.rows[0].id;
        };
        const getAction = async (name) => {
            const a = await client.query('SELECT id FROM "Action" WHERE "actionName" = $1', [name]);
            if (!a.rows.length) throw new Error(`Action ${name} not found`);
            return a.rows[0].id;
        };

        const rejectActionId = await getAction('REJECT');

        // 4. Delete Old
        console.log('Deleting old transitions...');
        await client.query('DELETE FROM "WorkflowTransition" WHERE "categoryId" = $1', [categoryId]);

        // 5. Insert New
        for (const s of STEPS) {
            const currentId = statusIds[s.from];
            const nextId = statusIds[s.to];
            const roleId = await getRole(s.role);
            const actionId = await getAction(s.action);

            // Insert Main Transition
            await client.query(`
              INSERT INTO "WorkflowTransition" 
              ("categoryId", "currentStatusId", "actionId", "requiredRoleId", "nextStatusId", "stepSequence", "correctionTypeId")
              VALUES ($1, $2, $3, $4, $5, $6, NULL)
          `, [categoryId, currentId, actionId, roleId, nextId, s.step]);

            // Insert Reject Transition
            if (s.action === 'APPROVE') {
                await client.query(`
                INSERT INTO "WorkflowTransition" 
                ("categoryId", "currentStatusId", "actionId", "requiredRoleId", "nextStatusId", "stepSequence", "correctionTypeId")
                VALUES ($1, $2, $3, $4, $5, $6, NULL)
            `, [categoryId, currentId, rejectActionId, roleId, statusIds['REJECTED'], s.step]);
            }
            console.log(`Inserted Step ${s.step}: ${s.from} -> ${s.to}`);
        }

        await client.query('COMMIT');
        console.log('SUCCESS: Workflow Reset!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('ERROR:', e);
    } finally {
        await client.end();
    }
}

main();
