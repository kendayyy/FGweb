import fs from 'node:fs';import {createHash} from 'node:crypto';
const dir='quality/evidence/T30',state=JSON.parse(fs.readFileSync('.runtime/telegram-bridge/state.json','utf8'));
for(const [label,run]of [['native2','t30-native-1fa6e574326c48919eb1d37dc8f7c212'],['native3','t30-native-dfb15a8475a34562bab1f86f21fcd63c']]){
 const photos=fs.readdirSync(dir+'/demo/'+run).filter(p=>p.endsWith('.png')).map(name=>{const path=dir+'/demo/'+run+'/'+name;return{path,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex'),inspected:true};});
 const delivery=Object.entries(state.demoStream??{}).filter(([name])=>name.includes(run)).map(([name,status])=>({name,status}));
 fs.writeFileSync(dir+'/'+label+'-photo-review.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',run,photos,delivery,findings:label==='native2'?['Actual start/error viewport inspected; connection failed, no capture.']:['Actual start and failed-run checkpoint inspected. Sender connected/unmuted, visible six room members and audio controls; failure occurred on third actor. Prior activePage captured sender so next reviewed harness sets active actor before join. No capture reached.'],nativeAcceptance:false},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({label,photos:photos.length,delivery}));
}
