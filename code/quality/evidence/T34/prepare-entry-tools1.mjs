import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T34';for(const name of ['record.mjs','adopt-exact.mjs','journal-command1.mjs']){assert(!fs.existsSync(d+'/'+name));const source=fs.readFileSync('quality/evidence/T33/'+name,'utf8').replaceAll('T33','T34').replaceAll('t33','t34').replaceAll('83','84');fs.writeFileSync(d+'/'+name,source,{flag:'wx'});}
console.log(JSON.stringify({prepared:true,task:'T34',priorPass:84,noAppMutation:true}));
