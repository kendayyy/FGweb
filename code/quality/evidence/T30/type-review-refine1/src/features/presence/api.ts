import {
  Page,
  ProfileDTO,
  CustomStatus,
  UpdateCustomStatusRequestSchema,
  UpdateCustomStatusResponseSchema,
  UpdateCustomStatusResponse,
  createPageSchema,
  PublicProfileSchema,
} from '@fg/contracts';

export async function fetchGameOnlineUsers(
  gameId: string,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal
): Promise<Page<ProfileDTO>> {
  const url = new URL(`/api/v1/games/${encodeURIComponent(gameId)}/online`, window.location.origin);
  url.searchParams.set('limit', String(limit));
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch online users: ${response.status}`);
  }

  const json = await response.json();
  const pageSchema = createPageSchema(PublicProfileSchema);
  return pageSchema.parse(json);
}

export async function updateCustomStatus(
  customStatus: CustomStatus,
  signal?: AbortSignal
): Promise<UpdateCustomStatusResponse> {
  const requestBody = UpdateCustomStatusRequestSchema.parse({ customStatus });

  const response = await fetch('/api/v1/me/status', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to update custom status: ${response.status}`);
  }

  const json = await response.json();
  return UpdateCustomStatusResponseSchema.parse(json);
}

export async function fetchUserProfile(
  userId: string,
  signal?: AbortSignal
): Promise<ProfileDTO> {
  const response = await fetch(`/api/v1/users/${encodeURIComponent(userId)}/profile`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  const json = await response.json();
  return PublicProfileSchema.parse(json);
}
