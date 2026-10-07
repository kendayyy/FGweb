import assert from 'node:assert/strict';
import {InvitationSchema,RoomSettingsSchema,RoomMemberSchema} from '@fg/contracts';
import {createInvitationsHarness} from './native-harness.mjs';
const h=await createInvitationsHarness();
try{
 const game=h.games.find(g=>g.title==='Valorant');assert(game);
 const created=await h.call('POST','/rooms','review-a',{name:'Native consent room',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:2});assert.equal(created.status,200);
 const room=created.body;
 const first=await h.call('POST','/invitations','review-a',{targetType:'ROOM',roomId:room.id,receiverId:'review-b'});assert.equal(first.status,201);InvitationSchema.parse(first.body);
 const received=await h.call('PATCH',`/invitations/${first.body.id}/respond`,'review-b',{action:'ACCEPT'});assert.equal(received.status,200);assert.equal(received.body.status,'ACCEPTED');
 assert.equal((await h.pool.query('SELECT user_id FROM active_play_slots WHERE user_id=$1',['review-b'])).rowCount,0);
 const grants=await h.call('PUT',`/rooms/${room.id}/helpers/review-b`,'review-a',{permissions:['MANAGE_MEMBERS']});assert.equal(grants.status,200);RoomMemberSchema.parse(grants.body);
 const next=await h.call('POST','/invitations','review-b',{targetType:'ROOM',roomId:room.id,receiverId:'review-c'});assert.equal(next.status,201);
 assert.equal((await h.call('POST',`/invitations/${next.body.id}/approve`,'review-b',{invitationId:next.body.id,action:'ACCEPT'})).status,409);
 const consent=await h.call('PATCH',`/invitations/${next.body.id}/respond`,'review-c',{action:'ACCEPT'});assert.equal(consent.status,200);assert.equal(consent.body.status,'PENDING');assert(consent.body.recipientAcceptedAt);
 const queue=await h.call('GET','/invitations/me','review-b');assert.equal(queue.status,200);assert(queue.body.some(i=>i.id===next.body.id));
 const accepted=await h.call('POST',`/invitations/${next.body.id}/approve`,'review-b',{invitationId:next.body.id,action:'ACCEPT'});assert.equal(accepted.status,201);assert.equal(accepted.body.status,'ACCEPTED');
 const before=(await h.pool.query('SELECT id FROM notification_outbox')).rowCount;
 assert.deepEqual((await h.call('POST',`/invitations/${next.body.id}/approve`,'review-b',{invitationId:next.body.id,action:'ACCEPT'})).body,accepted.body);
 assert.equal((await h.pool.query('SELECT id FROM notification_outbox')).rowCount,before);
 const settings=await h.call('GET',`/rooms/${room.id}/settings`,'review-c');assert.equal(settings.status,200);RoomSettingsSchema.parse(settings.body);
 assert.equal((await h.call('GET',`/rooms/${room.id}/settings`,'review-d')).status,403);assert.equal((await h.call('GET','/invitations/me')).status,401);
 console.log(JSON.stringify({realCompiledApp:true,realPostgres:true,consentBeforeAdmission:true,helperTargetPermission:true,roomWithoutActiveSlot:true,idempotentApprovalOutbox:true,memberSettingsPrivacy:true,notificationDeliveryVerified:false}));
}finally{await h.cleanup();console.log('Owned native T23 schema and service connections cleaned.');}
