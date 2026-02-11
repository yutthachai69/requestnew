
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();

    console.log('--- Checking Category 2 ---');
    const cat = await client.query('SELECT * FROM "Category" WHERE id = 2');
    console.table(cat.rows);

    console.log('--- Checking Transitions for Category 2 ---');
    const trans = await client.query(`
    SELECT t.id, 
           sc.code as "FromStatus", 
           a."actionName", 
           r."roleName" as "RequiredRole", 
           sn.code as "ToStatus",
           t."correctionTypeId"
    FROM "WorkflowTransition" t
    JOIN "Status" sc ON t."currentStatusId" = sc.id
    JOIN "Status" sn ON t."nextStatusId" = sn.id
    JOIN "Action" a ON t."actionId" = a.id
    JOIN "Role" r ON t."requiredRoleId" = r.id
    WHERE t."categoryId" = 2
    ORDER BY t."stepSequence"
  `);

    if (trans.rows.length === 0) {
        console.log('NO TRANSITIONS FOUND FOR CATEGORY 2');

        // Check if there are transitions for ANY category
        const anyTrans = await client.query(`
          SELECT t."categoryId", c.name, count(*) 
          FROM "WorkflowTransition" t
          JOIN "Category" c ON t."categoryId" = c.id
          GROUP BY t."categoryId", c.name
      `);
        console.log('--- Transitions by Category ---');
        console.table(anyTrans.rows);
    } else {
        console.table(trans.rows);
    }

    await client.end();
}

main().catch(e => console.error(e));
