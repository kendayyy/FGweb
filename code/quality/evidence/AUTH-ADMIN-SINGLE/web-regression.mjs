import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=fs.readdirSync('apps/web/test').filter(file=>file.endsWith('.test.tsx')).sort();
for(const [index,file]of files.entries()){
 const result=spawnSync(process.execPath,['quality/evidence/AUTH-ADMIN-SINGLE/record.mjs',`web-regression-${index+1}`,process.execPath,'node_modules/vitest/vitest.mjs','run','--root','apps/web',`test/${file}`,'--maxWorkers','1'],{cwd:process.cwd(),stdio:'inherit',windowsHide:true});
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
