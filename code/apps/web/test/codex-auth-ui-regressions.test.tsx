import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, AUTH_QUERY_KEY } from '../src/features/auth/AuthProvider.js';
import { HeaderAuthWidget } from '../src/features/auth/HeaderAuthWidget.js';
import { ProtectedRoute } from '../src/features/auth/ProtectedRoute.js';
const identity={id:'ui_review_user',displayName:'Review User',avatarUrl:null,email:'ui-review@example.com',emailVerified:true,discordId:'ui_review_discord',customStatus:'JUST_CHATTING',createdAt:'2026-10-05T00:00:00.000Z',updatedAt:'2026-10-05T00:00:00.000Z'};
const clients: QueryClient[]=[];
afterEach(()=>{for(const client of clients.splice(0))client.clear();vi.restoreAllMocks();});
function show(children:React.ReactNode, session?:unknown){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
  if(session!==undefined)client.setQueryData(AUTH_QUERY_KEY,session);
  render(<QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>);
}
describe('Codex T09 visible failure and recovery',()=>{
  it('keeps logout failure visible even after local identity is cleared, with a retry action',async()=>{
    const fetchSpy=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response('{}',{status:String(input).includes('/sign-out')?503:401}));
    show(<HeaderAuthWidget/>,identity);
    fireEvent.click(screen.getByRole('button',{name:'Đăng xuất'}));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:/Thử lại/i}));
    await waitFor(()=>expect(fetchSpy.mock.calls.filter(([input])=>String(input).includes('/sign-out')).length).toBe(2));
  });
  it('shows failed header sign-in and retries the API rather than only logging to console',async()=>{
    const fetchSpy=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response('{}',{status:String(input).includes('/sign-in/social')?503:401}));
    show(<HeaderAuthWidget/>,null);
    fireEvent.click(screen.getByRole('button',{name:/Đăng nhập bằng Discord/i}));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:/Thử lại/i}));
    await waitFor(()=>expect(fetchSpy.mock.calls.filter(([input])=>String(input).includes('/sign-in/social')).length).toBe(2));
  });
  it('retries failed identity loading and renders protected children only after actual success',async()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new TypeError('fixture network failure')).mockResolvedValueOnce(new Response(JSON.stringify(identity),{status:200}));
    show(<ProtectedRoute><span data-testid="review-private">Private fixture</span></ProtectedRoute>);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByTestId('review-private')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Thử lại/i}));
    expect(await screen.findByTestId('review-private')).toBeVisible();
  });
});
