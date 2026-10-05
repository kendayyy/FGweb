import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
const configured=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(configured).filter(([key,value])=>/SECRET|PASSWORD|PRIVATE_KEY/.test(key)&&value.length>8);
function scan(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())scan(file);
    else for(const [key,value] of secrets)assert.equal(fs.readFileSync(file).toString().includes(value),false,`Configured ${key} appears in evidence`);
  }
}
scan('quality/evidence/T09');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{
  await client.connect();
  const schemas=await client.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname LIKE 't09_harness_%'");
  assert.equal(schemas.rows[0].count,0,'Owned T09 harness schemas must be removed');
}finally{await client.end();}
const last=JSON.parse(fs.readFileSync('quality/evidence/T09/api-harness-results.json','utf8'));
for(const pid of [last.apiPid,last.webPid]){
  let alive=false;
  try{process.kill(pid,0);alive=true;}catch{/* exited */}
  assert.equal(alive,false,'Owned harness child must be stopped');
}
console.log('PASS: configured secrets absent from T09 evidence; owned harness schemas and final child processes removed.');
