import { z } from 'zod';
import {
  MessageDTO,
  MessageSchema,
  CreateMessageRequest,
  CreateMessageRequestSchema,
  Page,
  ProfileDTO,
  PublicProfileSchema,
  createPageSchema,
  ApiErrorResponseSchema,
  IdSchema,
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
    // Ignore parse error
  }

  const err: ApiErrorWithDetails = new Error(message);
  err.status = res.status;
  err.code = code;
  return err;
}

export interface DirectConversationSummary {
  conversationId: string;
  peer: ProfileDTO;
}

const DirectConversationSummarySchema = z.object({
  conversationId: IdSchema,
  peer: PublicProfileSchema,
});

export async function fetchDirectConversations(
  query?: { cursor?: string; limit?: number },
  signal?: AbortSignal
): Promise<Page<DirectConversationSummary>> {
  const params = new URLSearchParams();
  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.limit) params.set('limit', String(query.limit));
  const url = `/api/v1/direct-conversations${params.toString() ? `?${params.toString()}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to fetch direct conversations: HTTP ${res.status}`);
  }
  const data = await res.json();
  return createPageSchema(DirectConversationSummarySchema).parse(data);
}

export async function createDirectConversation(
  recipientUserId: string
): Promise<{ conversationId: string }> {
  const res = await fetch('/api/v1/direct-conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ recipientUserId }),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to create direct conversation: HTTP ${res.status}`);
  }
  const data = await res.json();
  return z.object({ conversationId: IdSchema }).parse(data);
}

export async function fetchConversationMessages(
  conversationId: string,
  query?: { cursor?: string; limit?: number },
  signal?: AbortSignal
): Promise<Page<MessageDTO>> {
  const params = new URLSearchParams();
  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.limit) params.set('limit', String(query.limit));
  const url = `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages${
    params.toString() ? `?${params.toString()}` : ''
  }`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to fetch conversation messages: HTTP ${res.status}`);
  }
  const data = await res.json();
  return createPageSchema(MessageSchema).parse(data);
}

export async function sendDirectMessage(
  conversationId: string,
  payload: CreateMessageRequest
): Promise<MessageDTO> {
  const validatedPayload = CreateMessageRequestSchema.parse(payload);

  const res = await fetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(validatedPayload),
  });
  if (!res.ok) {
    throw await parseErrorResponse(res, `Failed to send direct message: HTTP ${res.status}`);
  }
  const data = await res.json();
  return MessageSchema.parse(data);
}
