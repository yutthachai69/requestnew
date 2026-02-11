
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const res = await client.query(`
    SELECT 
        wt.id, 
        c.name as "Category",
        cs.code as "FromStatus", 
        a."actionName" as "Action",
        r."roleName" as "RequiredRole",
        ns.code as "ToStatus",
        wt."stepSequence"
    FROM "WorkflowTransition" wt
    JOIN "Category" c ON wt."categoryId" = c.id
    JOIN "Status" cs ON wt."currentStatusId" = cs.id
    JOIN "Action" a ON wt."actionId" = a.id
    JOIN "Role" r ON wt."requiredRoleId" = r.id
    JOIN "Status" ns ON wt."nextStatusId" = ns.id
    ORDER BY c.name, wt."stepSequence";
  `);
    console.table(res.rows);
    await client.end();
}

main().catch(e => console.error(e));
