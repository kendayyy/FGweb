import { describe, it, expect } from 'vitest';
import * as c from '../src/index.js';

describe('T03-FIX5 Presence contracts & route registry', () => {
  it('exports presence timing constants', () => {
    expect(c.PRESENCE_HEARTBEAT_INTERVAL_MS).toBe(15000);
    expect(c.PRESENCE_TTL_MS).toBe(45000);
  });

  it('declares presence event names in SocketEventNames', () => {
    expect(c.SocketEventNames.PRESENCE_SUBSCRIBE).toBe('presence.subscribe');
    expect(c.SocketEventNames.PRESENCE_UNSUBSCRIBE).toBe('presence.unsubscribe');
    expect(c.SocketEventNames.PRESENCE_HEARTBEAT).toBe('presence.heartbeat');
    expect(c.SocketEventNames.PRESENCE_CHANGED).toBe('presence.changed');
  });

  it('registers GET /api/v1/games/:id/online REST endpoint', () => {
    const endpoint = c.ApiEndpointRegistry.find(
      (e) => e.method === 'GET' && e.path === '/api/v1/games/:id/online'
    );
    expect(endpoint).toBeDefined();
    expect(endpoint?.auth).toBe('Public');

    const validQuery = endpoint?.requestSchema?.safeParse({ limit: 20 });
    expect(validQuery?.success).toBe(true);

    const invalidQuery = endpoint?.requestSchema?.safeParse({ limit: 100 });
    expect(invalidQuery?.success).toBe(false);

    const validResponse = endpoint?.responseSchema.safeParse({
      items: [
        {
          id: 'u1',
          displayName: 'Player1',
          avatarUrl: 'https://example.com/a.png',
          customStatus: 'LOOKING_FOR_TEAM',
          gameProfiles: [],
          createdAt: '2026-10-05T00:00:00Z',
        },
      ],
      hasMore: false,
    });
    expect(validResponse?.success).toBe(true);
  });

  it('registers PATCH /api/v1/me/status REST endpoint', () => {
    const endpoint = c.ApiEndpointRegistry.find(
      (e) => e.method === 'PATCH' && e.path === '/api/v1/me/status'
    );
    expect(endpoint).toBeDefined();
    expect(endpoint?.auth).toBe('Authenticated');

    const validRequest = endpoint?.requestSchema?.safeParse({
      customStatus: 'LOOKING_FOR_TEAM',
    });
    expect(validRequest?.success).toBe(true);

    const invalidRequest = endpoint?.requestSchema?.safeParse({
      customStatus: 'INVALID_STATUS',
    });
    expect(invalidRequest?.success).toBe(false);

    const extraFieldRequest = endpoint?.requestSchema?.safeParse({
      customStatus: 'PLAYING',
      userId: 'u123',
    });
    expect(extraFieldRequest?.success).toBe(false);

    const validResponse = endpoint?.responseSchema.safeParse({
      customStatus: 'LOOKING_FOR_TEAM',
      isOnline: true,
    });
    expect(validResponse?.success).toBe(true);
  });

  it('preserves legacy /api/v1/online-users route', () => {
    const endpoint = c.ApiEndpointRegistry.find(
      (e) => e.method === 'GET' && e.path === '/api/v1/online-users'
    );
    expect(endpoint).toBeDefined();
    expect(endpoint?.auth).toBe('Public');
  });

  it('validates SocketPresenceRequestSchema with strict conversationId', () => {
    expect(
      c.SocketPresenceRequestSchema?.safeParse({ conversationId: 'conv_123' }).success
    ).toBe(true);

    expect(
      c.SocketPresenceRequestSchema?.safeParse({ conversationId: '' }).success
    ).toBe(false);

    expect(
      c.SocketPresenceRequestSchema?.safeParse({
        conversationId: 'conv_123',
        userId: 'hacker',
      }).success
    ).toBe(false);
  });

  it('validates SocketPresenceAckSchema for success and denial', () => {
    const successAck = c.SocketPresenceAckSchema?.safeParse({
      ok: true,
      conversationId: 'conv_123',
    });
    expect(successAck?.success).toBe(true);

    const errorAck = c.SocketPresenceAckSchema?.safeParse({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Subscription denied',
        requestId: 'req_1',
      },
    });
    expect(errorAck?.success).toBe(true);

    const missingConvAck = c.SocketPresenceAckSchema?.safeParse({ ok: true });
    expect(missingConvAck?.success).toBe(false);
  });

  it('requires conversationId in SocketScopedPresenceChangedPayloadSchema', () => {
    const scopedPayload = {
      conversationId: 'conv_123',
      userId: 'u_123',
      customStatus: 'LOOKING_FOR_TEAM',
      isOnline: true,
    };
    expect(
      c.SocketScopedPresenceChangedPayloadSchema?.safeParse(scopedPayload).success
    ).toBe(true);

    const missingConv = {
      userId: 'u_123',
      customStatus: 'LOOKING_FOR_TEAM',
      isOnline: true,
    };
    expect(
      c.SocketScopedPresenceChangedPayloadSchema?.safeParse(missingConv).success
    ).toBe(false);
  });

  it('preserves compatibility in SocketPresenceChangedPayloadSchema with optional conversationId', () => {
    const legacyPayload = {
      userId: 'u_123',
      customStatus: 'PLAYING',
      isOnline: true,
    };
    expect(
      c.SocketPresenceChangedPayloadSchema?.safeParse(legacyPayload).success
    ).toBe(true);

    const newPayload = {
      userId: 'u_123',
      customStatus: 'PLAYING',
      isOnline: true,
      conversationId: 'conv_123',
    };
    expect(
      c.SocketPresenceChangedPayloadSchema?.safeParse(newPayload).success
    ).toBe(true);
  });

  it('maps SocketEventSchemaMap for presence events', () => {
    expect(c.SocketEventSchemaMap['presence.changed']).toBe(
      c.SocketScopedPresenceChangedPayloadSchema
    );
  });
});
