import {describe,it,expect} from 'vitest';
import * as contracts from '../src/index.js';
const route=(path:string)=>contracts.ApiEndpointRegistry.find(r=>r.method==='POST'&&r.path===path);

describe('T29 server-owned screen publishing and moderation transport',()=>{
  it('claims a screen slot as a current call participant with no client authority',()=>{
    const endpoint=route('/api/v1/calls/:id/screen-share/claim');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('CallParticipant');expect(endpoint?.responseSchema).toBe(contracts.CallJoinSchema);expect(endpoint?.requestSchema?.safeParse({}).success).toBe(true);
    for(const body of [{userId:'other'},{callId:'other'},{ordinal:4},{maxPublishers:99},{canPublish:true},{token:'foreign'}])expect(endpoint?.requestSchema?.safeParse(body).success).toBe(false);
  });
  it('releases only the actor slot and returns strict success',()=>{
    const endpoint=route('/api/v1/calls/:id/screen-share/release');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('CallParticipant');expect(endpoint?.requestSchema?.safeParse({}).success).toBe(true);expect(endpoint?.requestSchema?.safeParse({userId:'other'}).success).toBe(false);expect(endpoint?.responseSchema?.safeParse({success:true}).success).toBe(true);expect(endpoint?.responseSchema?.safeParse({success:false}).success).toBe(false);
  });
  it('moderation requires server-checked MANAGE_CALLS and an exact action/target',()=>{
    const endpoint=route('/api/v1/calls/:id/moderation');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('RoomHelperOrOwner');expect(endpoint?.requiredPermission).toBe('MANAGE_CALLS');
    for(const action of ['MUTE_MIC','ALLOW_MIC','STOP_SCREEN_SHARE','ALLOW_SCREEN_SHARE','KICK'])expect(endpoint?.requestSchema?.safeParse({action,targetUserId:'member'}).success).toBe(true);
    for(const body of [{action:'UNBAN',targetUserId:'member'},{action:'MUTE_MIC'},{action:'KICK',targetUserId:''},{action:'ALLOW_MIC',targetUserId:'member',actorId:'owner'},{action:'STOP_SCREEN_SHARE',targetUserId:'member',role:'OWNER'}])expect(endpoint?.requestSchema?.safeParse(body).success).toBe(false);
  });
  it('rejects privacy or permission data in successful control responses',()=>{
    const endpoint=route('/api/v1/calls/:id/moderation');expect(endpoint).toBeDefined();expect(endpoint?.responseSchema?.safeParse({success:true}).success).toBe(true);expect(endpoint?.responseSchema?.safeParse({success:true,token:'secret'}).success).toBe(false);expect(endpoint?.responseSchema?.safeParse({success:true,email:'private@example.invalid'}).success).toBe(false);
  });
  it('keeps legacy aliases on the same strict server-authority request codecs',()=>{
    const publish=route('/api/v1/calls/:id/publish-token'),kick=route('/api/v1/calls/:id/participants/:userId/kick'),mute=contracts.ApiEndpointRegistry.find(r=>r.method==='PATCH'&&r.path==='/api/v1/calls/:id/participants/:userId/mute');
    expect(publish?.requestSchema?.safeParse({callId:'call'}).success).toBe(true);expect(publish?.requestSchema?.safeParse({callId:'call',ordinal:4}).success).toBe(false);
    expect(kick?.requestSchema?.safeParse({targetUserId:'member'}).success).toBe(true);expect(kick?.requestSchema?.safeParse({targetUserId:'member',role:'OWNER'}).success).toBe(false);
    expect(mute?.requestSchema?.safeParse({muted:true}).success).toBe(true);expect(mute?.requestSchema?.safeParse({muted:true,actorId:'owner'}).success).toBe(false);
  });
});
