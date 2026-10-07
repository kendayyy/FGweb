import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines} from '../../../scripts/verify-task.mjs';

const dir='quality/evidence/AUTH-ADMIN-SINGLE',hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(item=>item.id==='AUTH-ADMIN-SINGLE');
assert.equal(task.status,'IN_PROGRESS');assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
for(const [file,sha] of Object.entries(task.pendingOutputsHash.files))assert.equal(hash(file),sha,file);
const labels=['ownership-checkpoint-lint-1','ownership-checkpoint-1','diff-check-3','login-issue-state-1','resume-activation-1','alias-before-activation-1','main-activate-1','main-headed-login-1','main-prepare-verified-1','activation-lint-1','finish-lint-1','owner-audit-5','diff-check-4'];
for(const label of labels){
 const record=JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`));assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);
 if(!task.commands.some(item=>item.evidencePath===record.evidencePath))task.commands.push(record);
 if(!task.evidencePaths.includes(record.evidencePath))task.evidencePaths.push(record.evidencePath);
}
for(const record of task.commands){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
const activation=JSON.parse(fs.readFileSync(`${dir}/codex-main-activate-1.txt`));assert.equal(activation.ownerVerified,true);assert.equal(activation.adminActivated,true);
const main=JSON.parse(fs.readFileSync(`${dir}/main-login-proof.json`));
assert.equal(main.headed,true);assert.equal(main.realMainDatabase,true);assert.equal(main.nativeAliasStatus,200);assert.equal(main.authenticatedMeStatus,200);assert.equal(main.fixedIdentityMatches,true);assert.equal(main.httpOnlyCookie,true);assert.equal(main.soleServerAdmin,true);assert.equal(main.logoutStatus,200);assert.equal(main.afterLogoutStatus,401);
const retry=JSON.parse(fs.readFileSync(`${dir}/codex-main-prepare-verified-1.txt`));assert.equal(retry.created,false);assert.equal(retry.verified,true);assert.equal(retry.verificationSent,false);
const completedAt=new Date().toISOString();
const verification=JSON.parse(fs.readFileSync(`${dir}/verification.json`));
Object.assign(verification,{status:'PASS',completedAt,commands:task.commands,mainProvisioning:true,mainEmailVerification:true,mainAdminActivated:true,mainNativeLogin:main,blocker:null});
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(verification,null,2)+'\n');
fs.writeFileSync(`${dir}/review.md`, `# AUTH-ADMIN-SINGLE review — PASS

New credentials share the approved8–128 Unicode code point/Lu/P/S policy without trimming or normalization. Legacy sign-in/current-password proof remains valid. Genuine failing codec tests exposed installed Better Auth NFKC normalization; new fgscrypt-v1 salted scrypt hashes preserve exact raw Unicode and whitespace, legacy untagged hashes retain their old verifier without reset. Native UTF16 bounds8–256 are an envelope only; contracts enforce128 points. Shared FG login layout accepts email or the reserved kingame alias.

Only one fixed server userId grants admin after stored kingame identity, native credential, real email verification and current ban checks. Discord/multi-ID fallbacks are removed. Public signup/OAuth/user/profile/onboarding name mutations cannot take the reserved identity; the admin cannot rename it away. Native alias producer creates real session cookies and honors verification, rate limits, bans and logout. An initial nested returnHeaders failure was corrected with asResponse; its genuine failed run remains and assertions were preserved.

Provisioning serializes a protected immutable owner binding and refuses occupied ID/email/reserved user/profile names or a different binding. Concurrent prepare produces one unverified account; retries retain the stored hash. Native SMTP ownership verification is required before activation. Main operational CLI prepare created one pending account, repeat prepare created/mailed nothing, and state audit verified the exact local private password against salted storage and binding without logging values. The owner consumed the real mailed verification on the actual application. Main status then confirmed verification while the sole config was still unset. The human-reported alias failure was reproduced as native401 INVALID_EMAIL_OR_PASSWORD before activation. Reviewed CLI activate set only the fixed server ID. Headed main login then returned200, genuine Me200 for the fixed ID, HttpOnly cookie, actual sole server role, native logout200 and subsequent Me401. Verified prepare retry created/mailed nothing. No forced emailVerified flag or account linking was used.

Verification:108 contracts;245 API across15 suites plus strengthened14 focused race/collision/codec/security cases;152 web DOM tests across12 fresh sequential processes;4 headed isolated E2E preserving the original3 auth flows, plus one separate headed actual main login/logout check. Source/test types, builds, scoped lint, baseline/private-value audit and git diff check passed. Existing RED/failures/config startup failure logs are retained and are not counted PASS. Superseded creation-policy fixtures, login labels and legacy Discord-role expectation were migrated; no test skipped, timeout shortened or assertions weakened. Four1440/1280/390/360 screenshots preserve approved layout/Inter/blue CTA and touch/overflow checks. Existing ts-jest/Nest wildcard and Vite teardown diagnostics remain.

Windows IPv4/IPv6 excluded ports include5173. The first local preview EACCES failure remains. Actual compiled local application runs at localhost:18080 against main PG/Redis and real configured SMTP; verification was remailed for this temporary origin. Existing Discord/provider origins, portal settings and OS exclusions were preserved. Runtime reloads the activated sole config; private input/config are ignored and not committed. No production publish, service purchase, media load, encryption deployment, support UI or light-theme acceptance is claimed.

The original strict gate passed before owner writes. Resume verified the WIP fingerprints and8 approved baselines; audit checked every previous frozen/readonly file outside exact current owner scope. Persistent explicit user scope authorization was pinned before integration edits. Prior PASS/evidence/checker requirements were preserved. Closure freezes reviewed replacement source/compiled output hashes for the next strict task gate. Next checkpoint:LIGHT01-FE, not opened in this owner.
`);
fs.appendFileSync('quality/spec-coverage.md','| Exact new/legacy password proof, sole reserved native admin, actual SMTP ownership and idempotent activation | AUTH-ADMIN-SINGLE |108 contracts;245 API;152 web;4 headed fixture E2E;actual main headed alias200/Me200/role/HttpOnly/logout200/Me401;review and verification | PASS |\n');
const allow=file=>task.writeAllowlist.some(pattern=>pattern.endsWith('/**')?file.startsWith(pattern.slice(0,-2)):file===pattern);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const outputs=new Set(files.filter(file=>allow(file)&&!file.startsWith(dir)));
for(const previous of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const file of Object.keys(previous.outputsHash?.files??{}))if(allow(file)&&fs.existsSync(file)&&!file.startsWith('apps/web/dist/assets/'))outputs.add(file);
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
for(const directory of ['packages/contracts/dist','apps/api/dist'])for(const file of walk(directory))outputs.add(file);
for(const file of ['apps/web/dist/index.html',`${dir}/review.md`,`${dir}/verification.json`,`${dir}/main-login-proof.json`])outputs.add(file);
for(const file of outputs)assert(allow(file),`Output outside owner scope:${file}`);
task.outputsHash={specSha256:task.specSha256,files:Object.fromEntries([...outputs].sort().map(file=>[file,hash(file)]))};
task.status='PASS';task.completedAt=completedAt;task.blockers=[];
task.pendingVerification={...task.pendingVerification,mainProvisioning:true,mainOwnershipVerified:true,mainAdminActivated:true,mainNativeLogin:true,personalPasswordLogged:false};
delete task.pendingOutputsHash;
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:task.id,status:task.status,mainOwnershipVerified:true,mainAdminActivated:true,actualMainHeadedLoginPassed:true,outputFiles:outputs.size,nextTask:'LIGHT01-FE',nextTaskOpened:false}));
