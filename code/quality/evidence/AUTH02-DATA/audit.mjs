import {checkBaselines} from '../../../scripts/verify-task.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const dir='quality/evidence/AUTH02-DATA',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),t=ledger.tasks.find(t=>t.id==='AUTH02-DATA');
const allow=f=>t.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const snapshot=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));for(const [f,h]of Object.entries(snapshot))assert.equal(hash(f),h,f);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);assert(files.every(f=>allow(f)||f in snapshot),'Unexpected file outside scope');
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),7);
const frozen=new Map();for(const p of ledger.tasks.slice(0,ledger.tasks.indexOf(t)))for(const [f,h]of Object.entries(p.outputsHash?.files??{}))frozen.set(f,h);let count=0;for(const [f,h]of frozen)if(!allow(f)){assert.equal(hash(f),h,f);count++;}
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);for(const f of files.filter(allow))assert(!secrets.some(s=>fs.readFileSync(f).includes(Buffer.from(s))),'Configured secret leak');
console.log(JSON.stringify({baselines:7,readonlyFiles:Object.keys(snapshot).length,frozenFiles:count,configuredSecretLeak:false,productionSchemaAndBackendUnchanged:true}));
