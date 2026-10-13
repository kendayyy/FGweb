import { z } from 'zod';
import {
  ProfileDTO,
  PublicProfileSchema,
  PendingFriendRequestDTO,
  PendingFriendRequestSchema,
  BlockDTO,
  BlockSchema,
  Page,
  createPageSchema,
  ApiErrorResponseSchema,
} from '@fg/contracts';

export type ApiErrorWithDetails = Error & { status?: number; code?: string };

async function parseErrorResponse(res: Response, defaultMessage: string): Promise<ApiErrorWithDetails> {
  let message = defaultMessage;
  let code: string | undefined;

  try {
    const data = await res.json();
    const parsed = ApiErrorResponseSchema.safeParse(data);
    if (parsed.success) {
      message = parsed.data.message || message;
      code = parsed.data.code;
    } else if (data && typeof data.message === 'string') {
      message = data.message;
    }
  } catch {
    // Ignore JSON parse error
  }

  const err: ApiErrorWithDetails = new Error(message);
  err.status = res.status;
  err.code = code;
  return err;
}

export async function fetchFriends(
  queryOrSignal?: { cursor?: string; limit?: number } | AbortSignal,
  signalArg?: AbortSignal
): Promise<Page<ProfileDTO>> {
  const query =
    queryOrSignal && !(queryOrSignal instanceof AbortSignal) && !('aborted' in (queryOrSignal as object))
      ? (queryOrSignal as { cursor?: string; limit?: number })
      : undefined;
  const signal =
    queryOrSignal && (queryOrSignal instanceof AbortSignal || 'aborted' in (queryOrSignal as object))
      ? (queryOrSignal as AbortSignal)
      : signalArg;

  const params = new URLSearchParams();
  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.limit) params.set('limit', String(query.limit));
  const url = `/api/v1/friends${params.toString() ? `?${params.toString()}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to fetch friends list: HTTP ${res.status}`);
  }
  const data = await res.json();
  return createPageSchema(PublicProfileSchema).parse(data);
}

export async function fetchFriendRequests(
  direction: 'INCOMING' | 'OUTGOING' = 'INCOMING',
  queryOrSignal?: { cursor?: string; limit?: number } | AbortSignal,
  signalArg?: AbortSignal
): Promise<Page<PendingFriendRequestDTO>> {
  const query =
    queryOrSignal && !(queryOrSignal instanceof AbortSignal) && !('aborted' in (queryOrSignal as object))
      ? (queryOrSignal as { cursor?: string; limit?: number })
      : undefined;
  const signal =
    queryOrSignal && (queryOrSignal instanceof AbortSignal || 'aborted' in (queryOrSignal as object))
      ? (queryOrSignal as AbortSignal)
      : signalArg;

  const params = new URLSearchParams();
  params.set('direction', direction);
  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.limit) params.set('limit', String(query.limit));
  const url = `/api/v1/friends/requests?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to fetch friend requests: HTTP ${res.status}`);
  }
  const data = await res.json();
  return createPageSchema(PendingFriendRequestSchema).parse(data);
}

export async function sendFriendRequest(targetUserId: string): Promise<{ requestId: string; status: 'PENDING' }> {
  const res = await fetch('/api/v1/friends/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ targetUserId }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to send friend request: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ requestId: z.string(), status: z.literal('PENDING') }).parse(data);
}

export async function respondFriendRequest(
  requestId: string,
  action: 'ACCEPT' | 'REJECT'
): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/friends/requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to respond to friend request: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ success: z.boolean() }).parse(data);
}

export async function cancelFriendRequest(requestId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/friends/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to cancel friend request: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ success: z.boolean() }).parse(data);
}

export async function removeFriend(friendUserId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/friends/${encodeURIComponent(friendUserId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to remove friend: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ success: z.boolean() }).parse(data);
}

export async function fetchBlocks(signal?: AbortSignal): Promise<BlockDTO[]> {
  const res = await fetch('/api/v1/blocks', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to fetch blocks list: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.array(BlockSchema).parse(data);
}

export async function createBlock(blockedId: string): Promise<BlockDTO> {
  const res = await fetch('/api/v1/blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ blockedId }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to block user: HTTP ${res.status}`);
  }
  const data = await res.json();
  return BlockSchema.parse(data);
}

export async function deleteBlock(userId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to unblock user: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ success: z.boolean() }).parse(data);
}
