import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, AUTH_QUERY_KEY, type AuthContextType } from '../src/features/auth/AuthProvider.js';
import { signInWithDiscord } from '../src/features/auth/api.js';
import { registerAuthCleanup, runAuthCleanups } from '../src/features/auth/lifecycle.js';
const identity = { id:'review_user', displayName:'Review User', avatarUrl:null, email:'review@example.com', emailVerified:true, discordId:'review_discord', customStatus:'JUST_CHATTING', createdAt:'2026-10-05T00:00:00.000Z', updatedAt:'2026-10-05T00:00:00.000Z' };
const clients: QueryClient[] = [];
const unregisters: (() => void)[] = [];
afterEach(() => { for(const unregister of unregisters.splice(0)) unregister(); for(const client of clients.splice(0)) client.clear(); vi.restoreAllMocks(); });
function harness() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  clients.push(client);
  client.setQueryData(AUTH_QUERY_KEY, identity);
  client.setQueryData(['private','room','review'], {text:'private message fixture'});
  let context!: AuthContextType;
  function Capture(){ context=useAuth(); return <span>{context.user?.displayName}</span>; }
  render(<QueryClientProvider client={client}><AuthProvider><Capture /></AuthProvider></QueryClientProvider>);
  return {client, auth:()=>context};
}
describe('Codex T09 behavioral regressions', () => {
  it('reports rejected server logout rather than resolving success', async () => {
    vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response('{}',{status:String(input).includes('/sign-out')?503:401}));
    const view=harness();
    await act(async () => { await expect(view.auth().signOut()).rejects.toThrow(); });
  });
  it('removes private query data after successful server logout', async () => {
    vi.spyOn(globalThis,'fetch').mockImplementation(async input => new Response('{}',{status:String(input).includes('/sign-out')?200:401}));
    const view=harness();
    await act(async () => { await view.auth().signOut(); });
    expect(view.client.getQueryData(['private','room','review'])).toBeUndefined();
    expect(view.auth().user).toBeNull();
  });
  it('rejects an unsafe OAuth URL supplied in an API response', async () => {
    for(const url of ['javascript:alert(1)','https://outside.invalid/oauth2/authorize','https://discord.com.outside.invalid/oauth2/authorize']){
      vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({url}),{status:200}));
      await expect(signInWithDiscord('/')).rejects.toThrow();
    }
  });
  it('reports cleanup failure while still attempting other resource disconnects', async () => {
    const otherDisconnect=vi.fn();
    unregisters.push(registerAuthCleanup(async()=>{throw new Error('fixture disconnect failure');}),registerAuthCleanup(otherDisconnect));
    await expect(runAuthCleanups()).rejects.toThrow();
    expect(otherDisconnect).toHaveBeenCalledTimes(1);
  });
});
