import fs from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
const dir='quality/evidence/CHATCRYPTO-BE',failed=JSON.parse(fs.readFileSync(`${dir}/codex-lobby-realtime-1.json`));assert.equal(failed.exitCode,1);
const env=parseEnv(fs.readFileSync('.env.local','utf8')),pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
try{
 const schemas=(await pool.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^crypto_be_[a-f0-9]{32}$'")).rows;assert.equal(schemas.length,1,'Only the attributable interrupted fixture may be recovered');const name=schemas[0].nspname;assert.match(name,/^crypto_be_[a-f0-9]{32}$/);
 const db=await pool.connect();try{
  await db.query(`SET search_path TO "${name}"`);
  assert.deepEqual((await db.query('SELECT id FROM "user" ORDER BY id')).rows.map(r=>r.id),['alice','bob','outsider']);assert.equal((await db.query("SELECT id FROM game_interests WHERE id='native-interest' AND user_id='alice'")).rowCount,1);assert.equal((await db.query("SELECT id FROM lobbies WHERE id='native-lobby'")).rowCount,1);assert.equal((await db.query('SELECT id FROM messages')).rowCount,0);assert.equal((await db.query('SELECT user_id FROM chat_crypto_devices')).rowCount,0);assert.equal((await db.query("SELECT id FROM conversations WHERE id IN('dm','other')")).rowCount,2);assert.equal((await db.query('SELECT id FROM conversations')).rowCount,2);
  fs.writeFileSync(`${dir}/realtime-interrupted-fixture.json`,JSON.stringify({recordedAt:new Date().toISOString(),source:failed.evidencePath,ownedSchema:name,verifiedReportFixtureSeed:true,processExitedBeforeNativeAppInit:true,mainDatabaseChanged:false},null,2)+'\n',{flag:'wx'});
  await db.query('SET search_path TO public');await db.query(`DROP SCHEMA "${name}" CASCADE`);
 }finally{db.release();}
 assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') IS NULL AS absent")).rows[0].absent,true);console.log(JSON.stringify({recoveredOwnedInterruptedFixture:1,mainCryptoTableAbsent:true}));
}finally{await pool.end();}
