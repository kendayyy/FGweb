import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const d='quality/evidence/T30',output=d+'/docker-page-cache-reclaim31.json';assert(!fs.existsSync(output));
const command=args=>{const r=spawnSync('wsl.exe',['--distribution','docker-desktop','--user','root','--exec',...args],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,'Docker WSL command failed');return r.stdout.trim();};
const before={at:new Date().toISOString(),hostFreeBytes:os.freemem(),linux:command(['free','-m'])};
// Release clean filesystem caches only. No service, data, swap or persistent configuration changes.
command(['sync']);command(['sh','-c','echo 3 > /proc/sys/vm/drop_caches']);
await new Promise(resolve=>setTimeout(resolve,12000));
const after={at:new Date().toISOString(),hostFreeBytes:os.freemem(),linux:command(['free','-m'])};
const result={before,after,scope:'docker-desktop clean page/dentry/inode caches',servicesStoppedByThisScript:false,persistentConfigurationChanged:false,noCockpitStartup:true};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
