import {spawnSync} from 'node:child_process';
for(const config of ['apps/web/tsconfig.json','quality/evidence/T28/test-types.json']){
 const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p',config,'--noEmit'],{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
 process.stdout.write(`${config}\n${result.stdout??''}${result.stderr??''}`);
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
