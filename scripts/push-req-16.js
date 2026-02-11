
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const reqId = 16;
    console.log(`Fixing Request ${reqId} stuck at HOD...`);

    // Force move to WAITING_ACCOUNT_1 (Status 2)
    const res = await client.query(`
    UPDATE "ITRequestF07"
    SET status = 'WAITING_ACCOUNT_1',
        "currentStatusId" = 2,
        "currentApprovalStep" = 2
    WHERE id = $1 AND "currentStatusId" = 1
  `, [reqId]);

    console.log(`Updated ${res.rowCount} rows.`);
    await client.end();
}

main().catch(e => console.error(e));
