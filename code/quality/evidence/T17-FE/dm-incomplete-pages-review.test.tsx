import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDirectMessages } from '../../../apps/web/src/features/direct-messages/useDirectMessages';
const fixture = vi.hoisted(() => ({ mode: 'repeat' }));
vi.mock('../../../apps/web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'review-actor' } }) }));
vi.mock('socket.io-client', () => ({ io: () => ({ on() { return this; }, disconnect() {}, emitWithAck: async () => ({ ok: true, conversationId: 'review-a' }) }) }));
vi.mock('../../../apps/web/src/features/direct-messages/api.js', () => ({
  fetchDirectConversations: async () => ({ items: [], hasMore: true, nextCursor: fixture.mode === 'repeat' ? 'repeating-cursor' : null }),
  fetchConversationMessages: async () => ({ items: [], hasMore: false, nextCursor: null }),
  createDirectConversation: async () => ({ conversationId: 'unused' }),
  sendDirectMessage: async () => { throw new Error('unused'); },
}));
for (const mode of ['repeat', 'missing']) {
  it(`An incomplete DM list with ${mode} cursor is a retriable error, not empty success`, async () => {
    fixture.mode = mode;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useDirectMessages(), { wrapper });
    try { await waitFor(() => expect(hook.result.current.conversationsError).toBeInstanceOf(Error)); }
    finally { hook.unmount(); client.clear(); }
  });
}
