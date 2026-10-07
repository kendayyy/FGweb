import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-FE',frozen='.runtime/auth02-fe/frozen-spec',hash=b=>createHash('sha256').update(b).digest('hex');
assert(!fs.existsSync(`${dir}/pending-amendment.json`));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const sources={specSha256:'01-product-spec.md',designSha256:'02-frontend-design.md',taskSha256:'task.md',mockupLobbySha256:'mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'mockups/02-group-call-live.png',mockupFeedSha256:'mockups/03-community-feed-desktop-mobile.png',mockupAuthSha256:'mockups/04-login-desktop-mobile.png'};
const manifest={currentCheckpoint:'AUTH02-FE',checkpointBaseline:baseline.hashes.specSha256,deferredChanges:['SUPPORT-ADMIN-01','AUTH-PASSWORD-03'],authorization:{threadId:'01a114a3-ab20-70e2-b020-db31d489bffd',adminPlanUserMessage:'01a11572-3ff8-79a2-9246-39123e366f4f',newPasswordPolicyUserMessage:'01a11578-f69e-7542-92c9-1e8bcfb74dff',handoff:'task.md explicitly requires current AUTH02-FE reviewed PASS before rebaseline/AUTH-ADMIN-SINGLE; no current outputs/ledger altered by the documents task'},capturedAt:new Date().toISOString(),frozenRoot:path.resolve(`${frozen}/code`),sources:{},approvedNextMockup:{path:'../.doc/mockups/05-admin-support-desktop.png',sha256:hash(fs.readFileSync('../.doc/mockups/05-admin-support-desktop.png'))}};
fs.mkdirSync(`${frozen}/code`,{recursive:true});
for(const [key,relative]of Object.entries(sources)){
 const live=fs.readFileSync(`../.doc/${relative}`),expected=baseline.hashes[key];let original=live;
 if(hash(live)!==expected){const head=execFileSync('git',['show',`HEAD:.doc/${relative}`]),lf=head.toString().replaceAll('\r\n','\n');original=[head,Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n'))].find(b=>hash(b)===expected);assert(original,`Approved baseline bytes unavailable: ${relative}`);}
 const file=`${frozen}/.doc/${relative}`;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,original);
 manifest.sources[key]={livePath:`../.doc/${relative}`,liveSha256:hash(live),frozenPath:file,frozenSha256:hash(original),pendingAmendment:hash(live)!==expected};
}
fs.writeFileSync(`${dir}/pending-amendment.json`,JSON.stringify(manifest,null,2)+'\n');
fs.appendFileSync(`${dir}/plan.md`,'\n## Approved documents changed during final review\n\nSUPPORT-ADMIN-01/AUTH-PASSWORD-03 arrived from the human-owned Idea thread. New task.md explicitly says finish current AUTH02-FE reviewed checkpoint before rebaseline and AUTH-ADMIN-SINGLE. Preserve live amended documents unchanged. Capture exact seven approved d9 baseline sources from matching raw Git bytes into owned readonly runtime; audit that historical snapshot through the unchanged checkBaselines function, and audit live amendment hashes separately. Existing strict gate1/gate2 preceded the amendment. AUTH02-FE closes only original12–128 baseline; never claim new8–128 composition, kingame provisioning/admin/support implemented. Next mandatory step is documented rebaseline (adds mockup05 to checker, never relaxes seven sources), then AUTH-ADMIN-SINGLE before LIGHT01-FE. Original PASS evidence/outputs retained. No spec rollback or acceptance substitution.\n');
console.log(JSON.stringify({historicalCheckpointSources:7,liveDocsPreserved:true,pendingChanges:manifest.deferredChanges,nextGateRequiresRebaseline:true}));
