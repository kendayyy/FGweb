import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDirectMessages } from '../../../apps/web/src/features/direct-messages/useDirectMessages';
const fixture = vi.hoisted(() => ({ cursors: [] as string[] }));
vi.mock('../../../apps/web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'review-actor' } }) }));
vi.mock('socket.io-client', () => ({ io: () => ({ on() { return this; }, disconnect() {}, emitWithAck: async () => ({ ok: true, conversationId: 'review-a' }) }) }));
vi.mock('../../../apps/web/src/features/direct-messages/api.js', () => ({
  fetchDirectConversations: async () => ({ items: [], hasMore: false, nextCursor: null }),
  fetchConversationMessages: async (conv: string, query?: { cursor?: string }) => {
    if (!query?.cursor) return { items: [{ id: 'new', conversationId: conv, content: 'NEW BODY', createdAt: '2026-10-06T00:01:00Z' }], hasMore: true, nextCursor: 'older-cursor' };
    fixture.cursors.push(query.cursor);
    if (fixture.cursors.length === 1) throw new Error('Older history failed');
    return { items: [{ id: 'old', conversationId: conv, content: 'OLD BODY', createdAt: '2026-10-06T00:00:00Z' }], hasMore: false, nextCursor: null };
  },
  createDirectConversation: async () => ({ conversationId: 'unused' }),
  sendDirectMessage: async () => { throw new Error('unused'); },
}));
it('Failed older-history request retains history/cursor and retry merges older messages in time order', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDirectMessages(), { wrapper });
  try {
    act(() => hook.result.current.setActiveConversationId('review-a'));
    await waitFor(() => expect(hook.result.current.messages.map(m => m.content)).toEqual(['NEW BODY']));
    await act(async () => { await hook.result.current.loadOlderMessages(); });
    expect(hook.result.current.olderMessagesError?.message).toBe('Older history failed');
    expect(hook.result.current.messages.map(m => m.content)).toEqual(['NEW BODY']);
    expect(hook.result.current.hasOlderMessages).toBe(true);
    expect(hook.result.current.isLoadingOlderMessages).toBe(false);
    await act(async () => { await hook.result.current.loadOlderMessages(); });
    expect(fixture.cursors).toEqual(['older-cursor', 'older-cursor']);
    expect(hook.result.current.olderMessagesError).toBeNull();
    expect(hook.result.current.messages.map(m => m.content)).toEqual(['OLD BODY', 'NEW BODY']);
    expect(hook.result.current.hasOlderMessages).toBe(false);
  } finally { hook.unmount(); client.clear(); }
});
