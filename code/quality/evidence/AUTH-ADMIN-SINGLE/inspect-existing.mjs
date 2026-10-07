import fs from 'node:fs';
import {parseEnv} from 'node:util';
import pg from 'pg';
const app=parseEnv(fs.readFileSync('.env.local','utf8')),input=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
const pool=new pg.Pool({connectionString:app.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
try{const rows=await pool.query('SELECT id FROM "user" WHERE lower(email)=$1',[input.FG_ADMIN_EMAIL.toLowerCase()]);console.log(JSON.stringify({adminEmailOccupied:rows.rowCount>0,belongsToFixedInputId:rows.rowCount===1&&rows.rows[0].id===input.FG_ADMIN_USER_ID}));}catch{console.error('Private ownership collision check unavailable');process.exitCode=1;}finally{await pool.end();}
