import { z } from 'zod';
import { IdSchema, MessageDTO, MessageSchema, EncryptedMessageSchema, type EncryptedMessageDTO } from '@fg/contracts';
import { registerAuthCleanup } from '../auth/lifecycle.js';

export interface UnreadSyncEvent {
  type: 'READ' | 'UNREAD_INCREMENT';
  actorId: string;
  conversationId: string;
  messageId?: string;
  timestamp: number;
  tabId: string;
}

const UnreadSyncEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('READ'),
    actorId: IdSchema,
    conversationId: IdSchema,
    timestamp: z.number().finite(),
    tabId: z.string().min(1),
  }),
  z.object({
    type: z.literal('UNREAD_INCREMENT'),
    actorId: IdSchema,
    conversationId: IdSchema,
    messageId: IdSchema,
    timestamp: z.number().finite(),
    tabId: z.string().min(1),
  }),
]);

export interface IngestionResult {
  isDuplicate: boolean;
  isUnreadIncrement: boolean;
  isActiveConversation: boolean;
  message?: MessageDTO;
}

const TAB_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);

export class UnreadSyncManager {
  private actorId: string | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: UnreadSyncEvent) => void> = new Set();
  private storageHandler: ((e: StorageEvent) => void) | null = null;
  private authCleanupRemover: (() => void) | null = null;
  private readWatermarks: Map<string, number> = new Map();
  private seenUnreadMessageIds: Set<string> = new Set();

  constructor() {
    this.authCleanupRemover = registerAuthCleanup(() => {
      this.clear();
    });
  }

  public setActor(actorId: string | null) {
    if (this.actorId === actorId) return;
    this.clearChannel();
    this.readWatermarks.clear();
    this.seenUnreadMessageIds.clear();
    this.actorId = actorId;

    if (actorId && typeof window !== 'undefined') {
      const channelName = `fg_unread_sync_${actorId}`;
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.channel = new BroadcastChannel(channelName);
          this.channel.onmessage = (e) => {
            this.handleIncoming(e.data);
          };
        } catch {
          this.channel = null;
        }
      }

      this.storageHandler = (e: StorageEvent) => {
        if (e.key === channelName && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this.handleIncoming(data);
          } catch {
            // Ignore parse errors
          }
        }
      };
      window.addEventListener('storage', this.storageHandler);
    }
  }

  public subscribe(listener: (event: UnreadSyncEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notifyRead(conversationId: string) {
    if (!this.actorId) return;
    const now = Date.now();
    this.readWatermarks.set(conversationId, now);
    const event: UnreadSyncEvent = {
      type: 'READ',
      actorId: this.actorId,
      conversationId,
      timestamp: now,
      tabId: TAB_ID,
    };
    // Notify local listeners
    this.listeners.forEach((fn) => fn(event));
    this.broadcastToOtherTabs(event);
  }

  public notifyUnreadIncrement(conversationId: string, messageId: string) {
    if (!this.actorId) return;
    this.seenUnreadMessageIds.add(messageId);
    const event: UnreadSyncEvent = {
      type: 'UNREAD_INCREMENT',
      actorId: this.actorId,
      conversationId,
      messageId,
      timestamp: Date.now(),
      tabId: TAB_ID,
    };
    this.broadcastToOtherTabs(event);
  }

  public ingestMessage(
    payload: unknown,
    activeConversationId: string | null
  ): IngestionResult {
    if (!this.actorId) {
      return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };
    }

    const parsed = MessageSchema.safeParse(payload);
    if (!parsed.success) {
      return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };
    }
    return this.ingestMetadata(parsed.data, activeConversationId);
  }

  public ingestEncryptedMessage(payload: unknown, activeConversationId: string | null): Omit<IngestionResult, 'message'> & { message?: EncryptedMessageDTO } {
    const parsed = EncryptedMessageSchema.safeParse(payload);
    if (!this.actorId || !parsed.success) return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };
    return this.ingestMetadata(parsed.data, activeConversationId);
  }

  private ingestMetadata<T extends { id: string; senderId: string; conversationId: string; createdAt: string }>(message: T, activeConversationId: string | null): Omit<IngestionResult, 'message'> & { message?: T } {
    if (!this.actorId) return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };

    const msgTime = new Date(message.createdAt).getTime();
    if (isNaN(msgTime)) {
      return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false };
    }

    const isDuplicate = this.seenUnreadMessageIds.has(message.id);
    this.seenUnreadMessageIds.add(message.id);

    if (message.senderId === this.actorId) {
      return {
        isDuplicate,
        isUnreadIncrement: false,
        isActiveConversation: message.conversationId === activeConversationId,
        message,
      };
    }

    const watermark = this.readWatermarks.get(message.conversationId) || 0;
    if (msgTime <= watermark) {
      return {
        isDuplicate,
        isUnreadIncrement: false,
        isActiveConversation: message.conversationId === activeConversationId,
        message,
      };
    }

    if (message.conversationId === activeConversationId) {
      this.readWatermarks.set(message.conversationId, Date.now());
      const readEv: UnreadSyncEvent = {
        type: 'READ',
        actorId: this.actorId,
        conversationId: message.conversationId,
        timestamp: Date.now(),
        tabId: TAB_ID,
      };
      this.broadcastToOtherTabs(readEv);
      return { isDuplicate, isUnreadIncrement: false, isActiveConversation: true, message };
    }

    if (isDuplicate) {
      return { isDuplicate: true, isUnreadIncrement: false, isActiveConversation: false, message };
    }

    const incEv: UnreadSyncEvent = {
      type: 'UNREAD_INCREMENT',
      actorId: this.actorId,
      conversationId: message.conversationId,
      messageId: message.id,
      timestamp: msgTime,
      tabId: TAB_ID,
    };
    this.listeners.forEach((fn) => fn(incEv));
    this.broadcastToOtherTabs(incEv);

    return { isDuplicate: false, isUnreadIncrement: true, isActiveConversation: false, message };
  }

  private broadcastToOtherTabs(event: UnreadSyncEvent) {
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {
        // Fallback to storage
      }
    }
    if (this.actorId && typeof window !== 'undefined' && window.localStorage) {
      const channelName = `fg_unread_sync_${this.actorId}`;
      try {
        window.localStorage.setItem(channelName, JSON.stringify(event));
      } catch {
        // Ignore storage errors
      }
    }
  }

  private handleIncoming(data: unknown) {
    const parsed = UnreadSyncEventSchema.safeParse(data);
    if (!parsed.success) return;
    const ev = parsed.data;

    if (ev.actorId !== this.actorId || ev.tabId === TAB_ID) {
      return;
    }

    if (ev.type === 'READ') {
      const currentWatermark = this.readWatermarks.get(ev.conversationId) || 0;
      if (ev.timestamp > currentWatermark) {
        this.readWatermarks.set(ev.conversationId, ev.timestamp);
        this.listeners.forEach((fn) => fn(ev));
      }
    } else if (ev.type === 'UNREAD_INCREMENT') {
      if (this.seenUnreadMessageIds.has(ev.messageId)) {
        return; // Duplicate event
      }
      this.seenUnreadMessageIds.add(ev.messageId);

      const watermark = this.readWatermarks.get(ev.conversationId) || 0;
      if (ev.timestamp <= watermark) {
        return; // Cannot resurrect read count
      }
      this.listeners.forEach((fn) => fn(ev));
    }
  }

  public clearChannel() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.storageHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }
    if (this.actorId && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(`fg_unread_sync_${this.actorId}`);
      } catch {
        // Ignore
      }
    }
  }

  public clear() {
    this.clearChannel();
    this.readWatermarks.clear();
    this.seenUnreadMessageIds.clear();
    this.actorId = null;
    this.listeners.clear();
  }

  public destroy() {
    this.clear();
    if (this.authCleanupRemover) {
      this.authCleanupRemover();
      this.authCleanupRemover = null;
    }
  }
}

export const unreadSync = new UnreadSyncManager();

