import { describe, it, expect } from 'vitest';
import {
  GameSchema,
  encodeChatCursor,
  decodeChatCursor,
  RoomMemberSchema,
  PlaySessionRosterSchema,
  CallParticipantSchema,
  ExternalLiveSchema,
  PlaySessionSchema,
  RecruitmentSchema,
  CreateMessageRequestSchema,
  ListMessagesQuerySchema,
  NotificationSchema,
  ApiEndpointRegistry,
} from '../src/index.js';

describe('FG Contracts Specs & Behavior Tests (Refactor Loop 2)', () => {
  describe('A. Cursor & Browser Encoding (Gap A)', () => {
    it('ListMessagesQuerySchema rejects junk cursor strings', () => {
      expect(ListMessagesQuerySchema.safeParse({ cursor: 'junk_invalid_base64' }).success).toBe(false);
      expect(ListMessagesQuerySchema.safeParse({ cursor: '   ' }).success).toBe(false);
    });

    it('encodeChatCursor and decodeChatCursor work cleanly in browser context without Buffer', () => {
      const originalBuffer = globalThis.Buffer;
      try {
        // Temporarily remove Buffer to simulate browser environment
        // @ts-expect-error - simulating browser environment by deleting Buffer
        delete globalThis.Buffer;

        const cursor = { createdAt: '2026-10-05T00:00:00.000Z', id: 'msg_unicode_🔥_123' };
        const encoded = encodeChatCursor(cursor);
        expect(typeof encoded).toBe('string');

        const decoded = decodeChatCursor(encoded);
        expect(decoded).toEqual(cursor);
      } finally {
        globalThis.Buffer = originalBuffer;
      }
    });
  });

  describe('B. Structural Constraints & Membership Separation (Gap B)', () => {
    it('PlaySessionSchema requires scheduledAt when timingType is scheduledAt', () => {
      const invalidScheduled = {
        id: 'ps_1',
        roomId: 'room_1',
        hostUserId: 'usr_1',
        timingType: 'scheduledAt', // missing scheduledAt date
        state: 'SCHEDULED',
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      };
      expect(PlaySessionSchema.safeParse(invalidScheduled).success).toBe(false);

      const validHistoricalEnded = {
        ...invalidScheduled,
        scheduledAt: '2025-01-01T10:00:00.000Z',
        state: 'ENDED',
      };
      expect(PlaySessionSchema.safeParse(validHistoricalEnded).success).toBe(true);
    });

    it('RecruitmentSchema enforces currentPlayers <= playerCapacity', () => {
      const invalidPlayersExceed = {
        id: 'rec_1',
        roomId: 'room_1',
        gameId: 'game_val',
        gameTitle: 'Valorant',
        title: 'Ranked',
        mode: 'Competitive',
        playerCapacity: 5,
        currentPlayers: 6, // 6 > 5
        timingType: 'now',
        state: 'OPEN',
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      };
      expect(RecruitmentSchema.safeParse(invalidPlayersExceed).success).toBe(false);
    });

    it('Membership separation: Roster item is not CallParticipant and vice versa; Guest has no RoomMember role', () => {
      const rosterItem = {
        playSessionId: 'ps_1',
        userId: 'usr_1',
        slotIndex: 1,
        isHost: true,
        joinedAt: '2026-10-05T00:00:00.000Z',
      };
      // Roster item parsed as CallParticipant must fail
      expect(CallParticipantSchema.safeParse(rosterItem).success).toBe(false);

      const callParticipant = {
        callId: 'call_1',
        userId: 'usr_1',
        isPublishing: false,
        isMuted: true,
        joinedAt: '2026-10-05T00:00:00.000Z',
      };
      // CallParticipant parsed as Roster item must fail
      expect(PlaySessionRosterSchema.safeParse(callParticipant).success).toBe(false);

      const guestRoomMember = {
        roomId: 'room_1',
        userId: 'usr_guest',
        role: 'GUEST',
        joinedAt: '2026-10-05T00:00:00.000Z',
      };
      expect(RoomMemberSchema.safeParse(guestRoomMember).success).toBe(false);
    });
  });

  describe('C. ApiEndpointRegistry & ACL Lookup Verification (Gap C)', () => {
    it('ApiEndpointRegistry contains explicit endpoints and auth metadata', () => {
      const createRecruitmentEndpoint = ApiEndpointRegistry.find(
        e => e.path === '/api/v1/recruitments' && e.method === 'POST'
      );
      expect(createRecruitmentEndpoint).toBeDefined();
      expect(createRecruitmentEndpoint?.auth).toBe('RoomHelperOrOwner');

      const transferOwnerEndpoint = ApiEndpointRegistry.find(
        e => e.path === '/api/v1/rooms/:id/transfer-owner' && e.method === 'POST'
      );
      expect(transferOwnerEndpoint).toBeDefined();
      expect(transferOwnerEndpoint?.auth).toBe('RoomOwner');

      const roomListEndpoint = ApiEndpointRegistry.find(
        e => e.path === '/api/v1/rooms' && e.method === 'GET'
      );
      expect(roomListEndpoint).toBeDefined();
      expect(roomListEndpoint?.auth).toBe('Authenticated');
    });
  });

  describe('D. Types, GameDTO & URL Validations (Gap D)', () => {
    it('GameSchema includes lobbyRoomId linking to canonical Lobby', () => {
      const gameWithLobby = {
        id: 'game_val',
        title: 'Valorant',
        lobbyRoomId: 'room_lobby_valorant',
        description: 'Tactical shooter',
      };
      expect(GameSchema.safeParse(gameWithLobby).success).toBe(true);
    });

    it('rejects external live URLs with userinfo credentials or non-standard ports', () => {
      const userinfoUrl = {
        id: 'live_1',
        callId: 'call_1',
        provider: 'youtube',
        url: 'https://admin:pass@www.youtube.com/watch?v=123',
        configuredBy: 'usr_1',
        createdAt: '2026-10-05T00:00:00.000Z',
      };
      expect(ExternalLiveSchema.safeParse(userinfoUrl).success).toBe(false);

      const alternatePortUrl = {
        id: 'live_2',
        callId: 'call_1',
        provider: 'youtube',
        url: 'https://www.youtube.com:8080/watch?v=123',
        configuredBy: 'usr_1',
        createdAt: '2026-10-05T00:00:00.000Z',
      };
      expect(ExternalLiveSchema.safeParse(alternatePortUrl).success).toBe(false);
    });

    it('CreateMessageRequestSchema rejects whitespace-only clientMessageId', () => {
      const msg = {
        content: 'Hello',
        clientMessageId: '   ',
      };
      expect(CreateMessageRequestSchema.safeParse(msg).success).toBe(false);
    });

    it('NotificationSchema strictly rejects mismatched notification type and data payload', () => {
      const mismatchedNotification = {
        id: 'notif_1',
        userId: 'usr_1',
        type: 'DM',
        title: 'Friend Request',
        body: 'User sent friend request',
        data: {
          requestId: 'req_123',
          senderId: 'usr_2',
        }, // FriendInvite data for DM type
        isRead: false,
        createdAt: '2026-10-05T00:00:00.000Z',
      };
      expect(NotificationSchema.safeParse(mismatchedNotification).success).toBe(false);
    });
  });
});
