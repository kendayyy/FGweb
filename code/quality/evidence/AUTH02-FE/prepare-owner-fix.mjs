import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const feDir='quality/evidence/AUTH02-FE',dir='quality/evidence/AUTH02-BE-FIX1';
assert(!fs.existsSync(dir),'Do not overwrite owner fix');
// Repair only the two reported test-helper lint errors before capturing WIP.
const fixture=`${feDir}/fixture-server.mjs`,e2e='tests/e2e/auth-email.spec.ts';
fs.writeFileSync(fixture,fs.readFileSync(fixture,'utf8').replace('}catch{}console.log','}catch{keys=[];}console.log'));
fs.writeFileSync(e2e,fs.readFileSync(e2e,'utf8').replace("code===0?resolve():reject(new Error('Owned fixture cleanup failed.'));","if(code===0)resolve();else reject(new Error('Owned fixture cleanup failed.'));"));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),index=ledger.tasks.findIndex(t=>t.id==='AUTH02-FE'),fe=ledger.tasks[index];
assert.equal(fe.status,'IN_PROGRESS');
const latest=new Map();for(const t of ledger.tasks.slice(0,index))for(const [file,h]of Object.entries(t.outputsHash?.files??{}))latest.set(file,h);
const restores=[];
for(const [file,expected]of latest){
 const current=fs.readFileSync(file);if(hash(current)===expected)continue;
 assert(fe.writeAllowlist.some(p=>p.endsWith('/**')?file.startsWith(p.slice(0,-2)):file===p),`Unexpected frozen change: ${file}`);
 const head=execFileSync('git',['show',`HEAD:code/${file}`]);
 const text=head.toString(),lf=text.replaceAll('\r\n','\n');
 const original=[head,Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n'))].find(b=>hash(b)===expected);
 assert(original,`Cannot safely recover exact frozen bytes: ${file}`);
 restores.push({file,current,original,expected});
}
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync('.runtime/auth02-fe/suspended',{recursive:true});
const captured={capturedAt:new Date().toISOString(),files:{}};
for(const item of restores){
 const backup=path.join('.runtime/auth02-fe/suspended',item.file);fs.mkdirSync(path.dirname(backup),{recursive:true});assert(!fs.existsSync(backup));fs.writeFileSync(backup,item.current);
 captured.files[item.file]={backup,wipSha256:hash(item.current),frozenSha256:item.expected};
}
fs.writeFileSync(`${dir}/suspended-frontend.json`,JSON.stringify(captured,null,2)+'\n');
fs.writeFileSync(`${dir}/proposal.md`,'# AUTH02-BE-FIX1\n\nReview found mailed verification links navigate to native JSON when the token is expired or replayed. Existing contracts already expose GET /api/auth/verify-email with JSON success/error. Mail a same-origin /auth/verify?token= link so the frontend can consume that endpoint and display truthful FG states. Keep nonce, signing,24h expiry, atomic consumption, no auto signin and all security policy.\n\nAuthorized by persistent permission to broaden write scope/touch locked files. Exact owner scope: auth.service.ts mail URL construction; auth-email.integration.spec.ts mail-link consumer adapter + SMTP dot transparency + new real integration case; generated API dist; this evidence directory. No contracts/database/dependencies change. Frontend WIP captured byte-for-byte, seven-source baseline and original FE gate retained. Temporarily restore only frozen prior frontend outputs to their verified exact hashes; run the unmodified strict owner gate. Restore identical WIP only after owner PASS and strict FE prerequisite gate. No checker changes or historical evidence edits.\n');
const owner={id:'AUTH02-BE-FIX1',status:'IN_PROGRESS',dependencies:['AUTH02-BE'],specSha256:fe.specSha256,inputsHash:{specSha256:fe.specSha256,files:Object.fromEntries(['apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-email.integration.spec.ts'].map(f=>[f,hash(fs.readFileSync(f))]))},outputsHash:null,commands:[],evidencePaths:[],startedAt:new Date().toISOString(),completedAt:null,blockers:[],writeAllowlist:['apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-email.integration.spec.ts','apps/api/dist/**',`${dir}/**`]};
ledger.tasks.splice(index,0,owner);fe.status='BLOCKED';fe.blockers=['Suspended with exact WIP capture for AUTH02-BE-FIX1 verification-link producer correction'];fe.dependencies=['AUTH02-BE-FIX1'];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
for(const {file,original}of restores)fs.writeFileSync(file,original);
fs.writeFileSync(`${dir}/record.mjs`,fs.readFileSync(`${feDir}/record.mjs`,'utf8').replace("const dir = 'quality/evidence/AUTH02-FE';",`const dir = '${dir}';`));
console.log(JSON.stringify({ownerCheckpoint:owner.id,suspendedFiles:restores.length,exactFrozenBytesRestored:true,wipPreserved:true}));
