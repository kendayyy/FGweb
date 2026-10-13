# CHATCRYPTO-BE — realtime and generic DM notification progress

Current task stays IN_PROGRESS. Current owner adopts exact additive contract
files through scope-realtime.json under the persisted broad scope permission;
it is a prerequisite subphase before producer implementation, not a reopened
DATA PASS or a parallel task. Original snapshots, PASS records and checker stay.
Stock next-task gate remains mandatory before complete backend closure.

Contracts: eight behavioral RED failures for missing encrypted events/schema;
170/170 full contracts GREEN, followed by a build and original-byte audit of
all unrelated derived files. Strict device-bound subscribe/unsubscribe/ACK and
crypto.message.created use the shared schemas. Legacy message.created is unchanged.
Requests are tiny; existing 16 KiB inbound socket budget remains. Ciphertext sends
use the bounded REST route. Socket output uses the bounded EncryptedMessageSchema.

Native API/PG/Redis/Socket.IO/WASM: RED four missing-handler/delivery failures
then GREEN four cases. Expanded review reproduced delayed-history subscription
loss and mixed legacy/crypto quota overflow. A third failure was cascading from
quota setup; fixture cleanup now runs in finally, with assertions unchanged.
New history filtering returns no payload while preserving an authorized channel;
revoked sessions/devices/membership still invalidate that channel. Combined quota
is 32. The expanded eight native cases pass, covering guest/outsider/foreign
device, opaque-ID Redis, REST recovery, native ciphertext decryption, new-member
history, ban/unban, device revoke, membership removal/rejoin and durable logout.

Disconnect probe: first probe did not guarantee server-side disconnect before
release of the PG epoch barrier. The second waits for actual server disconnect.
Neither reproduced retention in this harness; no production fix or causality
claim is made for that probe. The record remains part of coverage, not a RED bug.

DM notification: native RED missing generic notice/job; two RED failures after
adding an actual PG failing trigger for notification jobs. GREEN 39/39 combined
device/realtime cases. Dedup is message-bound inside the ciphertext transaction;
notice body/title are generic, data contains only conversation/message/sender IDs.
Jobs use the existing IN_APP producer convention. No ciphertext, private filename,
key or decoded content is put into notifications. Notification failure rolls back
the new message/realtime outbox. PUSH/preferences/mentions/notification delivery
workers remain unimplemented acceptance, not claims from queue creation.

Redis publishes durable committed message IDs only. The existing internal outbox
creation label remains message.created because its frozen DB constraint permits
only that label; wire event selection reads the committed encryption mode. No DB
constraint change or ciphertext through the legacy wire schema is performed.
Delivery rechecks session, ban, membership, active device and membership interval
in a recipient transaction. The authorization transaction is the linearization
boundary; a pre-revocation authorized delivery may already be in flight. Network
delivery is at least once and clients must deduplicate by message ID in FE.

Crypto provider is optional in the existing gateway until activation. Native
fixture imports the actual provider. Production module wiring and main migration
remain explicitly pending; no live app E2EE or main deployment claim is made.
Protocol to-device/SAS sync is durable REST polling; realtime wakeups are pending.
Lobby/report custody, legacy reconciliation/restore, moderation epoch integration,
quotas/retention/orphan cleanup and security review still prevent backend PASS.

Ruling cost: adopting additive contracts into the active owner makes its closure
responsible for replacement hashes and consumer compatibility. Failure of that
ownership audit or stock next gate blocks PASS; historic output hashes are never
rewritten to make the checkpoint appear complete.
