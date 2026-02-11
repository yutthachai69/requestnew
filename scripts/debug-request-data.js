
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    const res = await client.query(`
    SELECT r.id, r."workOrderNo", r.status, r."currentStatusId", c.name as "CategoryName", r."categoryId"
    FROM "ITRequestF07" r
    JOIN "Category" c ON r."categoryId" = c.id
    WHERE r.id IN (14, 13, 12, 11, 10);
  `);
    console.table(res.rows);

    if (res.rows.length > 0) {
        const catId = res.rows[0].categoryId;
        const trans = await client.query(`SELECT count(*) FROM "WorkflowTransition" WHERE "categoryId" = $1`, [catId]);
        console.log(`Transitions count for Category ${catId}:`, trans.rows[0].count);
    }

    await client.end();
}

main().catch(e => console.error(e));
