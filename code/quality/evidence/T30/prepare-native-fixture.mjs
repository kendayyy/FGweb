import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T30',hash=s=>createHash('sha256').update(s).digest('hex');
const changes=[];
function copy(source,target,transform){
 const original=fs.readFileSync(source,'utf8'),proposed=transform(original);
 assert(!fs.existsSync(target),'Preserve existing fixture; choose a new round');
 fs.writeFileSync(target,proposed,{flag:'wx'});
 changes.push({source,sourceSha256:hash(original),target,targetSha256:hash(proposed)});
}
copy('quality/evidence/T28/private-gateway-fixture.mjs',dir+'/private-gateway-fixture.mjs',s=>s.replaceAll('.runtime/t28/','.runtime/t30/').replaceAll('fg-t26-gateway-','fg-t30-screen-gateway-'));
copy('quality/evidence/T28/fixture-server.mjs',dir+'/fixture-server.mjs',s=>{
 s=s.replaceAll('t28_voice_','t30_screen_').replaceAll('FG_T28_EVIDENCE_DIR','FG_T30_EVIDENCE_DIR').replaceAll('quality/evidence/T28/','quality/evidence/T30/').replaceAll('.runtime/t28/','.runtime/t30/').replaceAll('.cache/t28/','.cache/t30/').replaceAll('t28-','t30-');
 s=s.replace("{sender:'Hoàng Nam',receiver:'Linh',denied:'Quang Duy'}","{sender:'Hoàng Nam',receiver:'Linh',denied:'Quang Duy',third:'Minh Anh',fourth:'Bảo',viewer:'Hà'}");
 s=s.replace('[actors.receiver,actors.denied]',"Object.entries(actors).filter(([key])=>key!=='sender').map(([,actor])=>actor)");
 const old="const native=await sfu.listRooms();let audio=0;for(const room of native)for(const person of await sfu.listParticipants(room.name))audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;";
 assert(s.includes(old));
 s=s.replace(old,"const native=await sfu.listRooms();let audio=0;const nativeTracks=[];for(const room of native)for(const person of await sfu.listParticipants(room.name)){audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;for(const track of person.tracks)nativeTracks.push({identity:person.identity,sid:track.sid,type:track.type,source:track.source,muted:track.muted});}const slots=(await pool.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count;");
 s=s.replace('nativeUnmutedAudioTracks:audio','nativeUnmutedAudioTracks:audio,nativeTracks,publisherSlots:slots');
 return s;
});
fs.writeFileSync(dir+'/native-fixture-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',changes,reason:'Owned copy of prior accepted native fixture, six synthetic authenticated room members, current API/DB/private SFU, isolated t30 schema/runtime/cache. Native publication SID/source and quota observations added; no frozen source, main data, API success or media payload replacement.',executionPending:true},null,2)+'\n',{flag:'wx'});
console.log('Prepared isolated T30 fixture; no servers or tests started.');
