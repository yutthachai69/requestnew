
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    await client.connect();
    console.log('Checking for status mismatches...');

    // Find requests where status column doesn't match the linked Status code
    const res = await client.query(`
    SELECT r.id, r."workOrderNo", r.status as "statusCol", s.code as "statusCode", s."displayName"
    FROM "ITRequestF07" r
    JOIN "Status" s ON r."currentStatusId" = s.id
    WHERE r.status != s.code
  `);

    if (res.rows.length === 0) {
        console.log('No mismatches found.');
    } else {
        console.log(`Found ${res.rows.length} mismatches. Examples:`);
        console.table(res.rows.slice(0, 10));

        console.log('Fxing mismatches...');
        await client.query(`
        UPDATE "ITRequestF07"
        SET status = s.code
        FROM "Status" s
        WHERE "ITRequestF07"."currentStatusId" = s.id
        AND "ITRequestF07".status != s.code
      `);
        console.log('Fixed.');
    }

    await client.end();
}

main().catch(e => console.error(e));
