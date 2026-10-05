# T12 — Lobby history and text realtime

Preflight verifies all predecessor evidence and five approved baselines. Ownership: chat/realtime modules, their native integration test, minimal AppModule registrations and T12 evidence. No schema/contracts/auth/UI changes.

Use shared request/event/DTO schemas. History is a descending exclusive (createdAt,id) cursor with at most50 entries; clients recover gaps by paginating from latest and deduplicating IDs. All seven seeded Lobby conversations are public. ROOM/DM always require current membership; room visibility does not grant access. Resolve cookie sessions afresh, reject invalid cookies, check exact canonical origin on socket connection and every event/delivery, and recheck bans/membership.

Text creation writes message and durable creation job in one DB transaction. Dispatch only committed jobs, bounded SKIP LOCKED batches with retries and ID-based dedup; resolve current ACL before each recipient. Do not implement T14 rich attachments/reply/mentions yet; reject those references explicitly rather than silently ignoring them. Native Nest/Socket.IO + PostgreSQL tests cover guest, isolation, tied cursors, reconnect beyond50, concurrent sends, failed transaction no event, replay/ban/revocation and private delivery. No synthetic socket load proves media capacity.
