import {describe,it,expect} from 'vitest';import {z} from 'zod';import * as contracts from '../src/index.js';
const proposed=contracts as typeof contracts&{NotificationPreferencesPatchSchema?:z.ZodType;NotificationUnreadCountSchema?:z.ZodType};
const parse=(input:unknown)=>{expect(proposed.NotificationPreferencesPatchSchema).toBeDefined();return proposed.NotificationPreferencesPatchSchema!.safeParse(input);};
describe('T33 safe partial notification preferences',()=>{
 it('accepts a single event/channel without inventing other saved settings',()=>{expect(parse({FRIEND_INVITE:{inApp:false}})).toMatchObject({success:true,data:{FRIEND_INVITE:{inApp:false}}});});
 it('accepts the existing full preference object',()=>{const full=contracts.NotificationPreferencesSchema.parse(Object.fromEntries(contracts.NotificationTypeSchema.options.map(type=>[type,{}])));expect(parse(full).success).toBe(true);});
 it.each(['DM','MENTION','JOIN_REQUEST','JOIN_REQUEST_RESULT'])('rejects forbidden email for %s',type=>expect(parse({[type]:{email:true}}).success).toBe(false));
 it.each(['FRIEND_INVITE','ROOM_INVITE','TEAM_INVITE','REMINDER_10MIN'])('accepts approved email preference for %s',type=>expect(parse({[type]:{email:true}}).success).toBe(true));
 it.each([{}, {DM:{}}, {userId:'another-user'}, {FRIEND_INVITE:{actorId:'another-user'}}, {LOBBY:{push:true}}, {DM:{push:'yes'}}])('rejects empty or injected/non-boolean patch %s',body=>expect(parse(body).success).toBe(false));
 it('unread counts are nonnegative integers with no user authority field',()=>{const schema=proposed.NotificationUnreadCountSchema;expect(schema).toBeDefined();expect(schema!.safeParse({unreadCount:0}).success).toBe(true);for(const body of [{unreadCount:-1},{unreadCount:1.5},{unreadCount:'1'},{unreadCount:0,userId:'other'}])expect(schema!.safeParse(body).success).toBe(false);});
 it.each([
  ['DM',{conversationId:'conversation',messageId:'message',senderId:'sender'}],
  ['MENTION',{conversationId:'conversation',messageId:'message',mentionerId:'sender'}],
  ['FRIEND_INVITE',{requestId:'request',senderId:'sender'}],
  ['ROOM_INVITE',{invitationId:'invitation',roomId:'room',senderId:'sender'}],
  ['TEAM_INVITE',{invitationId:'invitation',roomId:'room',playSessionId:'play',senderId:'sender'}],
  ['JOIN_REQUEST',{requestId:'request',recruitmentId:'recruitment',applicantId:'sender'}],
  ['JOIN_REQUEST_RESULT',{requestId:'request',recruitmentId:'recruitment',result:'ACCEPTED'}],
  ['REMINDER_10MIN',{playSessionId:'play',roomId:'room',scheduledAt:'2026-10-14T00:00:00.000Z'}],
 ])('preserves the full source identity for %s inbox DTO',(type,data)=>{const result=contracts.NotificationSchema.safeParse({id:'notice',userId:'recipient',type,title:'Thông báo',body:'Thông báo mới.',data,isRead:false,createdAt:'2026-10-13T00:00:00.000Z'});expect(result.success).toBe(true);if(result.success)expect(result.data.data).toEqual(data);});
});
