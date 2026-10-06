import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FriendsModal } from '../../../apps/web/src/features/friends/FriendsModal';
const fixture = vi.hoisted(() => ({ calls: [] as Array<{ direction: string; cursor?: string }> }));
vi.mock('../../../apps/web/src/features/auth/index.js', () => ({ useAuth: () => ({ user: { id: 'review-actor' } }) }));
vi.mock('../../../apps/web/src/features/friends/PeerSocialControls.tsx', () => ({ PeerSocialControls: () => null }));
vi.mock('../../../apps/web/src/features/friends/api.js', () => ({
  fetchFriends: async () => ({ items: [], hasMore: false, nextCursor: null }),
  fetchBlocks: async () => [],
  fetchFriendRequests: async (direction: string, query?: { cursor?: string }) => {
    const cursor = query && 'cursor' in query ? query.cursor : undefined;
    fixture.calls.push({ direction, cursor });
    const id = cursor ? 'second' : 'first';
    const peer = { id: `peer-${id}`, displayName: `Request ${id}`, avatarUrl: null };
    return { items: [{ requestId: `request-${id}`, sender: peer, receiver: peer }], hasMore: !cursor, nextCursor: cursor ? null : 'request-page-two' };
  },
  respondFriendRequest: async () => ({ success: true }),
  cancelFriendRequest: async () => ({ success: true }),
  deleteBlock: async () => ({ success: true }),
}));
it('Load more incoming requests follows the cursor and keeps both distinct pages', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FriendsModal isOpen onClose={() => {}} /></QueryClientProvider>);
  try {
    fireEvent.click(screen.getByRole('tab', { name: /Lời mời/ }));
    await screen.findByText('Request first');
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(fixture.calls.some(c => c.direction === 'INCOMING' && c.cursor === 'request-page-two')).toBe(true));
    expect(screen.getByText('Request first')).toBeInTheDocument();
    expect(screen.getByText('Request second')).toBeInTheDocument();
  } finally { cleanup(); client.clear(); }
});
