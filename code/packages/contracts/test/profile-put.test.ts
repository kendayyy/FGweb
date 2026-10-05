import { describe, expect, it } from 'vitest';
import * as c from '../src/index.js';

function endpoint(path: string) {
  const match=c.ApiEndpointRegistry.find(item=>String(item.method)==='PUT'&&item.path===path);
  expect(match,`Missing approved PUT ${path}`).toBeDefined();
  expect(match?.auth).toBe('Authenticated');
  expect(match?.requestSchema).toBeDefined();
  return match!;
}
describe('T03-FIX1 profile PUT contracts',()=>{
  it('registers authenticated interest replacement and its response',()=>{
    const route=endpoint('/api/v1/me/interests');
    expect(route.requestSchema!.parse({interestedGames:['Valorant']})).toEqual({interestedGames:['Valorant']});
    expect(route.responseSchema.parse({interestedGames:['Valorant']})).toEqual({interestedGames:['Valorant']});
  });
  it('accepts every locked game and rejects unknown, empty and duplicate interests',()=>{
    const schema=endpoint('/api/v1/me/interests').requestSchema!;
    for(const game of c.ALLOWED_GAMES)expect(schema.safeParse({interestedGames:[game]}).success).toBe(true);
    for(const games of [[],['unknown-game'],['Valorant','Valorant']])expect(schema.safeParse({interestedGames:games}).success).toBe(false);
  });
  it('rejects payload ownership override and unrecognized interest fields',()=>{
    const schema=endpoint('/api/v1/me/interests').requestSchema!;
    for(const field of ['userId','discordId','id','isAdmin'])expect(schema.safeParse({interestedGames:['Valorant'],[field]:'other-user'}).success).toBe(false);
  });
  it('allows game profile replacement without requiring rank or route fields',()=>{
    const route=endpoint('/api/v1/me/game-profiles/:gameId');
    expect(route.requestSchema!.parse({})).toEqual({});
    expect(route.requestSchema!.parse({inGameName:'Player',playHours:2.5})).toEqual({inGameName:'Player',playHours:2.5});
    expect(route.responseSchema.safeParse({gameId:'valorant',gameTitle:'Valorant'}).success).toBe(true);
  });
  it('rejects invalid game profile values and identity/catalog overrides',()=>{
    const schema=endpoint('/api/v1/me/game-profiles/:gameId').requestSchema!;
    for(const payload of [{rank:'x'.repeat(51)},{playHours:-1},{playHours:'20:00'},{gameId:'another'},{gameTitle:'Valorant'},{userId:'other'}])expect(schema.safeParse(payload).success).toBe(false);
  });
});
