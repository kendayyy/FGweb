import { Injectable, OnModuleDestroy, OnModuleInit, HttpException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { MessageDTO, MessageSchema, CreateMessageRequest, ListMessagesQuery, Page, decodeChatCursor, encodeChatCursor, ErrorCode, ErrorCodeToHttpStatus, ALLOWED_GAMES } from '@fg/contracts';
import { attachmentDTO, attachmentUrl } from './attachment-dto.js';
import { AuthService } from '../auth/auth.service.js';
export type ChatActor = {
    userId: string;
    sessionId: string;
} | null;
export function chatError(code: ErrorCode, message: string): never { throw new HttpException({ code, message, requestId: randomUUID() }, ErrorCodeToHttpStatus[code]); }
type Queryable = Pool | PoolClient;
/**
 * Transaction-scoped advisory lock for serializing social pair operations
 * (DM writes, block insertions, friend request changes).
 * Uses PostgreSQL hashtextextended with a 64-bit key generated from a JSON array
 * containing a fixed namespace label ('fg_social_pair') and canonical LEAST/GREATEST user IDs.
 */
export async function lockSocialPair(db: Queryable, firstId: string, secondId: string): Promise<void> {
    if (!firstId || !secondId) return;
    await db.query(
        `SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`,
        [firstId, secondId]
    );
}
@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    constructor(private readonly auth: AuthService) { }
    onModuleInit() { this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000 }); }
    async onModuleDestroy() {
        if (this.pool)
            await this.pool.end();
    }
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
            if (write) {
                if (!conversation.user1_id || !conversation.user2_id)
                    chatError(ErrorCode.FORBIDDEN, 'Invalid DM participants');
                await lockSocialPair(db, conversation.user1_id, conversation.user2_id);
                const block = await db.query(
                    `SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,
                    [conversation.user1_id, conversation.user2_id]
                );
                if (block.rowCount)
                    chatError(ErrorCode.FORBIDDEN, 'DM communication blocked');
            }
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
    async lobbyTitle(title: string) {
        const game = (await this.pool.query('SELECT id FROM games WHERE title=$1', [title])).rows[0];
        if (!game)
            chatError(ErrorCode.NOT_FOUND, 'Game Lobby not found');
        return this.lobby(game.id);
    }
    private async dto(id: string, db: Queryable = this.pool, includeReply = true): Promise<MessageDTO> {
        const row = (await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(m.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso,u.name,u.image,p.display_name,p.avatar_url,p.custom_status FROM messages m JOIN "user" u ON u.id=m.sender_id LEFT JOIN profiles p ON p.user_id=u.id WHERE m.id=$1`, [id])).rows[0];
        if (!row)
            chatError(ErrorCode.NOT_FOUND, 'Message not found');
        const images = (await db.query('SELECT * FROM attachments WHERE message_id=$1 AND conversation_id=$2 ORDER BY created_at,id', [id, row.conversation_id])).rows;
        const mentioned = (await db.query(`SELECT u.id,u.name,u.image,p.display_name,p.avatar_url,p.custom_status FROM mentions m JOIN "user" u ON u.id=m.mentioned_user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE m.message_id=$1 ORDER BY u.id`, [id])).rows;
        const summary = (user: typeof row) => ({ id: user.id, displayName: user.display_name ?? user.name, avatarUrl: user.avatar_url ?? user.image ?? null, customStatus: user.custom_status ?? 'JUST_CHATTING' });
        const replyToMessage = includeReply && row.reply_to_id ? await this.dto(row.reply_to_id, db, false) : undefined;
        return MessageSchema.parse({ id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, sender: summary({ ...row, id: row.sender_id }), content: row.content, attachments: images.map(attachmentDTO), mentions: mentioned.map(summary), mentionedUserIds: mentioned.map(user => user.id), replyToId: row.reply_to_id, ...replyToMessage ? { replyToMessage } : {}, createdAt: row.created_iso, updatedAt: row.updated_iso });
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
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const conversationId = await this.authorize(id, actor, client, true);
            // The unique message insertion serializes concurrent retries before draft claims.
            const inserted = (await client.query<{
                id: string;
            }>(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,conversation_id,client_message_id) DO NOTHING RETURNING id`, [randomUUID(), conversationId, actor.userId, input.content.trim(), input.clientMessageId])).rows[0];
            const messageId = inserted?.id ?? (await client.query('SELECT id FROM messages WHERE sender_id=$1 AND conversation_id=$2 AND client_message_id=$3', [actor.userId, conversationId, input.clientMessageId])).rows[0].id;
            if (inserted) {
                if (input.replyToId) {
                    const parent = await client.query('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 FOR KEY SHARE', [input.replyToId, conversationId]);
                    if (!parent.rowCount)
                        chatError(ErrorCode.INVALID_INPUT, 'Reply must belong to this conversation');
                }
                const imageIds = [...new Set(input.attachmentIds)].sort();
                const drafts = imageIds.length ? (await client.query('SELECT * FROM pending_image_uploads WHERE id=ANY($1::text[]) AND expires_at>now() ORDER BY id FOR UPDATE', [imageIds])).rows : [];
                if (drafts.length !== imageIds.length || drafts.some(draft => draft.uploader_id !== actor.userId || draft.conversation_id !== conversationId))
                    chatError(ErrorCode.INVALID_INPUT, 'Image claim denied');
                const targets = [...new Set(input.mentionedUserIds)].sort();
                if (targets.length) {
                    const users = (await client.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) FOR KEY SHARE', [targets])).rows;
                    const conversation = await this.conversation(conversationId, client);
                    let eligible = users.map(user => user.id);
                    if (conversation.kind === 'DM')
                        eligible = eligible.filter(user => user === conversation.user1_id || user === conversation.user2_id);
                    else if (conversation.kind !== 'LOBBY') {
                        const room = (await client.query('SELECT id FROM rooms WHERE conversation_id=$1', [conversationId])).rows[0];
                        eligible = (room ? await client.query('SELECT user_id FROM room_members WHERE room_id=$1 AND user_id=ANY($2::text[]) FOR SHARE', [room.id, targets]) : await client.query('SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id=ANY($2::text[]) FOR SHARE', [conversationId, targets])).rows.map(member => member.user_id);
                    }
                    if (targets.some(target => !eligible.includes(target)))
                        chatError(ErrorCode.INVALID_INPUT, 'Mention must belong to this conversation');
                }
                await client.query('UPDATE messages SET reply_to_id=$2,type=$3 WHERE id=$1', [messageId, input.replyToId ?? null, imageIds.length ? 'IMAGE' : 'TEXT']);
                for (const draft of drafts)
                    await client.query(`INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) VALUES($1,$2,$3,$4,$5,$6,$7)`, [draft.id, messageId, conversationId, attachmentUrl(draft.id), draft.file_name, draft.file_size, draft.mime_type]);
                if (imageIds.length)
                    await client.query('DELETE FROM pending_image_uploads WHERE id=ANY($1::text[])', [imageIds]);
                for (const target of targets)
                    await client.query('INSERT INTO mentions(id,message_id,mentioned_user_id) VALUES($1,$2,$3)', [randomUUID(), messageId, target]);
                await client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES($1,$2,$3,'message.created')`, [randomUUID(), messageId, conversationId]);
            }
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
