import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T26-FIX1',cache='.cache/t26-fix1/native',proof=[];
fs.mkdirSync(cache,{recursive:true});
for(const name of ['call-admission','call-gateway','call-lifecycle']){
 const source=`apps/api/test/${name}.integration.spec.ts`,target=`${cache}/${name}.spec.ts`,original=fs.readFileSync(source,'utf8');
 const substitutions=[["'../src/","'../../../apps/api/src/"],["'./test-cookie-helper.js'","'../../../apps/api/test/test-cookie-helper.js'"],['quality/evidence/T27/',`${dir}/`]];
 let next=original;for(const [from,to]of substitutions)next=next.replaceAll(from,to);
 let restored=next;for(const [from,to]of [...substitutions].reverse())restored=restored.replaceAll(to,from);assert.equal(restored,original,'Only immutable regression imports/owned fixture paths may change');
 fs.writeFileSync(target,next,{flag:'wx'});proof.push({source,target,sourceSha256:createHash('sha256').update(original).digest('hex'),ownedCopySha256:createHash('sha256').update(next).digest('hex'),substitutions,allBehaviorAndAssertionsUnchanged:true});
}
fs.writeFileSync(`${dir}/regression-provenance.json`,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(`${dir}/regression-jest.config.mjs`,"import path from 'node:path';\nimport config from '../../../apps/api/jest.config.js';\nexport default {...config,rootDir:process.cwd(),roots:[path.resolve('.cache/t26-fix1/native')],moduleNameMapper:{...config.moduleNameMapper,'^@fg/database$':'<rootDir>/packages/database/dist/index.js','^@fg/contracts$':'<rootDir>/packages/contracts/dist/index.js'},cacheDirectory:path.resolve('.cache/t26-fix1/jest'),coverageDirectory:path.resolve('.cache/t26-fix1/coverage')};\n",{flag:'wx'});
console.log(JSON.stringify({nativeRegressionCopies:proof.length,allAssertionsUnchanged:true,ownedRuntimeAndScreenshots:true}));
