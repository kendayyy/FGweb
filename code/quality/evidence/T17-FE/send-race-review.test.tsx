import React from 'react';
import {it,expect,vi} from 'vitest';
import {renderHook,act,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useDirectMessages} from '../../../apps/web/src/features/direct-messages/useDirectMessages';
const fixture=vi.hoisted(()=>({pending:[] as Array<{conv:string;resolve:(value:unknown)=>void}>}));
vi.mock('../../../apps/web/src/features/auth/index.js',()=>({useAuth:()=>({user:{id:'review-actor'}})}));
vi.mock('socket.io-client',()=>({io:()=>({on(){return this},disconnect(){},emitWithAck:async()=>({ok:true,conversationId:'review-a'})})}));
vi.mock('../../../apps/web/src/features/direct-messages/api.js',()=>({fetchDirectConversations:async()=>({items:[],hasMore:false,nextCursor:null}),fetchConversationMessages:async()=>({items:[],hasMore:false,nextCursor:null}),createDirectConversation:async()=>({conversationId:'unused'}),sendDirectMessage:(conv:string)=>new Promise(resolve=>fixture.pending.push({conv,resolve}))}));
it('A late completed send must not mark a new conversation send finished',async()=>{
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
const hook=renderHook(()=>useDirectMessages(),{wrapper});let first:Promise<unknown>|undefined,second:Promise<unknown>|undefined;
try{
act(()=>hook.result.current.setActiveConversationId('review-a'));await waitFor(()=>expect(hook.result.current.activeConversationId).toBe('review-a'));
act(()=>{first=hook.result.current.sendMessage({content:'first',clientMessageId:'review-first'})});expect(hook.result.current.isSending).toBe(true);
act(()=>hook.result.current.setActiveConversationId('review-b'));await waitFor(()=>expect(hook.result.current.activeConversationId).toBe('review-b'));
act(()=>{second=hook.result.current.sendMessage({content:'second',clientMessageId:'review-second'})});expect(hook.result.current.isSending).toBe(true);
await act(async()=>{fixture.pending[0].resolve({id:'review-first',conversationId:'review-a',content:'first',createdAt:'2026-10-06T00:00:00.000Z'});await first});
expect(hook.result.current.isSending).toBe(true);expect(hook.result.current.messages.some(m=>m.conversationId==='review-a')).toBe(false);
}finally{for(const entry of fixture.pending)entry.resolve({id:'cleanup',conversationId:entry.conv,content:'cleanup',createdAt:'2026-10-06T00:00:00.000Z'});await Promise.allSettled([first,second]);hook.unmount();client.clear();}
});
