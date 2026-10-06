import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDirectMessages } from '../../../apps/web/src/features/direct-messages/useDirectMessages';
const fixture=vi.hoisted(()=>({actor:'review-actor-a'}));
vi.mock('../../../apps/web/src/features/auth/index.js',()=>({useAuth:()=>({user:{id:fixture.actor}})}));
vi.mock('socket.io-client',()=>({io:()=>({on(){return this},disconnect(){},emitWithAck:async()=>({ok:true,conversationId:'review-conversation-a'})})}));
vi.mock('../../../apps/web/src/features/direct-messages/api.js',()=>({
fetchDirectConversations:async()=>({items:[],hasMore:false,nextCursor:null}),
fetchConversationMessages:async()=>({items:[{id:'review-message-a',conversationId:'review-conversation-a',senderUserId:'review-peer-a',content:'PRIVATE ACTOR A',createdAt:'2026-10-06T00:00:00.000Z'}],hasMore:false,nextCursor:null}),
sendDirectMessage:async()=>{throw new Error('unused')},createDirectConversation:async()=>({conversationId:'unused'})
}));
it('Switching conversation never renders previous conversation private messages',async()=>{
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
const frames: Array<{actor:string;active:string|null;bodies:string[]}> = [];
const hook=renderHook(()=>{const state=useDirectMessages();frames.push({actor:fixture.actor,active:state.activeConversationId,bodies:state.messages.map(m=>m.content)});return state;},{wrapper});
try{
act(()=>hook.result.current.setActiveConversationId('review-conversation-a'));
await waitFor(()=>expect(hook.result.current.messages.map(m=>m.content)).toEqual(['PRIVATE ACTOR A']));
act(()=>hook.result.current.setActiveConversationId('review-conversation-b'));
await waitFor(()=>expect(hook.result.current.activeConversationId).toBe('review-conversation-b'));
expect(hook.result.current.activeConversationId).toBe('review-conversation-b');
expect(hook.result.current.messages).toEqual([]);
expect(hook.result.current.totalUnread).toBe(0);
expect(frames.filter(f=>f.active==='review-conversation-b').flatMap(f=>f.bodies)).not.toContain('PRIVATE ACTOR A');
}finally{hook.unmount();client.clear();}
});


