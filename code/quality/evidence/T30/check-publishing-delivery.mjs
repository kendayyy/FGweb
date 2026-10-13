import fs from 'node:fs';
const run='t30-reg-webhook-96eba8a6d4ac456b83c7778b1d5539ae',state=JSON.parse(fs.readFileSync('.runtime/telegram-bridge/state.json','utf8'));
for(const name of fs.readdirSync('quality/evidence/TELEGRAM-BRIDGE-01/demo-stream').filter(n=>n.includes(run)&&n.endsWith('.json'))){const value=state.demoStream?.[name];console.log(JSON.stringify({name,type:typeof value,keys:value&&typeof value==='object'?Object.keys(value):[],status:typeof value==='string'?value:value?.status??value?.state??'pending'}));}
