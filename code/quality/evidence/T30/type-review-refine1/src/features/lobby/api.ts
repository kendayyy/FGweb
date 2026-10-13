import { GameSchema, MessageSchema, CreateMessageRequestSchema, CreateMessageRequest, createPageSchema, GameDTO, Page, MessageDTO } from '@fg/contracts';
import { z } from 'zod';
async function json(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, credentials: 'include', headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
export async function fetchGames(signal?: AbortSignal): Promise<GameDTO[]> { return z.array(GameSchema).parse(await json('/api/v1/games', { signal })); }
export async function fetchHistory(gameId: string, cursor?: string, signal?: AbortSignal): Promise<Page<MessageDTO>> {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor)
        query.set('cursor', cursor);
    return createPageSchema(MessageSchema).parse(await json(`/api/v1/games/${encodeURIComponent(gameId)}/lobby/messages?${query}`, { signal }));
}
export async function sendMessage(conversationId: string, content: string, clientMessageId: string, signal?: AbortSignal, rich?: CreateMessageRequest) { const body = CreateMessageRequestSchema.parse({ ...rich, content, clientMessageId }); return MessageSchema.parse(await json(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify(body), signal })); }
