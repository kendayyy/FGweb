import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
for(const args of [
 [d+'/record.mjs','t30-dual-transport-web-regressions-1','node','node_modules/vitest/vitest.mjs','run','--config','E:/FGweb/code/apps/web/vitest.config.ts','--root','apps/web','--maxWorkers=1','--no-file-parallelism','--no-cache'],
 [d+'/record.mjs','t30-dual-transport-web-typecheck-1','node','node_modules/typescript/bin/tsc','-p','apps/web/tsconfig.json','--noEmit'],
 [d+'/record.mjs','t30-build-2','node','node_modules/vite/bin/vite.js','build','apps/web','--config','apps/web/vite.config.ts','--emptyOutDir','false'],
 [d+'/record.mjs','t30-build-index-adoption-2','node',d+'/adopt-built-index.mjs','t30-build-2']
]){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.status!==0){process.exitCode=result.status??1;break;}}
