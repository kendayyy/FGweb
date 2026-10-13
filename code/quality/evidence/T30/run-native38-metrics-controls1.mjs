import {spawn} from 'node:child_process';
for(const mode of ['healthy','query-io','metrics-io','health-io','zero','sample-error']){const child=spawn(process.execPath,['quality/evidence/T30/probe-native38-metrics-controlled1.mjs',mode],{windowsHide:true,stdio:'inherit'});const code=await new Promise(resolve=>child.once('exit',resolve));if(code!==0){process.exitCode=code??1;break;}}
