import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDirectMessages } from '../../../apps/web/src/features/direct-messages/useDirectMessages';
const fixture = vi.hoisted(() => ({ cursors: [] as Array<string | undefined> }));
vi.mock('../../../apps/web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'review-actor' } }) }));
vi.mock('socket.io-client', () => ({ io: () => ({ on() { return this; }, disconnect() {}, emitWithAck: async () => ({ ok: true, conversationId: 'review-old' }) }) }));
vi.mock('../../../apps/web/src/features/direct-messages/api.js', () => ({
  fetchDirectConversations: async (query?: { cursor?: string }) => {
    fixture.cursors.push(query?.cursor);
    return query?.cursor ? { items: [{ conversationId: 'review-old', peer: { id: 'review-peer-old', displayName: 'Older peer' } }], hasMore: false, nextCursor: null }
      : { items: [{ conversationId: 'review-new', peer: { id: 'review-peer-new', displayName: 'Newer peer' } }], hasMore: true, nextCursor: 'dm-page-two' };
  },
  fetchConversationMessages: async () => ({ items: [], hasMore: false, nextCursor: null }),
  createDirectConversation: async () => ({ conversationId: 'review-old' }),
  sendDirectMessage: async () => { throw new Error('unused'); },
}));
it('Opening an existing DM outside the first list page resolves its real peer', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDirectMessages(), { wrapper });
  try {
    await waitFor(() => expect(hook.result.current.conversations.length).toBeGreaterThan(0));
    await act(async () => { await hook.result.current.startOrOpenDM('review-peer-old'); });
    expect(hook.result.current.activeConversationId).toBe('review-old');
    await waitFor(() => expect(hook.result.current.activePeer?.id).toBe('review-peer-old'));
    expect(fixture.cursors).toContain('dm-page-two');
  } finally { hook.unmount(); client.clear(); }
});
