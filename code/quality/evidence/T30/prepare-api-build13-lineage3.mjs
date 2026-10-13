import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30';let source=fs.readFileSync(d+'/adopt-api-build-13-reviewed2.mjs','utf8');
source=source.replaceAll('api-build-13-review.json','api-build-13-review3.json').replaceAll('api-build-13-gate-manifest.json','api-build-13-gate-manifest3.json');
const a='task.approvedScopeAmendments.push(amendment);';assert(source.includes(a));source=source.replace(a,a+"const declarationPath='apps/api/dist/modules/calls/call-lifecycle.service.d.ts';if(!task.writeAllowlist.includes(declarationPath))task.writeAllowlist.push(declarationPath);");
const b='[rp,cp,command.evidencePath].map';assert(source.includes(b));source=source.replace(b,"[rp,cp,command.evidencePath,d+'/api-build13-declaration-review2.json',d+'/lifecycle-coalescing-source-review1.json'].map");
source=source.replace('all other compiled bytes unchanged; fresh GREEN','only four new private declarations and their originating source review authorize this exact additional compiler artifact in T30 write scope, all other compiled bytes unchanged; fresh GREEN');
fs.writeFileSync(d+'/adopt-api-build-13-reviewed3.mjs',source,{flag:'wx'});
