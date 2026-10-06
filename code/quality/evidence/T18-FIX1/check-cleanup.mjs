import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const start=Date.parse(JSON.parse(fs.readFileSync('quality/tasks.json')).tasks.find(t=>t.id==='T18-FIX1').startedAt);
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
await client.connect();
try {
 const schemas=(await client.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_t08_%' OR nspname LIKE 't08_fix1_%' OR nspname LIKE 't12_fix1_%' OR nspname LIKE 't18_%' ORDER BY nspname")).rows.map(r=>r.nspname);
 const ownedThisTask=schemas.filter(s=>Number(s.match(/_(\d{13})_/)?.[1])>=start);
 assert.equal(ownedThisTask.length,0,'Task-owned fixture schema survived cleanup');
 console.log(JSON.stringify({readOnly:true,taskOwnedRemainingSchemas:ownedThisTask,otherMatchingSchemas:schemas.filter(s=>!ownedThisTask.includes(s))}));
} finally {await client.end();}
