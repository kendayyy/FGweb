import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
const dir='quality/evidence/CHATCRYPTO-BE',hash=b=>createHash('sha256').update(b).digest('hex'),review=JSON.parse(fs.readFileSync(`${dir}/history-amendment-review.json`)),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),copy=fs.readFileSync(`${dir}/history-baseline-before.json`),env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(hash(copy),review.baselineBeforeSha256);const original=structuredClone(baseline);original.hashes.taskSha256=review.taskBeforeSha256;const bytes=Buffer.from(JSON.stringify(original,null,2)+'\n');assert.equal(hash(bytes),review.baselineBeforeSha256);
const findings=Object.entries(env).filter(([key,value])=>/(SECRET|PASSWORD|TOKEN|DATABASE_URL|REDIS_URL|SMTP_USER|SMTP_FROM)/i.test(key)&&value.length>=8&&JSON.stringify(baseline).includes(value));assert.deepEqual(findings.map(([key])=>key).sort(),['SMTP_FROM','SMTP_USER']);for(const [,value]of findings)assert.equal(JSON.stringify(baseline).split(value).length,JSON.stringify(original).split(value).length);
// Do not retain another raw copy of frozen legacy configuration. Preserve the
// exact digest and reconstruct/check the previous JSON in memory on every audit.
const projection={recordedAt:new Date().toISOString(),previousBaselineSha256:review.baselineBeforeSha256,previousTaskSha256:review.taskBeforeSha256,rawLegacyConfigurationCopyRemoved:true,privateIdentifierNames:findings.map(([key])=>key).sort(),exactPriorReconstructedFromCurrent:true};fs.writeFileSync(`${dir}/history-baseline-before.json`,JSON.stringify(projection,null,2)+'\n');
const result={...projection,projectionSha256:hash(fs.readFileSync(`${dir}/history-baseline-before.json`)),applicationSecretScanUnchanged:true,baselinePrivateIdentifierOccurrencesUnchanged:true,baselineExceptAuthorizedTaskHashExactlyFrozen:true,scope:'Only immutable legacy baseline metadata, never application/config source or new values'};fs.writeFileSync(`${dir}/history-privacy-review.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
