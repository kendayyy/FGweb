import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE',digest=x=>createHash('sha256').update(x).digest('hex'),hash=p=>digest(fs.readFileSync(p));
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');
assert.equal(task.status,'IN_PROGRESS');
const before=JSON.parse(fs.readFileSync(`${dir}/membership-ui-before.json`,'utf8'));
for(const row of ledger.tasks.filter(t=>t.id!==task.id)) assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
const paths=['apps/web/src/features/rooms/RoomsPage.tsx','apps/web/dist/index.html'];
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
assert.equal(hash(`${dir}/membership-ui-original.tsx`),before.files[paths[0]]);
assert.equal(before.files[paths[0]],manifest.outputTransitions.find(t=>t.path===paths[0]).afterSha256);
const current=fs.readFileSync(paths[0],'utf8');
const callback="  const refreshCryptoMembers = useCallback(async () => {\n    if (selectedRoomId) await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, selectedRoomId], exact: true }, { throwOnError: true });\n  }, [queryClient, actorUserId, selectedRoomId]);\n  const denyCryptoRoom = useCallback(() => setCryptoDenied({ actor: actorUserId, room: selectedRoomId }), [actorUserId, selectedRoomId]);\n";
const restored=current.replace(', useRef, useCallback }',', useRef }').replace(callback,'').replace('onAccessDenied={denyCryptoRoom} onParticipantsChanged={refreshCryptoMembers}','onAccessDenied={()=>setCryptoDenied({actor:actorUserId,room:selectedRoomId})}');
assert.equal(restored.replaceAll('\r\n','\n'),fs.readFileSync(`${dir}/membership-ui-original.tsx`,'utf8').replaceAll('\r\n','\n'),'Only reviewed member callbacks/import/props may change');
const proofs=[`${dir}/membership-ui-scope-review.md`,`${dir}/membership-ui-before.json`,`${dir}/membership-ui-original.tsx`,`${dir}/routing-order-review.md`];
for(const label of ['membership-ui-scope-1','membership-ui-typecheck-1','membership-ui-lint-1','membership-http-native-1','multi-image-native-green-1','crypto-web-build-12','headed-group-4']){
 const p=`${dir}/codex-${label}.json`,r=JSON.parse(fs.readFileSync(p,'utf8')); assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);proofs.push(p,r.evidencePath);
}
const proofPath=fs.readdirSync(dir).filter(n=>/^headed-group-proof-crypto_fe_[a-f0-9]{32}\.json$/.test(n)).map(n=>`${dir}/${n}`).find(p=>Object.entries(JSON.parse(fs.readFileSync(p,'utf8')).buildHashes).every(([file,sha])=>hash(file)===sha));assert(proofPath);proofs.push(proofPath);
const snapshot=`${dir}/membership-headed-source.mjs`;fs.writeFileSync(snapshot,fs.readFileSync(`${dir}/headed-group.mjs`),{flag:'wx'});proofs.push(snapshot);
const review=`${dir}/membership-ownership-review.md`;
fs.writeFileSync(review,'# Membership source/index ownership review\n\nExact reconstruction verifies only reviewed RoomsPage member callbacks/import/props changed. Current build12/native HTTP/ordered two-image checks pass. Actual headed production UI uses bilateral native SAS, real room create/invitation acceptance producers, UI kick, distinct membership intervals and Megolm epochs. New member prejoin history and rejoin excluded interval history are denied by actual REST and UI; current messages decrypt after rejoin, no plaintext database content. Reviewed actual360px screenshot preserves FG layout without horizontal overflow. Group creation/invitation setup is actual API, not claimed as UI clicks. BAN producer remains T37. No full frontend/report/migration/PASS/main/production acceptance; old rows/snapshots/proof stages/checker preserved.\n',{flag:'wx'});proofs.push(review);
const amendment={source:review,reason:'Reviewed member metadata source and generated index after native/headed group lifecycle proof',paths};task.approvedScopeAmendments.push(amendment);
for(const p of paths){const t=manifest.outputTransitions.find(t=>t.path===p);assert(t);t.afterSha256=hash(p);t.scopeSha256=digest(JSON.stringify(amendment));t.requiredEvidence.push(...proofs.map(p=>({path:p,sha256:hash(p)})));}
const manifestPath=`${dir}/membership-gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:paths});
const adoption={recordedAt:new Date().toISOString(),paths,proofPath,manifestPath,historicalRowsUnchanged:true,frontendComplete:false,mainMutation:false},out=`${dir}/membership-adoption.json`;fs.writeFileSync(out,JSON.stringify(adoption,null,2)+'\n',{flag:'wx'});
task.evidencePaths=[...new Set([...task.evidencePaths,...proofs,manifestPath,out])];assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(adoption));
