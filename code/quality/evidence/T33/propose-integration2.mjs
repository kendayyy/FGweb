import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T33',h=s=>createHash('sha256').update(s).digest('hex'),files=[];
const replace=(s,from,to)=>{assert.equal(s.split(from).length,2,'Unique source anchor '+from.slice(0,90));return s.replace(from,()=>to);};
function propose(path,edit){const old=fs.readFileSync(path,'utf8'),next=edit(old);assert.notEqual(old,next);const proposed=d+'/integration-proposals2/'+path;fs.mkdirSync(proposed.slice(0,proposed.lastIndexOf('/')),{recursive:true});fs.writeFileSync(proposed,next,{flag:'wx'});files.push({path,proposed,beforeSha256:h(old),afterSha256:h(next)});}
propose('packages/database/src/index.ts',s=>s+"\nexport * from './notification-authority.js';\nexport * from './notification-enqueue.js';\n");
propose('apps/api/src/modules/notifications/private-notifications.service.ts',s=>{const match=s.match(/const privateSourceAuthority=(`[^`]*`);/);assert(match);const shared=fs.readFileSync('packages/database/src/notification-authority.ts','utf8');assert(shared.includes('export const privateNotificationSourceAuthority='+match[1]+';'));return "import {privateNotificationSourceAuthority as privateSourceAuthority} from '@fg/database';\n"+replace(s,match[0],'');});
propose('apps/api/src/modules/notifications/private-notifications.controller.ts',s=>s.replaceAll('PrivateNotificationsService','NotificationsService').replaceAll("'./private-notifications.service.js'","'./notifications.service.js'"));
propose('apps/api/src/modules/notifications/private-notifications.module.ts',s=>{
 s="import {NotificationsService} from './notifications.service.js';\nimport {NotificationsController} from './notifications.controller.js';\n"+s;
 s=replace(s,'providers:[PrivateNotificationsService]','providers:[PrivateNotificationsService,NotificationsService]');s=replace(s,'controllers:[PrivateNotificationsController]','controllers:[PrivateNotificationsController,NotificationsController]');return replace(s,'exports:[PrivateNotificationsService]','exports:[PrivateNotificationsService,NotificationsService]');
});
propose('apps/api/src/modules/realtime/realtime.gateway.ts',s=>{
 s="import {NotificationsService} from '../notifications/notifications.service.js';\n"+s;
 s=replace(s,'@Optional() private readonly notices?:PrivateNotificationsService) { }','@Optional() private readonly notices?:PrivateNotificationsService,@Optional() private readonly notifications?:NotificationsService) { }');
 s=replace(s,"if(/^N:[a-f0-9-]{36}$/.test(id))work=this.deliverNotice(id.slice(2));","if(/^N:[a-f0-9-]{36}$/.test(id))work=this.deliverNotice(id.slice(2));\n                else if(/^R:[a-f0-9-]{36}$/.test(id))work=this.deliverRead(id.slice(2));");
 const start=s.indexOf('    private async deliverNotice(id:string){'),end=s.indexOf('    private async deliver(id: string)',start);assert(start>=0&&end>start);let block=s.slice(start,end);block=replace(block,'if(!this.notices)return;const recipient=await this.notices.recipient(id);','const notifier=this.notifications??this.notices;if(!notifier)return;const recipient=await notifier.recipient(id);');block=replace(block,'this.notices.realtimeNotice(await this.validate(socket),id)','notifier.realtimeNotice(await this.validate(socket),id)');
 block+=`    private async deliverRead(id:string){
        if(!this.notifications)return;const recipient=await this.notifications.recipient(id);if(!recipient)return;
        for(const socket of [...this.server.sockets.sockets.values()]){
            if(!socket.connected||socket.data.fgPrivateUserId!==recipient)continue;
            try{const notice=await this.notifications.realtimeNotice(await this.validate(socket),id);if(notice?.isRead&&socket.connected)socket.emit(SocketEventNames.NOTIFICATION_READ,{notificationId:id});}catch{/* Fresh session/ACL denial suppresses read-state routing. */}
        }
    }
`;
 return s.slice(0,start)+block+s.slice(end);
});
propose('apps/api/src/modules/social/social.service.ts',s=>{
 s="import {enqueueNotification} from '@fg/database';\n"+s;
 s=replace(s,"if (ownRow.status === 'PENDING') {\n          await client.query('COMMIT');","if (ownRow.status === 'PENDING') {\n          await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:ownRow.id,senderId:actorId},'friend:'+ownRow.id);\n          await client.query('COMMIT');");
 s=replace(s,"        await client.query('COMMIT');\n        return { requestId: freshId, status: 'PENDING' };","        await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:freshId,senderId:actorId},'friend:'+freshId);\n        await client.query('COMMIT');\n        return { requestId: freshId, status: 'PENDING' };");
 return replace(s,"      await client.query('COMMIT');\n      return { requestId: newId, status: 'PENDING' };","      await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:newId,senderId:actorId},'friend:'+newId);\n      await client.query('COMMIT');\n      return { requestId: newId, status: 'PENDING' };");
});
propose('apps/api/src/modules/invitations/invitations.service.ts',s=>{
 s="import {enqueueNotification} from '@fg/database';\n"+s;const start=s.indexOf('  private async notify('),end=s.indexOf('  private async admit(',start);assert(start>=0&&end>start);
 const old=s.slice(start,end),anchor=old.indexOf('    const dedup =');assert(anchor>0);const next=old.slice(0,anchor)+"    await enqueueNotification(db,user,type,data,`invitation:${i.id}:${phase}`);\n  }\n\n";return s.slice(0,start)+next+s.slice(end);
});
propose('apps/api/src/modules/teams/teams.service.ts',s=>{
 s="import {enqueueNotification} from '@fg/database';\n"+s;const start=s.indexOf(' private async notify('),end=s.indexOf('\n }',start)+3;assert(start>=0&&end>start);return s.slice(0,start)+" private async notify(db:PoolClient,userId:string,type:'JOIN_REQUEST'|'JOIN_REQUEST_RESULT',dedup:string,data:unknown){\n  await enqueueNotification(db,userId,type,data,dedup);\n }"+s.slice(end);
});
propose('apps/api/src/modules/play-sessions/play-sessions.service.ts',s=>{
 s="import {enqueueNotification} from '@fg/database';\n"+s;const start=s.indexOf(' private async notification('),end=s.indexOf('\n }',start)+3;assert(start>=0&&end>start);const old=s.slice(start,end),anchor=old.indexOf('  const dedup=');assert(anchor>0);const next=old.slice(0,anchor)+"  await enqueueNotification(db,user,type,data,`join:${j.id}:${result??'pending'}`);\n }";return s.slice(0,start)+next+s.slice(end);
});
propose('apps/api/src/modules/chat/chat.service.ts',s=>{
 s="import {enqueueNotification} from '@fg/database';\n"+s;return replace(s,"        for(const target of targets)await db.query('INSERT INTO mentions(id,message_id,mentioned_user_id) VALUES($1,$2,$3)',[randomUUID(),id,target]);","        for(const target of targets){\n            await db.query('INSERT INTO mentions(id,message_id,mentioned_user_id) VALUES($1,$2,$3)',[randomUUID(),id,target]);\n            await enqueueNotification(db,target,'MENTION',{conversationId,messageId:id,mentionerId:actor.userId},'lobby-mention:'+id+':'+target);\n        }");
});
propose('apps/worker/package.json',s=>{const value=JSON.parse(s);value.scripts.start='node dist/index.js';return JSON.stringify(value,null,2)+'\n';});
const policy=fs.readFileSync('packages/database/src/notification-authority.ts','utf8'),original=fs.readFileSync('apps/api/src/modules/notifications/private-notifications.service.ts','utf8').match(/const privateSourceAuthority=(`[^`]*`);/)[1];assert(policy.includes('export const privateNotificationSourceAuthority='+original+';'));
fs.writeFileSync(d+'/integration-adoption-plan2.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Approved T33 general inbox/read/prefs and BullMQ require exact shared registration/source/realtime/transactional producer integration. Private predicate source byte-equivalent; origin/session/socket guards, crypto protocols/ciphers and existing private dispatcher remain intact. Lobby enqueue adds only metadata after existing AEAD mentions; general helper handles approved channel settings without sending PUSH/EMAIL. Worker start script uses existing installed monorepo dependencies; package-lock/external dependencies/cache remain unchanged.',files,newSourcePins:['packages/database/src/notification-authority.ts','packages/database/src/notification-enqueue.ts','apps/api/src/modules/notifications/notifications.service.ts','apps/api/src/modules/notifications/notifications.controller.ts','apps/worker/src/notification-outbox.ts','apps/worker/src/index.ts'].map(path=>({path,sha256:h(fs.readFileSync(path))})),privatePredicateSourceSha256:h(original),privatePredicateByteEquivalent:true,noProtocolCipherChange:true,externalDependenciesUnchanged:true},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({proposedHistoricalFiles:files.length,privatePredicateByteEquivalent:true,applied:false}));
