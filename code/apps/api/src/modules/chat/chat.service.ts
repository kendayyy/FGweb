import { Injectable, OnModuleDestroy, OnModuleInit, HttpException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { MessageDTO, MessageSchema, CreateMessageRequest, ListMessagesQuery, Page, decodeChatCursor, encodeChatCursor, ErrorCode, ErrorCodeToHttpStatus, ALLOWED_GAMES } from '@fg/contracts';
import { AuthService } from '../auth/auth.service.js';
export type ChatActor = {
    userId: string;
    sessionId: string;
} | null;
export function chatError(code: ErrorCode, message: string): never { throw new HttpException({ code, message, requestId: randomUUID() }, ErrorCodeToHttpStatus[code]); }
type Queryable = Pool | PoolClient;
@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    constructor(private readonly auth: AuthService) { }
    onModuleInit() { this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000 }); }
    async onModuleDestroy() { if (this.pool)
        await this.pool.end(); }
    async actor(headers: IncomingHttpHeaders): Promise<ChatActor> {
        const data = await this.auth.getAuthInstance().api.getSession({ headers: fromNodeHeaders(headers), query: { disableCookieCache: true } });
        if (!data) {
            if (/(?:^|;\s*)(?:__Secure-)?better-auth\./.test(headers.cookie ?? ''))
                chatError(ErrorCode.LOGIN_REQUIRED, 'Session expired or invalid');
            return null;
        }
        if (await this.auth.isUserBanned(data.user.id))
            chatError(ErrorCode.FORBIDDEN, 'Account is banned');
        return { userId: data.user.id, sessionId: data.session.id };
    }
    async conversation(id: string, db: Queryable = this.pool) {
        let row = (await db.query<{
            id: string;
            kind: string;
            lobby_id: string | null;
            user1_id: string | null;
            user2_id: string | null;
        }>('SELECT * FROM conversations WHERE id=$1', [id])).rows[0];
        if (!row) {
            const lobby = (await db.query('SELECT l.id FROM lobbies l JOIN games g ON g.id=l.game_id WHERE l.id=$1 AND g.title=ANY($2::text[])', [id, [...ALLOWED_GAMES]])).rows[0];
            if (lobby) {
                await db.query(`INSERT INTO conversations(id,kind,lobby_id) VALUES($1,'LOBBY',$1) ON CONFLICT DO NOTHING`, [id]);
                row = (await db.query('SELECT * FROM conversations WHERE lobby_id=$1', [id])).rows[0];
            }
        }
        if (!row)
            chatError(ErrorCode.NOT_FOUND, 'Conversation not found');
        return row;
    }
    async authorize(conversationId: string, actor: ChatActor, db: Queryable = this.pool, write = false) {
        const conversation = await this.conversation(conversationId, db);
        if (actor) {
            const session = await db.query(`SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR SHARE`, [actor.sessionId, actor.userId]);
            if (!session.rowCount)
                chatError(ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
            const action = (await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`, [actor.userId])).rows[0];
            if (action?.action === 'BAN')
                chatError(ErrorCode.FORBIDDEN, 'Account is banned');
        }
        if (write && !actor)
            chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
        if (conversation.kind === 'LOBBY') {
            const valid = await db.query('SELECT l.id FROM lobbies l JOIN games g ON g.id=l.game_id WHERE l.id=$1 AND g.title=ANY($2::text[])', [conversation.lobby_id, [...ALLOWED_GAMES]]);
            if (!valid.rowCount)
                chatError(ErrorCode.FORBIDDEN, 'Lobby unavailable');
            return conversation.id;
        }
        if (!actor)
            chatError(ErrorCode.FORBIDDEN, 'Private conversation requires membership');
        if (conversation.kind === 'DM') {
            if (actor.userId !== conversation.user1_id && actor.userId !== conversation.user2_id)
                chatError(ErrorCode.FORBIDDEN, 'Private conversation requires membership');
        }
        else {
            const room = (await db.query('SELECT id FROM rooms WHERE conversation_id=$1', [conversation.id])).rows[0];
            const member = room ? await db.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [room.id, actor.userId]) : await db.query('SELECT id FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 FOR SHARE', [conversation.id, actor.userId]);
            if (!member.rowCount)
                chatError(ErrorCode.FORBIDDEN, 'Private conversation requires membership');
        }
        return conversation.id;
    }
    async lobby(gameId: string) {
        const lobby = (await this.pool.query('SELECT l.id FROM lobbies l JOIN games g ON g.id=l.game_id WHERE g.id=$1 AND g.title=ANY($2::text[])', [gameId, [...ALLOWED_GAMES]])).rows[0];
        if (!lobby)
            chatError(ErrorCode.NOT_FOUND, 'Game Lobby not found');
        return (await this.conversation(lobby.id)).id;
    }
    async lobbyTitle(title: string) { const game = (await this.pool.query('SELECT id FROM games WHERE title=$1', [title])).rows[0]; if (!game)
        chatError(ErrorCode.NOT_FOUND, 'Game Lobby not found'); return this.lobby(game.id); }
    private async dto(id: string, db: Queryable = this.pool): Promise<MessageDTO> {
        const row = (await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(m.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso,u.name,u.image,p.display_name,p.avatar_url,p.custom_status FROM messages m JOIN "user" u ON u.id=m.sender_id LEFT JOIN profiles p ON p.user_id=u.id WHERE m.id=$1`, [id])).rows[0];
        if (!row)
            chatError(ErrorCode.NOT_FOUND, 'Message not found');
        return MessageSchema.parse({ id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, sender: { id: row.sender_id, displayName: row.display_name ?? row.name, avatarUrl: row.avatar_url ?? row.image ?? null, customStatus: row.custom_status ?? 'JUST_CHATTING' }, content: row.content, attachments: [], mentions: [], mentionedUserIds: [], replyToId: row.reply_to_id, createdAt: row.created_iso, updatedAt: row.updated_iso });
    }
    async history(id: string, query: ListMessagesQuery, actor: ChatActor): Promise<Page<MessageDTO>> {
        const conversationId = await this.authorize(id, actor);
        const cursor = query.cursor ? decodeChatCursor(query.cursor) : null;
        const rows = (await this.pool.query<{
            id: string;
            created_iso: string;
        }>(`SELECT id,to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM messages WHERE conversation_id=$1 ${cursor ? 'AND (created_at,id)<($3::timestamp,$4::text)' : ''} ORDER BY created_at DESC,id DESC LIMIT $2`, cursor ? [conversationId, query.limit + 1, cursor.createdAt, cursor.id] : [conversationId, query.limit + 1])).rows;
        const hasMore = rows.length > query.limit;
        const selected = rows.slice(0, query.limit);
        const last = selected.at(-1);
        const items = await Promise.all(selected.map(row => this.dto(row.id)));
        // Recheck after hydration so a revoked member cannot receive a completed private response.
        await this.authorize(conversationId, actor);
        return { items, hasMore, nextCursor: hasMore && last ? encodeChatCursor({ id: last.id, createdAt: last.created_iso }) : null };
    }
    async create(id: string, input: CreateMessageRequest, actor: ChatActor) {
        if (!actor)
            chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
        if (input.attachmentIds.length || input.mentionedUserIds.length || input.replyToId)
            chatError(ErrorCode.INVALID_INPUT, 'Rich message references are handled by the rich-chat endpoint phase');
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const conversationId = await this.authorize(id, actor, client, true);
            const inserted = (await client.query<{
                id: string;
            }>(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,conversation_id,client_message_id) DO NOTHING RETURNING id`, [randomUUID(), conversationId, actor.userId, input.content.trim(), input.clientMessageId])).rows[0];
            const messageId = inserted?.id ?? (await client.query('SELECT id FROM messages WHERE sender_id=$1 AND conversation_id=$2 AND client_message_id=$3', [actor.userId, conversationId, input.clientMessageId])).rows[0].id;
            if (inserted)
                await client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES($1,$2,$3,'message.created')`, [randomUUID(), messageId, conversationId]);
            const message = await this.dto(messageId, client);
            await client.query('COMMIT');
            return message;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async committedMessage(messageId: string) { return this.dto(messageId); }
    async dispatch(publish: (messageId: string) => Promise<void>) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const jobs = (await client.query<{
                id: string;
                message_id: string;
            }>(`SELECT id,message_id FROM realtime_outbox WHERE delivered_at IS NULL ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
            for (const job of jobs) {
                try {
                    await publish(job.message_id);
                    await client.query('UPDATE realtime_outbox SET attempts=attempts+1,delivered_at=now() WHERE id=$1', [job.id]);
                }
                catch {
                    await client.query('UPDATE realtime_outbox SET attempts=attempts+1 WHERE id=$1', [job.id]);
                }
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
