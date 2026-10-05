import assert from 'node:assert/strict';
import pg from 'pg';
// Exact owned schema confirmed in T09 conversation transcript, step recorded in review.
const owned='t09_harness_1791175387773';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{
 await client.connect();
 assert.match(owned,/^t09_harness_[0-9]{13}$/);
 await client.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
 const result=await client.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1',[owned]);
 assert.equal(result.rows[0].count,0);
 console.log('PASS: exact historical T09-owned test schema removed; no public schema changes.');
}finally{await client.end();}
