import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex'),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),latest=new Map();
for(const task of ledger.tasks.filter(t=>t.status==='PASS'))for(const [p,h]of Object.entries(task.outputsHash?.files??{}))latest.set(p,{owner:task.id,hash:h});
const permutations=a=>a.length<=1?[a]:a.flatMap((x,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[x,...rest]));
const paths=['play-sessions/play-sessions.controller','play-sessions/play-sessions.service','teams/teams.controller','teams/teams.service'].map(p=>`apps/api/dist/modules/${p}.d.ts`),result=[];
for(const path of paths){
 const text=fs.readFileSync(path,'utf8'),unions=[...new Set(text.match(/"[^"\r\n]+"(?: \| "[^"\r\n]+")+/g)??[])];
 assert(unions.length<=4&&unions.every(u=>u.split(' | ').length<=5),'Bound union-order analysis (timing, state, status, customStatus)');
 let matched=false,attempts=0,matchingOrders;
 function inspect(s,i,orders){if(matched)return;if(i===unions.length){attempts++;assert(attempts<=20000);if(hash(s)===latest.get(path).hash){matched=true;matchingOrders=orders;}return;}
  for(const values of permutations(unions[i].split(' | '))){const ordered=values.join(' | ');inspect(s.replaceAll(unions[i],ordered),i+1,[...orders,{current:unions[i],previous:ordered}]);}}
 inspect(text,0,[]);assert(matched,`Prior digest cannot be explained solely by equivalent literal-union ordering: ${path}`);
 result.push({path,previous:latest.get(path),compilerHash:hash(text),priorDigestProvedByOnlyUnionPermutations:true,matchingOrders,attempts});
}
fs.writeFileSync('quality/evidence/T26/declaration-equivalence.json',JSON.stringify({recordedAt:new Date().toISOString(),method:'Read-only literal-union permutations recover exact predecessor SHA; no declaration text written to production',files:result},null,2)+'\n');console.log(JSON.stringify({equivalentDeclarations:result.length,productionTextRewritten:false}));
