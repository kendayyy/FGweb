import {checkBaselines} from '../../../scripts/verify-task.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const dir='quality/evidence/AUTH02-BE',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),t=ledger.tasks.find(t=>t.id==='AUTH02-BE');
const allow=f=>t.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const snapshot=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));for(const [f,h]of Object.entries(snapshot))assert.equal(hash(f),h,f);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);assert(files.every(f=>allow(f)||f in snapshot),'Unexpected file outside scope');
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),7);
const frozen=new Map();for(const p of ledger.tasks.slice(0,ledger.tasks.indexOf(t)))for(const [f,h]of Object.entries(p.outputsHash?.files??{}))frozen.set(f,h);let count=0;for(const [f,h]of frozen)if(!allow(f)){assert.equal(hash(f),h,f);count++;}
const head=f=>execFileSync('git',['show',`HEAD:code/${f}`],{encoding:'utf8'}).replaceAll('\r\n','\n');
const profile='apps/api/src/modules/profiles/profiles.service.ts';
const expected=head(profile).replace("    if (!discordAccount) {\n      throw new NotFoundException({\n        code: ErrorCode.NOT_FOUND,\n        message: `Discord identity missing for user: ${userId}`,\n      });\n    }\n\n",'').replace('discordId: discordAccount.accountId,','discordId: discordAccount?.accountId??null,');
assert.equal(fs.readFileSync(profile,'utf8').replaceAll('\r\n','\n'),expected,'Profiles scope limited to owner identity');
const authTest='apps/api/test/auth.integration.spec.ts';assert.equal(fs.readFileSync(authTest,'utf8').replaceAll('\r\n','\n'),head(authTest).replace('    expect(authConfig.emailAndPassword?.enabled).toBe(false);','    // AUTH-CHANGE-02 supersedes the Discord-only policy; retain OAuth defenses.\n    expect(authConfig.emailAndPassword?.enabled).toBe(true);\n    expect(authConfig.emailAndPassword?.requireEmailVerification).toBe(true);'));
const oldLock=JSON.parse(head('package-lock.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));oldLock.packages['apps/api'].dependencies.nodemailer='10.0.14';oldLock.packages['apps/api'].devDependencies['@types/nodemailer']='8.0.2';assert.deepEqual(lock,oldLock);
const secrets=Object.entries(parseEnv(fs.readFileSync('.env.local','utf8'))).filter(([k,v])=>/(SECRET|PASSWORD|PRIVATE_KEY)/.test(k)&&v.length>=8).map(([,v])=>v);
for(const f of files.filter(allow)){const raw=fs.readFileSync(f);assert(!secrets.some(s=>raw.includes(Buffer.from(s))),'Configured secret leak');if(f.startsWith(dir))assert(!/[?&]token=[A-Za-z0-9_.-]{16,}/.test(raw.toString()),'Raw mailed token in evidence');}
console.log(JSON.stringify({baselines:7,readonlyFiles:Object.keys(snapshot).length,frozenFiles:count,configuredSecretLeak:false,ownerProfileAndOldTestExactScope:true,lockVersionsPreserved:true,databaseContractsFrontendUnchanged:true}));
