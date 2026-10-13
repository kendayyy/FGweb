import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const dir='quality/evidence/CHATCRYPTO-DATA',env=parseEnv(fs.readFileSync('.env.local','utf8'));
const pool=new Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});
try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  const messages=(await client.query(`SELECT c.kind,count(m.id)::int AS messages,count(m.id) FILTER(WHERE m.content<>'')::int AS nonempty_plaintext_rows FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY c.kind ORDER BY c.kind`)).rows;
  const counts=(await client.query(`SELECT (SELECT count(*)::int FROM attachments) AS attachments,(SELECT count(*)::int FROM pending_image_uploads) AS pending_uploads,(SELECT count(*)::int FROM conversation_members) AS membership_rows`)).rows[0];
  const columns=(await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('messages','attachments','pending_image_uploads','conversation_members','realtime_outbox') ORDER BY table_name,ordinal_position`)).rows;
  await client.query('ROLLBACK');
  const report={recordedAt:new Date().toISOString(),mainDatabaseReadOnly:true,contentOrIdentitiesRead:false,messages,counts,columns,migrationPerformed:false,conclusion:'No assumption of empty database; migration must retain existing IDs/ACL/cursors and reconcile private text and objects client-side.'};
  fs.writeFileSync(`${dir}/legacy-inventory.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({readOnly:true,messages,counts,migrationPerformed:false}));
 }finally{client.release();}
}finally{await pool.end();}
