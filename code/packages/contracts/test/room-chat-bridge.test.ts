import { describe, it, expect } from 'vitest';
import * as c from '../src/index.js';

const date = '2026-10-05T00:00:00Z';
const validRoomBase = {
  id: 'room_123',
  name: 'Test Room',
  gameId: 'game_valorant',
  gameTitle: 'Valorant',
  ownerId: 'user_owner',
  settings: {
    visibility: 'PUBLIC',
    invitePolicy: 'OWNER_APPROVAL',
    playerCapacity: 5,
  },
  memberCount: 1,
  createdAt: date,
  updatedAt: date,
};

describe('T03-FIX7 Room Chat Bridge - conversationId requirement in RoomSchema', () => {
  it('requires conversationId in authenticated RoomSchema and parses valid opaque conversationId', () => {
    const validRoom = {
      ...validRoomBase,
      conversationId: 'conv_abc123',
    };
    const result = c.RoomSchema.safeParse(validRoom);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { conversationId?: string }).conversationId).toBe('conv_abc123');
      expect(result.data.id).toBe('room_123');
    }
  });

  it('allows conversationId and roomId (id) to differ as separate opaque identifiers', () => {
    const roomWithDistinctIds = {
      ...validRoomBase,
      id: 'room_id_001',
      conversationId: 'conv_id_999',
    };
    const result = c.RoomSchema.safeParse(roomWithDistinctIds);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('room_id_001');
      expect((result.data as { conversationId?: string }).conversationId).toBe('conv_id_999');
      expect(result.data.id).not.toBe((result.data as { conversationId?: string }).conversationId);
    }
  });

  it('rejects room response when conversationId is missing', () => {
    const roomWithoutConvId = {
      ...validRoomBase,
    };
    const result = c.RoomSchema.safeParse(roomWithoutConvId);
    expect(result.success).toBe(false);
  });

  it('rejects room response when conversationId is blank or whitespace-only', () => {
    const roomWithEmptyId = {
      ...validRoomBase,
      conversationId: '',
    };
    const roomWithSpaceId = {
      ...validRoomBase,
      conversationId: '   ',
    };
    expect(c.RoomSchema.safeParse(roomWithEmptyId).success).toBe(false);
    expect(c.RoomSchema.safeParse(roomWithSpaceId).success).toBe(false);
  });

  it('requires conversationId across shared page transports for rooms', () => {
    const PageRoomSchema = c.createPageSchema(c.RoomSchema);
    const validPage = {
      items: [
        {
          ...validRoomBase,
          conversationId: 'conv_page_1',
        },
      ],
      nextCursor: null,
      hasMore: false,
    };
    expect(PageRoomSchema.safeParse(validPage).success).toBe(true);

    const invalidPage = {
      items: [
        {
          ...validRoomBase,
        },
      ],
      nextCursor: null,
      hasMore: false,
    };
    expect(PageRoomSchema.safeParse(invalidPage).success).toBe(false);
  });
});
