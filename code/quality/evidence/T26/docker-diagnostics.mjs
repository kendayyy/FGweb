import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
const state=JSON.parse(fs.readFileSync(process.env.FG_T26_SFU_STATE??'.runtime/t26/isolated-sfu.json'));
const info=JSON.parse(execFileSync('docker',['inspect',state.container],{encoding:'utf8'}))[0];
console.log(JSON.stringify({state:info.State.Status,ports:info.NetworkSettings.Ports,networks:Object.fromEntries(Object.entries(info.NetworkSettings.Networks).map(([k,v])=>[k,{ip:v.IPAddress,gateway:v.Gateway}]))}));
const result=spawnSync('docker',['logs','--tail','120',state.container],{encoding:'utf8',windowsHide:true});
const output=(result.stdout??'')+(result.stderr??'');
const lines=output.split('\n').filter(l=>/starting LiveKit|nodeIP|ICE connection state|could not|failed|error/.test(l));
console.log(lines.map(l=>l.replace(/"(?:token|keys|secret)"\s*:\s*"[^"]*"/gi,'[redacted]')).join('\n'));
