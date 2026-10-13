import fs from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
import assert from 'node:assert/strict';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
const schemas=(await pool.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'theme\\_%' ESCAPE '\\'")).rows;
const removed=[];
for(const {nspname:schema} of schemas){
 assert(/^theme_[a-f0-9]{32}$/.test(schema));
 const rows=(await pool.query(`SELECT name,to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS') AS created_iso FROM "${schema}"."user"`)).rows;
 console.log(JSON.stringify({schema,fixtureActors:rows.map(row=>({fixture:row.name==='Theme Gamer',createdUTC:row.created_iso}))}));
 if(rows.length===1&&rows[0].name==='Theme Gamer'&&rows[0].created_iso>='2026-10-08T03:09:55'&&rows[0].created_iso<='2026-10-08T03:10:40'){
  await pool.query(`DROP SCHEMA "${schema}" CASCADE`);removed.push(schema);
 }
}
const remaining=(await pool.query("SELECT count(*)::integer AS count FROM pg_namespace WHERE nspname LIKE 'theme\\_%' ESCAPE '\\'")).rows[0].count;
await pool.end();
const result={recordedAt:new Date().toISOString(),removedOwnedTimedOutSchemas:removed,remainingTemporarySchemas:remaining};
fs.writeFileSync('quality/evidence/GAME-LOGO-FE/dota-cleanup-2.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));assert.equal(remaining,0);
