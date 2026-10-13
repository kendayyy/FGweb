import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';const dir='quality/evidence/T29',path='apps/api/src/modules/calls/signaling-gateway.ts',before=fs.readFileSync(path,'utf8');let s=before;
const replace=(a,b)=>{assert(s.includes(a),a);s=s.replace(a,b);};
replace("import {SignalResponse} from '@livekit/protocol';","import {SignalResponse,SignalRequest,RequestResponse_Reason,TrackSource,TrackType} from '@livekit/protocol';");
replace(' let ticking=false,closing=false;',' const pendingPublications=new Map<string,{slotId:string;cid:string;sid?:string}>();\n let ticking=false,closing=false;');
replace('  await remove(id,room);','  for(const key of [...pendingPublications.keys()])if(key.startsWith(id+\':\'))pendingPublications.delete(key);\n  await remove(id,room);');
replace('binding.policyKey=key;}return true;','binding.policyKey=key;}for(const source of [TrackSource.SCREEN_SHARE,TrackSource.SCREEN_SHARE_AUDIO])if(!permission.canPublishSources.includes(source))pendingPublications.delete(lease.id+\':\'+source);return true;');
const anchor=' function send(to:WebSocket,data:RawData,binary:boolean)';
replace(anchor,` function bytesOf(data:RawData){return Array.isArray(data)?Buffer.concat(data):Buffer.from(data as ArrayBuffer);}
 function observePublication(binding:Binding,data:RawData,binary:boolean){let response;try{const bytes=bytesOf(data);response=binary?SignalResponse.fromBinary(bytes):SignalResponse.fromJsonString(bytes.toString('utf8'));}catch{return;}
  if(response.message.case==='trackPublished'){const value=response.message.value,source=value.track?.source;if(source===TrackSource.SCREEN_SHARE||source===TrackSource.SCREEN_SHARE_AUDIO){const pending=pendingPublications.get(binding.lease.id+':'+source);if(pending?.cid===value.cid)pending.sid=value.track?.sid;}}
  if(response.message.case==='trackUnpublished'){const sid=response.message.value.trackSid;for(const [key,value]of pendingPublications)if(key.startsWith(binding.lease.id+':')&&value.sid===sid)pendingPublications.delete(key);}
 }
 async function forwardClient(binding:Binding,data:RawData,binary:boolean){const bytes=bytesOf(data),request=binary?SignalRequest.fromBinary(bytes):SignalRequest.fromJsonString(bytes.toString('utf8'));
  if(request.message.case!=='addTrack'){if(await live(binding))send(binding.upstream,data,binary);return;}
  const track=request.message.value;
  await lockedLease(binding.lease.id,async(db,lease)=>{const permission=await publicationPermission(db,lease),policyKey=permission.canPublishSources.join(',');if(policyKey!==binding.policyKey){await native.updateParticipant(lease.room_name,lease.id,{permission});binding.policyKey=policyKey;}
   const deny=(reason:RequestResponse_Reason,message:string)=>{const response=new SignalResponse({message:{case:'requestResponse',value:{reason,message,request:{case:'addTrack',value:track}}}});send(binding.peer,binary?Buffer.from(response.toBinary()):Buffer.from(response.toJsonString()),binary);};
   const screen=track.source===TrackSource.SCREEN_SHARE,audio=track.source===TrackSource.MICROPHONE||track.source===TrackSource.SCREEN_SHARE_AUDIO;
   if(!track.cid||track.cid.length>256||(!screen&&!audio)||(screen?track.type!==TrackType.VIDEO:track.type!==TrackType.AUDIO)||!permission.canPublishSources.includes(track.source)){deny(RequestResponse_Reason.NOT_ALLOWED,'Current publication source denied');return;}
   if(track.source===TrackSource.SCREEN_SHARE||track.source===TrackSource.SCREEN_SHARE_AUDIO){
    const slot=(await db.query<{id:string}>('SELECT id FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2',[lease.call_group_id,lease.user_id])).rows[0];if(!slot){deny(RequestResponse_Reason.NOT_ALLOWED,'Current screen quota required');return;}
    const key=lease.id+':'+track.source,peer=await native.getParticipant(lease.room_name,lease.id),existing=peer.tracks.filter(t=>t.source===track.source);let pending=pendingPublications.get(key);if(pending?.slotId!==slot.id){pendingPublications.delete(key);pending=undefined;}
    // A secondary codec may extend the SAME verified native track, never add a screen.
    const sameNative=Boolean(track.sid&&existing.some(t=>t.sid===track.sid));
    if(!sameNative&&(existing.length>0||(pending&&pending.cid!==track.cid))){deny(RequestResponse_Reason.LIMIT_EXCEEDED,'One native track per screen quota/source');return;}
    if(!sameNative&&!pending)pendingPublications.set(key,{slotId:slot.id,cid:track.cid});
   }
   send(binding.upstream,data,binary);
  });
 }
`+anchor);
replace('if(await live(current))send(current.peer,data,binary);','if(await live(current)){observePublication(current,data,binary);send(current.peer,data,binary);}');
replace('if(await live(own))send(upstream,data,binary);','await forwardClient(own,data,binary);');
replace('if(!closing&&![...sockets].some(s=>s.lease.id===own.lease.id))void pool.query',"if(![...sockets].some(s=>s.lease.id===own.lease.id)){for(const key of [...pendingPublications.keys()])if(key.startsWith(own.lease.id+':'))pendingPublications.delete(key);}if(!closing&&![...sockets].some(s=>s.lease.id===own.lease.id))void pool.query");
const proposed=dir+'/track-cardinality-proposed.ts',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.writeFileSync(proposed,s,{flag:'wx'});fs.writeFileSync(dir+'/track-cardinality-plan.json',JSON.stringify({reason:'Actual native duplicate-source RED accepted4 SCREEN_SHARE tracks on3 slots. Gateway serializes AddTrack with existing room/group mutex, requires current source/type/slot, one in-flight/native track per screen quota/source, native publication/unpublication ACK tracking and slot-generation reset. Allow only verified same native SID codec extension. Standard protocol NOT_ALLOWED/LIMIT_EXCEEDED errors, never fabricated successful SFU responses. No RTP relay or DB migration.',files:[{path,proposed,beforeSha256:hash(path),afterSha256:hash(proposed)}],redEvidence:{path:dir+'/codex-t29-duplicate-source-red-1.json',sha256:hash(dir+'/codex-t29-duplicate-source-red-1.json')}},null,2)+'\n',{flag:'wx'});
