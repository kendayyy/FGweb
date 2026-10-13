import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-DATA',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA');
assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256});
for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),h,p);
for(const t of before.historical)assert.deepEqual(ledger.tasks.find(c=>c.id===t.id),t,t.id);
assert.equal(hash('.env.local'),before.configuration.env);
const inventory=JSON.parse(fs.readFileSync(`${dir}/legacy-inventory.json`));assert.equal(inventory.mainDatabaseReadOnly,true);assert.equal(inventory.contentOrIdentitiesRead,false);assert.equal(inventory.migrationPerformed,false);
const registry=JSON.parse(fs.readFileSync(`${dir}/registry-candidate.json`));assert.equal(registry.version,'18.6.0');assert.equal(registry.installed,false);assert.equal(registry.selectedByHuman,false);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
const originalOwners=new Map(Object.entries(JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-CHATCRYPTO01/readonly-after-bootstrap.json'))));
for(const t of before.historical)for(const [p,h]of Object.entries(t.outputsHash?.files??{}))originalOwners.set(p,h);
for(const p of files.filter(p=>!p.startsWith(`${dir}/`)&&p!=='quality/tasks.json')){const expected=before.readonly[p]??originalOwners.get(p);assert(expected,`Unexpected new source: ${p}`);assert.equal(hash(p),expected,`Source changed during proposal: ${p}`);}
for(const file of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const record=JSON.parse(fs.readFileSync(`${dir}/${file}`));assert.equal(hash(record.evidencePath),record.evidenceSha256,file);}
const values=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8).map(([,value])=>Buffer.from(value));
for(const file of fs.readdirSync(dir).filter(p=>fs.statSync(`${dir}/${p}`).isFile()))for(const secret of values)assert(!fs.readFileSync(`${dir}/${file}`).includes(secret),`Configured secret leaked: ${file}`);
const result={recordedAt:new Date().toISOString(),task:task.id,proposalOnly:true,sources:8,stockOwnerGate:'PASS',readonlyFiles:Object.keys(before.readonly).length,historicalPassRecords:before.historical.length,environmentUnchanged:true,mainDatabaseReadOnlyInventory:true,configuredSecretsScan:'PASS',dependenciesInstalled:false,cryptoImplemented:false,taskAcceptancePassed:false,decision:'Pending human protocol/service/private-image-validation choice'};
fs.writeFileSync(`${dir}/proposal-audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
