import fs from 'node:fs';import {parseEnv} from 'node:util';import pg from 'pg';import assert from 'node:assert/strict';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),pool=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
try{
  assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value,null);
  const schemas=(await pool.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'crypto_fe_%'")).rows;
  for(const {nspname} of schemas){assert.match(nspname,/^crypto_fe_[a-f0-9]{32}$/);const result=(await pool.query('SELECT count(*)::int AS messages,count(*) FILTER(WHERE content<>\'\')::int AS plaintext_rows FROM "'+nspname+'".messages')).rows[0];console.log(JSON.stringify({schema:nspname,...result,observationOnly:true}));}
}finally{await pool.end();}
