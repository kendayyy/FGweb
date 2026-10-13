import fs from 'node:fs';import {createHash} from 'node:crypto';
const from='quality/evidence/CHATCRYPTO-FE/',to='quality/evidence/CHATCRYPTO-QA/';
const sources=['legacy-current-headed-source.mjs','report-custody-fixture.mjs','legacy-archive-custody-fixture.mjs','legacy-source-archive.mjs'];
const captured=[];
for(const source of sources){const bytes=fs.readFileSync(from+source,'utf8');let text=bytes.replaceAll('crypto_fe_','crypto_qa_').replaceAll('fg-chatcrypto-fe','fg-chatcrypto-qa').replaceAll('.runtime/chatcrypto-fe','.runtime/chatcrypto-qa').replaceAll('quality/evidence/CHATCRYPTO-FE','quality/evidence/CHATCRYPTO-QA').replaceAll('CHATCRYPTO-FE','CHATCRYPTO-QA');
const target=source==='legacy-current-headed-source.mjs'?'headed-legacy-regression.mjs':source;
fs.writeFileSync(to+target,text,{flag:'wx'});captured.push({source:from+source,sha256:createHash('sha256').update(bytes).digest('hex'),target:to+target,targetSha256:createHash('sha256').update(text).digest('hex')});}
fs.writeFileSync(to+'legacy-regression-source-review.json',JSON.stringify({recordedAt:new Date().toISOString(),captured,qaOwnedSchemasRuntimeDockerEvidence:true,originalFeSourcesUnmodified:true,frozenBeHelpersNotExecuted:true,originalAssertionsRetained:true,productionActivation:false},null,2)+'\n',{flag:'wx'});
