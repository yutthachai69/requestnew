
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();

    console.log('--- Latest Request ---');
    const res = await client.query(`
    SELECT r.id, r."workOrderNo", r.status, r."currentStatusId", r."currentApprovalStep", s.code as "StatusCode", s."displayName"
    FROM "ITRequestF07" r
    LEFT JOIN "Status" s ON r."currentStatusId" = s.id
    ORDER BY r."updatedAt" DESC
    LIMIT 1
  `);
    console.table(res.rows);

    if (res.rows.length > 0) {
        const reqId = res.rows[0].id;
        console.log(`--- Approval History for Request ${reqId} ---`);
        // Fixed column name: u.fullName instead of u.name
        const hist = await client.query(`
        SELECT h.id, h.comment, u."fullName" as "Approver"
        FROM "ApprovalHistory" h
        LEFT JOIN "User" u ON h."approverId" = u.id
        WHERE h."requestId" = $1
        ORDER BY h."approvalTimestamp" DESC
      `, [reqId]);
        console.table(hist.rows);

        console.log(`--- Audit Log for Request ${reqId} ---`);
        const audit = await client.query(`
        SELECT action, detail, "timestamp" 
        FROM "AuditLog" 
        WHERE "requestId" = $1 
        ORDER BY "timestamp" DESC
        LIMIT 5
      `, [reqId]);
        console.table(audit.rows);
    }

    await client.end();
}

main().catch(e => console.error(e));
