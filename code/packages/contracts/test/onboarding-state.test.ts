import {describe,it,expect} from 'vitest';
import {MeDTOSchema} from '../src/auth.js';
const actor={id:'actor',displayName:'Gamer',avatarUrl:null,email:'gamer@example.com',emailVerified:true,discordId:'discord-id',customStatus:'JUST_CHATTING',createdAt:'2026-10-05T00:00:00.000Z',updatedAt:'2026-10-05T00:00:00.000Z'};
describe('Authenticated onboarding state contract',()=>{
 it('preserves explicit incomplete state and empty persisted interests',()=>{
  const parsed=MeDTOSchema.parse({...actor,onboardingComplete:false,interestedGames:[]});
  expect(parsed).toHaveProperty('onboardingComplete',false);
  expect(parsed).toHaveProperty('interestedGames',[]);
 });
 it('preserves completed state and rejects unknown game interests',()=>{
  const parsed=MeDTOSchema.parse({...actor,onboardingComplete:true,interestedGames:['Valorant','Roblox']});
  expect(parsed).toHaveProperty('onboardingComplete',true);
  expect(parsed).toHaveProperty('interestedGames',['Valorant','Roblox']);
  expect(MeDTOSchema.safeParse({...actor,interestedGames:['unknown-game']}).success).toBe(false);
 });
 it('rejects malformed completion and duplicate persisted game choices',()=>{
  expect(MeDTOSchema.safeParse({...actor,onboardingComplete:'true'}).success).toBe(false);
  expect(MeDTOSchema.safeParse({...actor,interestedGames:['Valorant','Valorant']}).success).toBe(false);
 });
 it('keeps legacy consumers compatible without inventing completion',()=>{
  const parsed=MeDTOSchema.parse(actor);
  expect(parsed).not.toHaveProperty('onboardingComplete');
  expect(parsed).not.toHaveProperty('interestedGames');
 });
});
