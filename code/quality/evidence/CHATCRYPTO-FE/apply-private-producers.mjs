import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const dir = 'quality/evidence/CHATCRYPTO-FE', before = JSON.parse(fs.readFileSync(`${dir}/private-producer-before.json`, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
for (const [path, sha] of Object.entries(before.files)) assert.equal(hash(fs.readFileSync(path)), sha);
const hookPath = 'apps/web/src/features/direct-messages/useDirectMessages.ts', oldHook = fs.readFileSync(hookPath, 'utf8');
const contract = oldHook.slice(oldHook.indexOf('export interface DMState'), oldHook.indexOf('export function useDirectMessages'));
const imports = `import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { type MessageDTO, type CreateMessageRequest, SocketEventNames, SocketCryptoConversationAckSchema } from '@fg/contracts';
import { useAuth } from '../auth';
import { useOptionalCryptoDevice } from '../crypto/CryptoDeviceProvider';
import { registerAuthCleanup } from '../auth/lifecycle';
import { fetchDirectConversations, createDirectConversation, type DirectConversationSummary } from './api';
import { unreadSync } from './sync';
`;
const body = `export function useDirectMessages(): DMState {
  const { user } = useAuth(), actorId = user?.id ?? null;
  const device = useOptionalCryptoDevice();
  const [selection, setSelection] = useState<{ actor: string | null; id: string | null }>({ actor: actorId, id: null });
  const [counts, setCounts] = useState<{ actor: string | null; values: Record<string, number> }>({ actor: actorId, values: {} });
  const current = useRef({ actor: actorId, id: null as string | null });
  const query = useQuery({ queryKey: ['directConversations', actorId], enabled: Boolean(actorId), queryFn: ({ signal }) => fetchDirectConversations(undefined, signal), retry: false });
  const conversations = query.data?.items ?? [];
  const activeConversationId = selection.actor === actorId ? selection.id : null;
  current.current = { actor: actorId, id: activeConversationId };
  const unreadCounts = counts.actor === actorId ? counts.values : {};
  useEffect(() => {
    unreadSync.setActor(actorId); setSelection({ actor: actorId, id: null }); setCounts({ actor: actorId, values: {} });
    const clear = () => { current.current = { actor: null, id: null }; setSelection({ actor: null, id: null }); setCounts({ actor: null, values: {} }); };
    const unregister = registerAuthCleanup(clear); return () => { unregister(); };
  }, [actorId]);
  useEffect(() => unreadSync.subscribe(event => {
    if (event.actorId !== current.current.actor) return;
    setCounts(previous => {
      const values = previous.actor === event.actorId ? { ...previous.values } : {};
      values[event.conversationId] = event.type === 'READ' || event.conversationId === current.current.id ? 0 : (values[event.conversationId] ?? 0) + 1;
      return { actor: event.actorId, values };
    });
  }), []);
  const conversationKey = JSON.stringify(conversations.map(item => item.conversationId));
  useEffect(() => {
    if (!actorId || device?.status !== 'READY' || !device.deviceId || !device.session) return;
    const socket = io('/', { transports: ['websocket', 'polling'], withCredentials: true });
    const actor = actorId, session = device.session;
    const subscribe = () => {
      const ids = [...new Set([...(activeConversationId ? [activeConversationId] : []), ...JSON.parse(conversationKey)])].slice(0, 32);
      for (const conversationId of ids) socket.emit(SocketEventNames.CRYPTO_SUBSCRIBE, { conversationId, deviceId: device.deviceId }, (raw: unknown) => {
        const ack = SocketCryptoConversationAckSchema.safeParse(raw);
        if (ack.success && !ack.data.ok && current.current.actor === actor) setCounts(previous => ({ actor, values: { ...previous.values, [conversationId]: 0 } }));
      });
    };
    socket.on('connect', subscribe);
    socket.on(SocketEventNames.CRYPTO_MESSAGE_CREATED, (raw: unknown) => {
      if (current.current.actor !== actor || session.signal.aborted) return;
      unreadSync.ingestEncryptedMessage(raw, current.current.id);
    });
    const close = () => socket.disconnect(); session.signal.addEventListener('abort', close, { once: true });
    return () => { session.signal.removeEventListener('abort', close); socket.disconnect(); };
  }, [actorId, device?.status, device?.deviceId, device?.session, conversationKey, activeConversationId]);
  const setActiveConversationId = useCallback((id: string | null) => {
    if (!actorId) return; current.current = { actor: actorId, id }; setSelection({ actor: actorId, id });
    if (id) { unreadSync.notifyRead(id); setCounts(previous => ({ actor: actorId, values: { ...(previous.actor === actorId ? previous.values : {}), [id]: 0 } })); }
  }, [actorId]);
  const startOrOpenDM = useCallback(async (recipientUserId: string) => {
    const actor = actorId; if (!actor) throw new Error('LOGIN_REQUIRED');
    const existing = conversations.find(item => item.peer.id === recipientUserId);
    const id = existing?.conversationId ?? (await createDirectConversation(recipientUserId)).conversationId;
    if (current.current.actor !== actor) throw new Error('SESSION_CHANGED');
    await query.refetch(); if (current.current.actor !== actor) throw new Error('SESSION_CHANGED'); setActiveConversationId(id); return id;
  }, [actorId, conversations, query, setActiveConversationId]);
  return {
    conversations, activeConversationId, activePeer: conversations.find(item => item.conversationId === activeConversationId)?.peer ?? null,
    messages: [], unreadCounts, totalUnread: Object.values(unreadCounts).reduce((total, value) => total + value, 0),
    isLoadingConversations: query.isLoading, conversationsError: query.error instanceof Error ? query.error : null,
    isLoadingMessages: false, messagesError: null, isLoadingOlderMessages: false, olderMessagesError: null, isSending: false, sendError: null,
    setActiveConversationId, startOrOpenDM,
    sendMessage: async () => { throw new Error('Use the encrypted private composer'); },
    loadOlderMessages: async () => { throw new Error('Use encrypted history'); }, hasOlderMessages: false, clearSendError: () => undefined,
    refetchConversations: async () => { await query.refetch(); }, refetchMessages: async () => undefined,
  };
}
`;
fs.writeFileSync(hookPath, imports + '\n' + contract + body);
const syncPath = 'apps/web/src/features/direct-messages/sync.ts', oldSync = fs.readFileSync(syncPath, 'utf8');
const marker = '    const message = parsed.data;'; assert.equal(oldSync.split(marker).length, 2);
const updatedSync = oldSync.replace('IdSchema, MessageDTO, MessageSchema', 'IdSchema, MessageDTO, MessageSchema, EncryptedMessageSchema, type EncryptedMessageDTO')
  .replace(marker, `    return this.ingestMetadata(parsed.data, activeConversationId);
  }

  public ingestEncryptedMessage(payload: unknown, activeConversationId: string | null): Omit<IngestionResult, 'message'> & { message?: EncryptedMessageDTO } {
    const parsed = EncryptedMessageSchema.safeParse(payload);
    if (!this.actorId || !parsed.success) return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };
    return this.ingestMetadata(parsed.data, activeConversationId);
  }

  private ingestMetadata<T extends { id: string; senderId: string; conversationId: string; createdAt: string }>(message: T, activeConversationId: string | null): Omit<IngestionResult, 'message'> & { message?: T } {
    if (!this.actorId) return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };`);
fs.writeFileSync(syncPath, updatedSync);
const dmPath = 'apps/web/src/features/direct-messages/DirectMessagesPanel.tsx', dm = fs.readFileSync(dmPath, 'utf8');
const dmStart = dm.indexOf('                  {/* Message List */}'), dmEnd = dm.indexOf('                </>', dmStart);
assert(dmStart > 0 && dmEnd > dmStart);
fs.writeFileSync(dmPath, dm.slice(0, dmStart) + `                  <PrivateChatPane key={user.id + ':' + dm.activeConversationId} conversationId={dm.activeConversationId} actorId={user.id}
                    participants={[{id:user.id,displayName:user.displayName},{id:activePeer.id,displayName:activePeer.displayName}]}/>
` + dm.slice(dmEnd));
let nextDm = fs.readFileSync(dmPath, 'utf8').replace("import { RichComposer } from '../chat/RichComposer.tsx';", "import { PrivateChatPane } from '../crypto/PrivateChatPane';").replace("import { RichMessage } from '../chat/RichMessage.tsx';\n", '');
nextDm = nextDm.replace("import { RichMessage } from '../chat/RichMessage.tsx';\r\n", ''); fs.writeFileSync(dmPath, nextDm);
const roomPath = 'apps/web/src/features/rooms/RoomsPage.tsx', room = fs.readFileSync(roomPath, 'utf8');
const roomStart = room.indexOf('            {/* Chat Panel -'), roomEnd = room.indexOf('</section>', roomStart) + '</section>'.length;
assert(roomStart > 0 && roomEnd > roomStart);
let nextRoom = room.slice(0, roomStart) + `            <section className={\`fg-rooms-chat-panel \${mobileTab === 'chat' ? 'fg-mobile-visible' : ''}\`}>
              <div className="fg-rooms-chat-header"><span>Trò chuyện nhóm</span></div>
              {conversationId && <PrivateChatPane key={actorUserId + ':' + conversationId} conversationId={conversationId} actorId={actorUserId}
                participants={membersList.map(member=>({id:member.userId,displayName:member.user?.displayName??'Thành viên'}))}
                onAccessDenied={()=>setCryptoDenied({actor:actorUserId,room:selectedRoomId})}/>}
            </section>` + room.slice(roomEnd);
nextRoom = nextRoom.replace("import { RichComposer } from '../chat/RichComposer.js';", "import { PrivateChatPane } from '../crypto/PrivateChatPane';")
 .replace(/import \{ RichMessage \} from '\.\.\/chat\/RichMessage.js';\r?\n/, '')
 .replace(/import \{ useRoomChat \} from '.\/useRoomChat.js';\r?\n/, '')
 .replace('  const chat = useRoomChat(conversationId, actorUserId);', "  const [cryptoDenied,setCryptoDenied]=useState<{actor:string;room:string|null}|null>(null);\n  const privateAccessDenied=cryptoDenied?.actor===actorUserId&&cryptoDenied?.room===selectedRoomId;")
 .replaceAll('chat.isRevokedOrForbidden', 'privateAccessDenied');
assert(!nextRoom.includes('chat.')); fs.writeFileSync(roomPath, nextRoom);
console.log(JSON.stringify({ replacedPrivateMessagePanes: true, dmMetadataOnly: true, legacyRoomHookNoLongerUsed: true, encryptedUnreadSchema: true, beforeSnapshotsRetained: true }));
