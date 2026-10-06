import { describe, it, expect } from 'vitest';
import * as c from '../src/index.js';

describe('T03-FIX6 Pending Friend Requests Listing Contracts', () => {
  it('exports ListFriendRequestsQuerySchema and PendingFriendRequestSchema', () => {
    expect(c.ListFriendRequestsQuerySchema).toBeDefined();
    expect(c.PendingFriendRequestSchema).toBeDefined();
  });

  it('ListFriendRequestsQuerySchema applies direction and limit defaults and validates bounds', () => {
    // Defaults
    const defaultParsed = c.ListFriendRequestsQuerySchema.parse({});
    expect(defaultParsed).toEqual({
      direction: 'INCOMING',
      limit: 50,
    });

    // Valid directions
    expect(c.ListFriendRequestsQuerySchema.safeParse({ direction: 'INCOMING' }).success).toBe(true);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ direction: 'OUTGOING' }).success).toBe(true);

    // Invalid directions
    expect(c.ListFriendRequestsQuerySchema.safeParse({ direction: 'BOTH' }).success).toBe(false);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ direction: 'ACCEPTED' }).success).toBe(false);

    // Limit bounds (1..50)
    expect(c.ListFriendRequestsQuerySchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ limit: 50 }).success).toBe(true);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(c.ListFriendRequestsQuerySchema.safeParse({ limit: 10.5 }).success).toBe(false);

    // Cursor
    expect(c.ListFriendRequestsQuerySchema.safeParse({ cursor: 'opaque_cursor_123' }).success).toBe(true);
  });

  it('PendingFriendRequestSchema validates request DTO fields and rejects invalid status/dates/user summaries', () => {
    const validRequest = {
      requestId: 'req_social_001',
      sender: {
        id: 'usr_sender_001',
        displayName: 'Sender Gamer',
        avatarUrl: 'https://example.com/sender.png',
        customStatus: 'JUST_CHATTING',
      },
      receiver: {
        id: 'usr_receiver_001',
        displayName: 'Receiver Gamer',
        avatarUrl: null,
        customStatus: 'PLAYING',
      },
      status: 'PENDING',
      createdAt: '2026-10-06T08:00:00.000Z',
      updatedAt: '2026-10-06T08:05:00.000Z',
    };

    expect(c.PendingFriendRequestSchema.safeParse(validRequest).success).toBe(true);

    // Rejects invalid literal status (must be PENDING)
    expect(
      c.PendingFriendRequestSchema.safeParse({
        ...validRequest,
        status: 'ACCEPTED',
      }).success,
    ).toBe(false);

    // Rejects invalid dates
    expect(
      c.PendingFriendRequestSchema.safeParse({
        ...validRequest,
        createdAt: 'invalid-iso-date',
      }).success,
    ).toBe(false);
    expect(
      c.PendingFriendRequestSchema.safeParse({
        ...validRequest,
        updatedAt: '2026/10/06 08:00:00',
      }).success,
    ).toBe(false);

    // Rejects invalid peer summaries
    expect(
      c.PendingFriendRequestSchema.safeParse({
        ...validRequest,
        sender: { id: '' },
      }).success,
    ).toBe(false);
  });

  it('supports createPageSchema pagination and ensures privacy projection', () => {
    const PageSchema = c.createPageSchema(c.PendingFriendRequestSchema);
    const validItem = {
      requestId: 'req_002',
      sender: {
        id: 'usr_001',
        displayName: 'User 1',
        avatarUrl: null,
        customStatus: 'JUST_CHATTING',
      },
      receiver: {
        id: 'usr_002',
        displayName: 'User 2',
        avatarUrl: null,
        customStatus: 'LOOKING_FOR_TEAM',
      },
      status: 'PENDING',
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
    };

    const pageData = {
      items: [validItem],
      nextCursor: 'next_page_cursor_xyz',
      hasMore: true,
    };

    const parsed = PageSchema.parse(pageData);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.nextCursor).toBe('next_page_cursor_xyz');
    expect(parsed.hasMore).toBe(true);

    // Verify privacy projection: DTO schema does not contain email/provider/session fields
    const parsedItem = parsed.items[0];
    expect(parsedItem).not.toHaveProperty('email');
    expect(parsedItem).not.toHaveProperty('discordId');
    expect(parsedItem).not.toHaveProperty('emailVerified');
    expect(parsedItem.sender).not.toHaveProperty('email');
    expect(parsedItem.receiver).not.toHaveProperty('email');
  });

  it('registers GET /api/v1/friends/requests endpoint in ApiEndpointRegistry', () => {
    const endpoint = c.ApiEndpointRegistry.find(
      (e) => e.method === 'GET' && e.path === '/api/v1/friends/requests',
    );

    expect(endpoint).toBeDefined();
    expect(endpoint?.auth).toBe('Authenticated');
    expect(endpoint?.requestSchema).toBe(c.ListFriendRequestsQuerySchema);

    // Check responseSchema parses a page of PendingFriendRequestSchema
    const testPage = {
      items: [
        {
          requestId: 'req_003',
          sender: {
            id: 'usr_003',
            displayName: 'User 3',
            avatarUrl: null,
            customStatus: 'JUST_CHATTING',
          },
          receiver: {
            id: 'usr_004',
            displayName: 'User 4',
            avatarUrl: null,
            customStatus: 'JUST_CHATTING',
          },
          status: 'PENDING',
          createdAt: '2026-10-06T09:10:00.000Z',
          updatedAt: '2026-10-06T09:10:00.000Z',
        },
      ],
      nextCursor: null,
      hasMore: false,
    };

    expect(endpoint?.responseSchema.safeParse(testPage).success).toBe(true);
  });
});
