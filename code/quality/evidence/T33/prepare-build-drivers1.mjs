import fs from 'node:fs';import assert from 'node:assert/strict';
let s=fs.readFileSync('quality/evidence/T31/build-source-sandbox2.mjs','utf8').replaceAll('T31','T33').replaceAll('t31','t33').replaceAll('-build2','-build1');
for(const[from,to]of [["['contracts','database','api']","['contracts','database','api','worker']"],["kind==='api'?'apps/api':'packages/'+kind","['api','worker'].includes(kind)?'apps/'+kind:'packages/'+kind"],["Object.fromEntries(walk(canonical+'/dist').map","Object.fromEntries((fs.existsSync(canonical+'/dist')?walk(canonical+'/dist'):[]).map"]]){assert.equal(s.split(from).length,2);s=s.replace(from,()=>to);}
fs.writeFileSync('quality/evidence/T33/build-source-sandbox1.mjs',s,{flag:'wx'});
console.log('New owned contracts/database/API/worker compile driver; canonical source/build stay unchanged.');
