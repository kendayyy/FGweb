import { afterEach, describe, expect, it } from 'vitest';
import { UnreadSyncManager } from '../src/features/direct-messages/sync';

// Structural routing fixture only; cryptographic authenticity is tested natively.
const message = { id: 'metadata-message', conversationId: 'private-conversation', senderId: 'peer', clientMessageId: 'client-message', deviceId: 'PEER', membershipRevision: 1,
  envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AAAA', session_id: 'A'.repeat(43) } },
  createdAt: new Date(Date.now() + 1000).toISOString(), attachmentIds: [], origin: 'LIVE' };
const managers: UnreadSyncManager[] = [];
afterEach(() => { for (const manager of managers.splice(0)) manager.setActor(null); });
function manager() { const value = new UnreadSyncManager(); value.setActor('actor'); managers.push(value); return value; }
describe('encrypted unread metadata (structural unit, no native/auth claim)', () => {
  it('increments once for encrypted event and broadcasts only IDs/time', () => {
    const sync = manager(), events: unknown[] = []; sync.subscribe(event => events.push(event));
    expect(sync.ingestEncryptedMessage(message, null).isUnreadIncrement).toBe(true);
    expect(sync.ingestEncryptedMessage(message, null).isUnreadIncrement).toBe(false);
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0] as object).sort()).toEqual(['actorId', 'conversationId', 'messageId', 'tabId', 'timestamp', 'type']);
    expect(JSON.stringify(events)).not.toContain('ciphertext'); expect(JSON.stringify(events)).not.toContain('envelope');
  });
  it('rejects plaintext or malformed ciphertext without count or callback', () => {
    const sync = manager(), events: unknown[] = []; sync.subscribe(event => events.push(event));
    expect(sync.ingestEncryptedMessage({ ...message, content: 'private text' }, null).isUnreadIncrement).toBe(false);
    expect(sync.ingestEncryptedMessage({ ...message, envelope: null }, null).isUnreadIncrement).toBe(false);
    expect(events).toEqual([]);
  });
  it('does not count own sends, active conversation, or events at/before read watermark', () => {
    const sync = manager();
    expect(sync.ingestEncryptedMessage({ ...message, senderId: 'actor' }, null).isUnreadIncrement).toBe(false);
    expect(sync.ingestEncryptedMessage({ ...message, id: 'active' }, message.conversationId).isUnreadIncrement).toBe(false);
    sync.notifyRead(message.conversationId);
    expect(sync.ingestEncryptedMessage({ ...message, id: 'old', createdAt: new Date(0).toISOString() }, null).isUnreadIncrement).toBe(false);
  });
  it('clears actor-owned dedup/count state at account transition and logout', () => {
    const sync = manager(); expect(sync.ingestEncryptedMessage(message, null).isUnreadIncrement).toBe(true);
    sync.setActor('different-actor'); expect(sync.ingestEncryptedMessage(message, null).isUnreadIncrement).toBe(true);
    sync.setActor(null); expect(sync.ingestEncryptedMessage({ ...message, id: 'after-logout' }, null).isUnreadIncrement).toBe(false);
  });
});
