import fs from 'node:fs';
const twitch=fs.readFileSync('.runtime/t32/provider-protocol-readonly1/twitch.js','utf8');
for(const key of ['SetVolume=','_sendCommand(e','_handleMessage','_handleEvents','_eventEmitter','namespace','_sendCommand(u.Play']) {
 const index=twitch.indexOf(key);console.log(key,twitch.slice(Math.max(0,index-100),index+1100));
}
const loader=fs.readFileSync('.runtime/t32/provider-protocol-readonly1/youtube.js','utf8');
const url=loader.match(/var scriptUrl = '([^']+)'/)[1].replaceAll('\\/','/');
const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error('Official YouTube widget fetch HTTP '+response.status);
const text=await response.text();fs.writeFileSync('.runtime/t32/provider-protocol-readonly1/youtube-widget.js',text,{flag:'wx'});
for(const key of ['listening','onAutoplayBlocked','addEventListener','postMessage','event:"command"','initialDelivery']){const index=text.indexOf(key);console.log(key,text.slice(Math.max(0,index-120),index+800));}
console.log(JSON.stringify({url,http:response.status,bytes:Buffer.byteLength(text),readOnly:true,executed:false}));
