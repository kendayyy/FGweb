import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/AUTH02-BE-FIX1',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='AUTH02-BE-FIX1');
const allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p);
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),7);
const latest=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))latest.set(f,h);
let frozen=0;for(const [f,h]of latest)if(!allow(f)){assert.equal(hash(f),h,f);frozen++;}
const captured=JSON.parse(fs.readFileSync(`${dir}/suspended-frontend.json`));for(const [f,v]of Object.entries(captured.files)){assert.equal(hash(v.backup),v.wipSha256);assert.equal(hash(f),v.frozenSha256);}
const source='apps/api/src/modules/auth/auth.service.ts',old=execFileSync('git',['show',`HEAD:code/${source}`],{encoding:'utf8'}).replaceAll('\r\n','\n');
assert.equal(fs.readFileSync(source,'utf8').replaceAll('\r\n','\n'),old.replace('sendVerificationEmail:async({user,url})','sendVerificationEmail:async({user})').replace('const link=new URL(url);',"const link=new URL('/auth/verify',options.baseURL);"));
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>v&&/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const f of fs.readdirSync(dir).map(f=>`${dir}/${f}`).filter(f=>fs.statSync(f).isFile())){const raw=fs.readFileSync(f);assert(!secrets.some(s=>raw.includes(Buffer.from(s))));assert(!/[?&]token=[A-Za-z0-9_.-]{16,}/.test(raw.toString()));}
console.log(JSON.stringify({baselines:7,frozenFiles:frozen,suspendedWipFilesPreserved:Object.keys(captured.files).length,producerChangeExactlyMailUrl:true,secretsAndMailedTokensLeaked:false}));
