import React from 'react';
import {render,screen,fireEvent,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {AuthProvider,AUTH_QUERY_KEY} from '../src/features/auth/AuthProvider.js';
import App from '../src/App.js';
import {ThemeProvider} from '../src/features/theme/ThemeProvider.js';
import {ThemeSwitcher} from '../src/features/theme/ThemeSwitcher.js';
import {RichComposer} from '../src/features/chat/RichComposer.js';
let dark=false;const listeners=new Set<()=>void>();
beforeEach(()=>{dark=false;listeners.clear();localStorage.clear();vi.stubGlobal('matchMedia',()=>({get matches(){return dark;},addEventListener:(_name:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_name:string,fn:()=>void)=>listeners.delete(fn)}));});
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
function show(){return render(<ThemeProvider><ThemeSwitcher/></ThemeProvider>);}
function select(name:string){fireEvent.click(screen.getByRole('button',{name:/Chế độ màu:/}));fireEvent.click(screen.getByRole('menuitemradio',{name}));}
function device(value:boolean){act(()=>{dark=value;listeners.forEach(fn=>fn());});}
it('keeps the animated icon mounted while effective System color changes, with one menu trigger',()=>{
 show();
 const trigger=screen.getByRole('button',{name:'Chế độ màu: Hệ thống'});
 const icon=trigger.querySelector('svg');
 expect(icon).not.toBeNull();
 device(true);
 expect(trigger.querySelector('svg')).toBe(icon);
 expect(trigger).toHaveAccessibleName('Chế độ màu: Hệ thống');
 select('Sáng');
 expect(trigger.querySelector('svg')).toBe(icon);
 device(false);
 expect(trigger.querySelector('svg')).toBe(icon);
 expect(trigger.querySelectorAll('button')).toHaveLength(0);
 expect(trigger).not.toHaveAttribute('aria-pressed');
});
it('offers exactly one global theme control on the real login route',()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});client.setQueryData(AUTH_QUERY_KEY,null);
 render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/login']}><App/></MemoryRouter></AuthProvider></QueryClientProvider>);
 expect(screen.getAllByRole('button',{name:'Chế độ màu: Hệ thống'})).toHaveLength(1);
 client.clear();
});
it('applies the saved theme synchronously from the head before application code',()=>{
 const html=fs.readFileSync(path.resolve('apps/web/index.html'),'utf8');
 const head=html.match(/<head>([\s\S]*?)<\/head>/)?.[1]??'';
 const script=head.match(/<script id="fg-theme-init">([\s\S]*?)<\/script>/)?.[1];
 expect(script).toBeTruthy();
 localStorage.setItem('fg.theme','light');
 Function(script!)();
 expect(document.documentElement.dataset.theme).toBe('light');
 expect(document.documentElement.style.colorScheme).toBe('light');
});
it('defaults to system and follows device changes while retaining the System label',()=>{show();expect(document.documentElement.dataset.theme).toBe('light');device(true);expect(document.documentElement.dataset.theme).toBe('dark');expect(screen.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();});
it.each(['light','dark'] as const)('loads saved %s and ignores device changes',value=>{localStorage.setItem('fg.theme',value);show();device(true);device(false);expect(document.documentElement.dataset.theme).toBe(value);});
it('saves selection, returns focus and reflects selected menu item',()=>{show();const trigger=screen.getByRole('button',{name:/Chế độ màu:/});select('Tối');expect(localStorage.getItem('fg.theme')).toBe('dark');expect(trigger).toHaveFocus();fireEvent.click(trigger);expect(screen.getByRole('menuitemradio',{name:'Tối'})).toHaveAttribute('aria-checked','true');});
it('resumes live system changes after an explicit fixed choice',()=>{show();select('Sáng');device(true);expect(document.documentElement.dataset.theme).toBe('light');select('Hệ thống');expect(document.documentElement.dataset.theme).toBe('dark');device(false);expect(document.documentElement.dataset.theme).toBe('light');});
it('rejects unknown persisted values',()=>{localStorage.setItem('fg.theme','<script>');dark=true;show();expect(screen.getByRole('button',{name:'Chế độ màu: Hệ thống'})).toBeVisible();expect(document.documentElement.dataset.theme).toBe('dark');});
it('keeps working when reading and writing storage are blocked',()=>{vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});show();select('Tối');expect(document.documentElement.dataset.theme).toBe('dark');expect(screen.getByRole('button',{name:'Chế độ màu: Tối'})).toBeVisible();});
it('syncs cross-tab changes, key removal, invalid values and clear',()=>{show();for(const [value,theme] of [['dark','dark'],['light','light'],[null,'light'],['invalid','light']] as const){act(()=>window.dispatchEvent(new StorageEvent('storage',{key:'fg.theme',newValue:value,storageArea:localStorage})));expect(document.documentElement.dataset.theme).toBe(theme);}select('Tối');act(()=>window.dispatchEvent(new StorageEvent('storage',{key:null,newValue:null,storageArea:localStorage})));expect(document.documentElement.dataset.theme).toBe('light');});
it('ignores unrelated and session storage events',()=>{show();act(()=>{window.dispatchEvent(new StorageEvent('storage',{key:'unrelated',newValue:'dark'}));window.dispatchEvent(new StorageEvent('storage',{key:'fg.theme',newValue:'dark',storageArea:sessionStorage}));});expect(document.documentElement.dataset.theme).toBe('light');});
it('supports arrows, Home/End, Escape and outside pointer dismissal',()=>{show();const trigger=screen.getByRole('button',{name:/Chế độ màu:/});fireEvent.keyDown(trigger,{key:'ArrowDown'});expect(screen.getByRole('menuitemradio',{name:'Hệ thống'})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});expect(screen.getByRole('menuitemradio',{name:'Sáng'})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'End'});expect(screen.getByRole('menuitemradio',{name:'Hệ thống'})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'Home'});expect(screen.getByRole('menuitemradio',{name:'Sáng'})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('menu')).toBeNull();expect(trigger).toHaveFocus();fireEvent.click(trigger);fireEvent.pointerDown(document.body);expect(screen.queryByRole('menu')).toBeNull();});
it('unsubscribes media and storage listeners on unmount',()=>{const view=show();expect(listeners.size).toBe(1);view.unmount();expect(listeners.size).toBe(0);});
it('preserves the genuine composer node, unsent draft and auth cache without fetching',()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const user={id:'theme-owner',displayName:'Theme Owner',email:'theme@fixture.invalid',emailVerified:true,discordId:null,customStatus:'JUST_CHATTING',onboardingComplete:true,interestedGames:['Valorant'],createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'};client.setQueryData(AUTH_QUERY_KEY,user);const fetch=vi.spyOn(globalThis,'fetch');render(<QueryClientProvider client={client}><AuthProvider><ThemeProvider><ThemeSwitcher/><RichComposer conversationId="theme-lobby" candidates={[]} reply={null} onCancelReply={()=>{}} onSend={async()=>{}}/></ThemeProvider></AuthProvider></QueryClientProvider>);const input=screen.getByRole('textbox',{name:'Tin nhắn Lobby'});fireEvent.change(input,{target:{value:'Chưa gửi — tìm bạn chơi'}});select('Tối');select('Sáng');select('Hệ thống');expect(screen.getByRole('textbox',{name:'Tin nhắn Lobby'})).toBe(input);expect(input).toHaveValue('Chưa gửi — tìm bạn chơi');expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(user);expect(fetch).not.toHaveBeenCalled();client.clear();});
