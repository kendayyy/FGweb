# T07-FIX1 — durable chat outbox prerequisite

Rule05 requires committing domain writes and an outbox in the same transaction before realtime broadcast. Existing notification_outbox requires a notification/user/channel and cannot represent public Lobby message delivery. Adding chat events there would invent notifications and violate its constraints. T12 cannot change a closed database owner or silently omit this prerequisite.

Add realtime_outbox with opaque event ID, message/conversation composite FK, eventName message.created, attempts>=0, createdAt and nullable deliveredAt. Unique message/event prevents duplicate jobs; a pending chronological index supports bounded SKIP LOCKED dispatch. Store message identity, not duplicated private payload or credentials. Message deletion cascades its undelivered creation job; no room/session lifecycle changes.

Only schema/export, additive migration and reviewed generated metadata, actual PostgreSQL migration/constraint tests and owner evidence are in scope. Existing SQL migrations remain immutable. Test both an empty database and upgrading a seeded four-migration schema, atomic message/outbox rollback, cross-conversation FK rejection and duplicate-event rejection. No real/public schema migrations. User authorization for direct repairs/sequential remaining work applies; no product or provider change.
