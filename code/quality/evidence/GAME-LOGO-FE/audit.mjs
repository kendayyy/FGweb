import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/GAME-LOGO-FE',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
checkBaselines({root:process.cwd(),baseline});
const owner=ledger.tasks.find(t=>t.id==='GAME-LOGO-FE'),additional=JSON.parse(fs.readFileSync(`${dir}/scope-addition.json`));
const allow=p=>owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
let readonly=0;for(const [file,digest]of Object.entries(before.readonly)){if(additional.added.includes(file)){assert(allow(file));continue;}assert.equal(hash(file),digest,`Unowned file changed: ${file}`);readonly++;}
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,`Historical PASS metadata changed: ${old.id}`);
assert.equal(hash('.env.local'),before.configuration.env);
const prior=JSON.parse(fs.readFileSync('quality/evidence/LIGHT01-FE/compact/before.json'));assert.equal(hash('.runtime/auth-admin/admin-input.env'),prior.configuration.adminInput);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
const fingerprints=Object.fromEntries(files.filter(p=>allow(p)&&!p.startsWith(`${dir}/`)).map(p=>[p,hash(p)]));
const logs=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`)));for(const log of logs){assert.equal(hash(log.evidencePath),log.evidenceSha256);assert(Date.parse(log.startedAt)<=Date.parse(log.completedAt));}
const secrets=Object.values((await import('node:util')).parseEnv(fs.readFileSync('.env.local','utf8'))).filter(value=>value.length>=12&&!value.startsWith('http')&&!value.includes('localhost')&&!value.includes('127.0.0.1'));
function walk(path){return fs.readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${path}/${entry.name}`):[`${path}/${entry.name}`]);}
const exposed=[...files.filter(p=>allow(p)&&/\.(tsx?|mjs|css|html|json|webmanifest|svg)$/.test(p)),...walk('apps/web/dist').filter(p=>/\.(js|html|json|css|svg|webmanifest)$/.test(p))];
for(const file of exposed){const content=fs.readFileSync(file,'utf8');for(const value of secrets)assert(!content.includes(value),`Private config value found in ${file}`);}
const result={recordedAt:new Date().toISOString(),task:owner.id,status:'PARTIAL',checks:{readonlyFiles:readonly,historicalPASSRecords:before.historical.length,baselines:8,configurationUnchanged:true,commandLogsVerified:logs.length,privateConfigValuesAbsent:true,checkerUnchanged:true},fingerprints,commands:logs};
fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({task:owner.id,audit:'PASS',featureAcceptance:'NOT PASS',readonly,historicalPASSRecords:before.historical.length,commands:logs.length}));
