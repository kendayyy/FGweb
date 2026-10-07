import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/AUTH-ADMIN-SINGLE',hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH-ADMIN-SINGLE');
const allow=file=>task.writeAllowlist.some(p=>p.endsWith('/**')?file.startsWith(p.slice(0,-2)):file===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(file);
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));assert.equal(checkBaselines({root:process.cwd(),baseline}),8);
const snapshot=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));let readonly=0;
for(const [file,sha]of Object.entries(snapshot))if(!allow(file)){assert.equal(hash(file),sha,file);readonly++;}
const latest=new Map();for(const previous of ledger.tasks.slice(0,ledger.tasks.indexOf(task))){assert.equal(previous.status,'PASS');for(const [file,sha]of Object.entries(previous.outputsHash?.files??{}))latest.set(file,sha);}
let frozen=0;for(const [file,sha]of latest)if(!allow(file)){assert.equal(hash(file),sha,file);frozen++;}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);assert(files.every(file=>allow(file)||file in snapshot),'New file outside pinned owner scope');
const local=parseEnv(fs.readFileSync('.env.local','utf8')),input=parseEnv(fs.readFileSync('.runtime/auth-admin/admin-input.env','utf8'));
const privateValues=[...Object.entries(local).filter(([key,value])=>value&&/(SECRET|PASSWORD|PRIVATE_KEY)/.test(key)&&value.length>=8).map(([,value])=>value),input.FG_ADMIN_EMAIL,input.FG_ADMIN_INITIAL_PASSWORD].filter(value=>value&&value.length>=8);
const scan=file=>{const raw=fs.readFileSync(file);assert(!privateValues.some(value=>raw.includes(Buffer.from(value))),'Configured private value leaked; path omitted');if(file.startsWith(dir)||file.startsWith('.cache/auth-admin'))assert(!/[?&]token=[A-Za-z0-9_.-]{16,}/.test(raw.toString()),'Mailed token leaked');};
for(const file of files.filter(allow))scan(file);
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
for(const directory of ['apps/web/dist','apps/api/dist','.cache/auth-admin'])if(fs.existsSync(directory))for(const file of walk(directory))scan(file);
for(const file of ['.runtime/auth-admin/key.pem','.runtime/auth-admin/cert.pem'])assert(!fs.existsSync(file),'Owned temporary TLS key/cert not removed');
for(const size of ['1440x900','1280x800','390x844','360x800'])assert(fs.statSync(`${dir}/screenshots/${size}-login.png`).size>1000);
assert(!fs.readFileSync('apps/api/src/modules/auth/auth.service.ts','utf8').includes('ADMIN_DISCORD_IDS'),'Legacy admin grant remains');
console.log(JSON.stringify({approvedBaselines:8,readonlyFiles:readonly,frozenOutsideOwnerFiles:frozen,scopePinned:true,temporaryTlsKeysRemoved:true,privateValuesAndTokensLeaked:false,mainAdminProvisioningClaimed:false}));
