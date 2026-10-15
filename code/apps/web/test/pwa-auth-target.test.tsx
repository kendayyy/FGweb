// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {PwaProvider,PwaControls,PushControls} from '../src/pwa/PwaProvider.js';
import {notificationForOpen} from '../src/pwa/target-api.js';
import {NotificationApiError} from '../src/features/notifications/api.js';
import * as browserBridge from '../src/pwa/browser-bridge.js';
const auth=vi.hoisted(()=>({user:null as null|{id:string},isLoading:false,isError:false,error:null as Error|null,isSigningOut:false}));
vi.mock('../src/features/auth/index.js',()=>({useAuth:()=>auth}));
import {registerBeforeAuthSignOut,runBeforeAuthSignOut,registerAuthCleanup,runAuthCleanups} from '../src/features/auth/lifecycle.js';
import {nativeSubscription,pushRequest} from '../src/pwa/browser-bridge.js';
const removers:Array<()=>void>=[];afterEach(()=>{cleanup();removers.splice(0).forEach(remove=>remove());});
describe('T36 authenticated Push revoke phase',()=>{
 it('runs authenticated revoke before session logout, leaving resource cleanup afterwards',async()=>{
  const order:string[]=[];removers.push(registerBeforeAuthSignOut(async()=>{order.push('authenticated-push-delete');}),registerAuthCleanup(()=>{order.push('private-resource-cleanup');}));
  await runBeforeAuthSignOut();order.push('server-session-logout');await runAuthCleanups();
  expect(order).toEqual(['authenticated-push-delete','server-session-logout','private-resource-cleanup']);
 });
 it('attempts every authenticated cleanup and reports failure without pretending revoke succeeded',async()=>{
  const last=vi.fn();removers.push(registerBeforeAuthSignOut(()=>{throw Error('Fixture revoke unavailable');}),registerBeforeAuthSignOut(last));
  await expect(runBeforeAuthSignOut()).rejects.toThrow();expect(last).toHaveBeenCalledOnce();
 });
 it('unregistered authenticated cleanup does not run or change post-logout handlers',async()=>{
  const before=vi.fn(),after=vi.fn(),remove=registerBeforeAuthSignOut(before);remove();removers.push(registerAuthCleanup(after));
  await runBeforeAuthSignOut();expect(before).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();await runAuthCleanups();expect(after).toHaveBeenCalledOnce();
 });
});
describe('T36 independent Push notification target',()=>{
 const id='11111111-1111-4111-8111-111111111111',notice={id,userId:'actor-a',type:'REMINDER_10MIN',title:'Sắp đến giờ chơi',body:'Buổi chơi đã lên lịch sắp bắt đầu.',data:{roomId:'room-a',playSessionId:'play-a',scheduledAt:'2026-10-15T06:00:00.000Z'},isRead:false,createdAt:'2026-10-15T05:50:00.000Z'};
 it('resolves accepted Push when no in-app row is available without changing inbox or preferences',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(notice)));vi.stubGlobal('fetch',fetcher);
  try{expect(await notificationForOpen('actor-a',id,new AbortController().signal,async()=>{throw new NotificationApiError(404);})).toEqual(notice);expect(fetcher).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledWith('/api/v1/push/notifications/'+id,expect.objectContaining({method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'}));}finally{vi.unstubAllGlobals();}
 });
 it('does not bypass forbidden, expired or failed in-app authority checks',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);try{for(const status of [401,403,500])await expect(notificationForOpen('actor-a',id,new AbortController().signal,async()=>{throw new NotificationApiError(status);})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
 });
 it('rejects mismatched actor/id in external API response',async()=>{
  for(const changed of [{userId:'actor-b'},{id:'22222222-2222-4222-8222-222222222222'}]){vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...notice,...changed}))));try{await expect(notificationForOpen('actor-a',id,new AbortController().signal,async()=>{throw new NotificationApiError(404);})).rejects.toThrow();}finally{vi.unstubAllGlobals();}}
 });
});
describe('T36 browser Push transport boundary',()=>{
 it('projects native subscription JSON without expirationTime or browser extras',async()=>{
  const unsubscribe=vi.fn(async()=>true),native={endpoint:'https://fcm.googleapis.com/wp/fixture',toJSON:()=>({endpoint:'https://fcm.googleapis.com/wp/fixture',expirationTime:null,keys:{p256dh:'public-fixture',auth:'fixture'}}),unsubscribe};
  const projected=nativeSubscription(native as unknown as PushSubscription);
  expect(projected.toJSON()).toEqual({endpoint:native.endpoint,keys:{p256dh:'public-fixture',auth:'fixture'}});await expect(projected.unsubscribe()).resolves.toBe(true);
 });
 it('uses current same-origin session and prevents cached/redirected transport',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({available:false}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
  try{expect(await pushRequest('config',new AbortController().signal)).toEqual({available:false});expect(fetcher).toHaveBeenCalledWith('/api/v1/push/config',expect.objectContaining({credentials:'same-origin',cache:'no-store',redirect:'error',method:'GET'}));}finally{vi.unstubAllGlobals();}
 });
 it('rejects failed registration/unregistration without exposing server response content',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('Fixture private server detail',{status:403})));try{await expect(pushRequest('subscriptions',new AbortController().signal,'DELETE',{endpoint:'fixture'})).rejects.toThrow('Push request unavailable');}finally{vi.unstubAllGlobals();}
 });
});
describe('T36 installation/offline interface DOM boundary',()=>{
 it('reports actual FG transport failure even while browser navigator still says online',()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(true);auth.isError=true;auth.error=new TypeError('Failed to fetch');vi.stubGlobal('matchMedia',()=>({matches:false}));
  try{render(<MemoryRouter><PwaProvider><PwaControls/></PwaProvider></MemoryRouter>);expect(screen.getByText(/Mất kết nối/)).toBeTruthy();}finally{cleanup();online.mockRestore();auth.isError=false;auth.error=null;vi.unstubAllGlobals();}
 });
 it('preserves an existing native subscription while initial authentication is unresolved',async()=>{
  const unsubscribe=vi.fn(async()=>true),subscription=vi.fn(async()=>({endpoint:'fixture',toJSON:()=>({endpoint:'fixture',keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe}));
  const spy=vi.spyOn(browserBridge,'createBrowserPushBridge').mockReturnValue({secure:true,supported:true,requiresInstall:false,permission:()=> 'granted',userGesture:()=>false,requestPermission:vi.fn(),subscription,subscribe:vi.fn(),config:vi.fn(),register:vi.fn(),unregister:vi.fn()});
  auth.isLoading=true;vi.stubEnv('PROD',true);vi.stubGlobal('matchMedia',()=>({matches:false}));
  try{render(<MemoryRouter><PwaProvider><PushControls/></PwaProvider></MemoryRouter>);await new Promise(resolve=>setTimeout(resolve,0));expect(subscription).not.toHaveBeenCalled();expect(unsubscribe).not.toHaveBeenCalled();}finally{cleanup();auth.isLoading=false;spy.mockRestore();vi.unstubAllEnvs();vi.unstubAllGlobals();}
 });
 it('provides truthful iPhone and Android help without a synthetic install button',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));try{render(<MemoryRouter><PwaProvider><PwaControls/><PushControls/></PwaProvider></MemoryRouter>);expect(screen.getByText('Cài FG trên thiết bị')).toBeTruthy();expect(screen.getByText(/iOS 16.4/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Cài FG'})).toBeNull();expect(screen.getByText(/Đăng nhập để bật Push/)).toBeTruthy();}finally{vi.unstubAllGlobals();}
 });
 it('reports offline and recovery without claiming unsent content is delivered',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));try{render(<MemoryRouter><PwaProvider><PwaControls/></PwaProvider></MemoryRouter>);fireEvent(window,new Event('offline'));expect(screen.getByRole('status').textContent).toContain('Mất kết nối');fireEvent(window,new Event('online'));expect(screen.queryByText(/Mất kết nối/)).toBeNull();}finally{vi.unstubAllGlobals();}
 });
});
