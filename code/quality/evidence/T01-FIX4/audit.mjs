import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T01-FIX4';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
 const seal=JSON.parse(fs.readFileSync(`${dir}/entry-seal.json`));
 const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
 const task=ledger.followups.find(t=>t.id==='T01-FIX4');
 assert.equal(ledger.activeCheckpoint,task.id);assert.equal(task.status,'IN_PROGRESS');
 assert.deepEqual(ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA'),before.parentSnapshot);
 for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,old.id);
 for(const old of before.followups)assert.deepEqual(ledger.followups.find(t=>t.id===old.id),old,old.id);
 for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),seal.paths[p]??h,p);
 for(const [p,h]of Object.entries(seal.paths))assert.equal(hash(p),h,p);
 assert.equal(hash('.env.local'),before.environmentSha256);
 assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
 const owned=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
 for(const p of paths.filter(p=>!owned(p)))assert(Object.hasOwn(before.readonly,p),`New file outside setup scope: ${p}`);
 const values=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8).map(([,value])=>Buffer.from(value));
 for(const p of fs.readdirSync(dir).map(p=>`${dir}/${p}`).filter(p=>fs.statSync(p).isFile()))for(const value of values)assert(!fs.readFileSync(p).includes(value),`Private configuration in setup evidence: ${p}`);
 for(const p of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const r=JSON.parse(fs.readFileSync(`${dir}/${p}`));assert.equal(hash(r.evidencePath),r.evidenceSha256,p);}
 return {recordedAt:new Date().toISOString(),checkpoint:task.id,manualSetupGate:true,baselines:8,parentWipFrozen:true,historicalPassRecords:before.historical.length,readonlyFiles:Object.keys(before.readonly).length,environmentUnchanged:true,secretsScan:'PASS',businessCryptoImplemented:false};
}
if(process.argv[1]?.endsWith('audit.mjs')){const report=audit();fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
