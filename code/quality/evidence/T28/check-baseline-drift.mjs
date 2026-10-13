import fs from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),sha=value=>createHash('sha256').update(value).digest('hex');
const files={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png',mockupFeedSha256:'../.doc/mockups/03-community-feed-desktop-mobile.png',mockupAuthSha256:'../.doc/mockups/04-login-desktop-mobile.png',mockupAdminSha256:'../.doc/mockups/05-admin-support-desktop.png'};
const actual=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,sha(fs.readFileSync(file))]));
const current=fs.readFileSync(files.specSha256,'utf8'),candidate=current.replace('Ngày cập nhật: 07/10/2026.','Ngày cập nhật: 04/10/2026.');
const report={recordedAt:new Date().toISOString(),actual,expected:baseline.hashes,mismatches:Object.keys(files).filter(key=>actual[key]!==baseline.hashes[key]),originalDateRestorationMatchesApprovedSource:sha(candidate)===baseline.hashes.specSha256};
fs.writeFileSync('quality/evidence/T28/baseline-drift.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mismatches:report.mismatches,originalDateRestorationMatchesApprovedSource:report.originalDateRestorationMatchesApprovedSource}));
