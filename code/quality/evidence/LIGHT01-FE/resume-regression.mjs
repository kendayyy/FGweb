import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=fs.readdirSync('apps/web/test').filter(p=>p.endsWith('.test.tsx')).sort();
const failures=[];
for(const [i,file]of files.entries()){
 const result=spawnSync(process.execPath,['quality/evidence/LIGHT01-FE/record.mjs',`resume-regression-${i+1}`,process.execPath,'node_modules/vitest/vitest.mjs','run','--root','apps/web',`test/${file}`,'--maxWorkers','1'],{cwd:process.cwd(),stdio:'inherit',windowsHide:true});
 if(result.status!==0)failures.push(file);
}
console.log(JSON.stringify({files:files.length,failures}));process.exitCode=failures.length?1:0;
