import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider} from '../../../apps/web/src/features/auth/AuthProvider.js';
import {ProfileHeader} from '../../../apps/web/src/features/profiles/ProfileHeader.js';
import {ProfilePage} from '../../../apps/web/src/features/profiles/ProfilePage.js';
import {OnboardingPage} from '../../../apps/web/src/features/onboarding/OnboardingPage.js';
import {ProfileEditor} from '../../../apps/web/src/features/profiles/ProfileEditor.js';
import {OnboardingForm} from '../../../apps/web/src/features/onboarding/OnboardingForm.js';
import {App} from '../../../apps/web/src/App.js';
import type {ProfileDTO} from '@fg/contracts';
const timestamp='2026-10-05T00:00:00.000Z';
const actor={id:'review-user',displayName:'Review Gamer',email:'private-sentinel@example.com',discordId:'private-discord-sentinel',emailVerified:true,customStatus:'PLAYING',createdAt:timestamp,updatedAt:timestamp,onboardingComplete:true,interestedGames:['Valorant']};
const profile:ProfileDTO={id:actor.id,displayName:actor.displayName,bio:'Keep stored biography',customStatus:'PLAYING',createdAt:timestamp,gameProfiles:[{gameId:'game-val',gameTitle:'Valorant',inGameName:'KeepTag',rank:'KeepRank',playHours:42}]};
const clients:QueryClient[]=[];
afterEach(()=>{cleanup();for(const client of clients)client.clear();clients.length=0;vi.restoreAllMocks();});
function mountPage(path:string,page:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);return render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={[path]}><Routes><Route path='/users/:id' element={page}/><Route path='/onboarding' element={page}/></Routes></MemoryRouter></AuthProvider></QueryClientProvider>);}
describe('Codex independent T11 behavior review',()=>{
 it('the actual Lobby entry reports missing server onboarding state instead of silently admitting it',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({...actor,onboardingComplete:undefined}),{status:200}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/']}><App/></MemoryRouter></AuthProvider></QueryClientProvider>);
  await waitFor(()=>expect(client.getQueryData(['auth','me'])).toMatchObject({id:actor.id}));
  await waitFor(()=>expect(screen.getByTestId('onboarding-error-state')).toBeInTheDocument());
 });
 it('switching accounts during profile PATCH prevents a subsequent interests PUT for the new account',async()=>{
  let resolvePatch!: (response:Response)=>void;
  const writes:string[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
   if(options?.method==='PATCH')return new Promise<Response>(resolve=>{resolvePatch=resolve;});
   if(options?.method==='PUT'){writes.push(String(url));return new Response(JSON.stringify({interestedGames:['Valorant']}),{status:200});}
   return new Response(JSON.stringify(actor),{status:200});
  });
  mountPage('/users/review-user',<ProfileEditor initialDisplayName='Review Gamer' initialInterestedGames={['Valorant']}/>);
  await waitFor(()=>expect(clients[0].getQueryData(['auth','me'])).toMatchObject({id:actor.id}));
  fireEvent.click(screen.getByRole('button',{name:'Lưu'}));
  await waitFor(()=>expect(resolvePatch).toBeTypeOf('function'));
  await act(async()=>{clients[0].setQueryData(['auth','me'],{...actor,id:'another-actor'});});
  await act(async()=>{resolvePatch(new Response(JSON.stringify({...profile,email:actor.email,discordId:actor.discordId,emailVerified:true}),{status:200}));await new Promise(resolve=>setTimeout(resolve,30));});
  expect(writes).toEqual([]);
 });
 it('a pending game save cannot report success after switching to another account',async()=>{
  let resolveSave!: (response:Response)=>void;
  const saved=vi.fn();
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
   if(options?.method==='PUT')return new Promise<Response>(resolve=>{resolveSave=resolve;});
   return new Response(JSON.stringify(actor),{status:200});
  });
  mountPage('/users/review-user',<ProfileEditor gameId='game-val' gameTitle='Valorant' onSaved={saved}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Lưu'})).toBeEnabled());
  await waitFor(()=>expect(clients[0].getQueryData(['auth','me'])).toMatchObject({id:actor.id}));
  fireEvent.change(screen.getByLabelText(/tên trong game/i),{target:{value:'LateSave'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu'}));
  await waitFor(()=>expect(resolveSave).toBeTypeOf('function'));
  await act(async()=>{clients[0].setQueryData(['auth','me'],{...actor,id:'another-actor'});});
  await act(async()=>{resolveSave(new Response(JSON.stringify({...profile.gameProfiles[0],inGameName:'LateSave'}),{status:200}));await new Promise(resolve=>setTimeout(resolve,30));});
  expect(saved).not.toHaveBeenCalled();
 });
 it('a complete server response for different interests cannot acknowledge onboarding success',async()=>{
  let readCount=0;
  const success=vi.fn();
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
   if(options?.method==='POST')return new Response(JSON.stringify({...profile,email:actor.email,discordId:actor.discordId,emailVerified:true}),{status:200});
   readCount++;
   return new Response(JSON.stringify({...actor,onboardingComplete:readCount>1,interestedGames:readCount>1?['Dota 2']:[]}),{status:200});
  });
  mountPage('/onboarding',<OnboardingForm onSuccess={success}/>);
  await waitFor(()=>expect(clients[0].getQueryData(['auth','me'])).toMatchObject({id:actor.id}));
  fireEvent.change(screen.getByLabelText(/biệt danh/i),{target:{value:'Review Gamer'}});
  fireEvent.click(screen.getByRole('checkbox',{name:'Valorant'}));
  fireEvent.submit(screen.getByTestId('onboarding-form').querySelector('form')!);
  await waitFor(()=>expect(readCount).toBeGreaterThan(1));
  await waitFor(()=>expect(screen.getByTestId('onboarding-error-alert')).toBeInTheDocument());
  expect(success).not.toHaveBeenCalled();
 });
 it('labels actual shared PLAYING status as self-selected playing',()=>{render(<ProfileHeader profile={profile}/>);expect(screen.getByTestId('profile-custom-status')).toHaveTextContent('Đang chơi');expect(screen.getByTestId('profile-custom-status')).not.toHaveTextContent('Chỉ trò chuyện');});
 it('missing stored interests cannot be silently considered a completed onboarding',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response(JSON.stringify(String(url).includes('/api/v1/me')?{...actor,interestedGames:undefined}:[]),{status:200}));
  mountPage('/onboarding',<OnboardingPage/>);
  await waitFor(()=>expect(screen.getByTestId('onboarding-error-state')).toBeInTheDocument());
 });
 it('opening existing game editor restores all saved fields instead of clearing replacement data',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>{
   const route=String(url);const data=route.includes('/api/v1/me')?actor:route.includes('/api/v1/games')?[{id:'game-val',title:'Valorant',lobbyRoomId:'lobby-val'}]:profile;
   return new Response(JSON.stringify(data),{status:200});
  });
  mountPage('/users/review-user',<ProfilePage/>);
  await waitFor(()=>expect(screen.getByText('KeepTag')).toBeInTheDocument());
  const editButtons=screen.getAllByRole('button',{name:/chỉnh sửa/i});
  fireEvent.click(editButtons[editButtons.length-1]);
  await waitFor(()=>expect(screen.getByLabelText(/tên trong game/i)).toHaveValue('KeepTag'));
  expect(screen.getByLabelText(/rank/i)).toHaveValue('KeepRank');
  expect(screen.getByLabelText(/giờ chơi/i)).toHaveValue(42);
 });
});
