import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T30',run='t30-native-3cd5a8dcabba4a1d989125a4031be1a5';
const photos=fs.readdirSync(dir+'/demo/'+run).filter(p=>p.endsWith('.png')).map(name=>{const path=dir+'/demo/'+run+'/'+name;return{path,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex'),inspected:true};});
const state=JSON.parse(fs.readFileSync('.runtime/telegram-bridge/state.json','utf8'));
const delivery=Object.entries(state.demoStream??{}).filter(([name])=>name.includes(run)).map(([name,status])=>({name,status}));
fs.writeFileSync(dir+'/native1-photo-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',run,photos,delivery,findings:['Actual initial viewport and failed connection visible, synthetic users only; masked inputs/private chat.','No capture stage was reached; these images do not establish live/visual acceptance.'],nativeAcceptance:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({photos:photos.length,delivery}));
