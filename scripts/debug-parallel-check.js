
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const catId = 2; // Farm
    console.log(`Checking transitions for Cat ${catId}, Status 1 (PENDING)`);

    const trans = await client.query(`
    SELECT t.id, t."actionId", a."actionName", t."requiredRoleId", r."roleName", t."stepSequence", t."correctionTypeId"
    FROM "WorkflowTransition" t
    JOIN "Action" a ON t."actionId" = a.id
    JOIN "Role" r ON t."requiredRoleId" = r.id
    WHERE t."categoryId" = $1 AND t."currentStatusId" = 1
  `, [catId]);

    console.table(trans.rows);

    console.log('Checking Parallel Logic factors...');
    // Check how many users have HOD role? No, that's not how it works usually unless configured.
    // Check history count for this step
    const hist = await client.query(`
      SELECT count(*) FROM "ApprovalHistory" 
      WHERE "requestId" = 16 AND "approvalLevel" = 1 AND "actionType" = 'APPROVE'
  `);
    console.log('Current Approvals for Step 1:', hist.rows[0].count);

    await client.end();
}

main().catch(e => console.error(e));
