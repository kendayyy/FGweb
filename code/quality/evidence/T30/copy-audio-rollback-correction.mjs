import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T30',review=JSON.parse(fs.readFileSync(dir+'/audio-rollback-review.json','utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(hash(review.source),review.beforeSha256);assert.equal(hash(review.proposed),review.afterSha256);const to=dir+'/antigravity-audio-rollback-1';fs.mkdirSync(to);fs.copyFileSync(review.proposed,to+'/media.ts');assert.equal(hash(to+'/media.ts'),review.afterSha256);fs.writeFileSync(to+'/exact-copy-proof.json',JSON.stringify({recordedAt:new Date().toISOString(),executor:'Antigravity Gemini 3.6 Flash (High)',sourceReview:dir+'/audio-rollback-review.json',path:to+'/media.ts',sha256:review.afterSha256,assertionsChanged:false,applicationAdopted:false},null,2)+'\n',{flag:'wx'});console.log('Exact audio rollback source proposal copied; tests still pending.');
