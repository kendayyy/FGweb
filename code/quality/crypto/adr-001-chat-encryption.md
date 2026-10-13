# ADR 001 — FG chat protocol and migration

Status: approved technology choice, DATA protocol/schema review complete; application BE/FE/QA are pending.
Human selected Matrix WASM + self-hosted OpenBao on 2026-10-08.
This ADR locks the DATA/BE/FE boundary. It does not claim the FG application
already encrypts messages end to end.

## Protocol and identity

- Exact SDK: `@matrix-org/matrix-sdk-crypto-wasm` 18.6.0, locked integrity.
  Use native Olm sessions for device messages, Megolm for DM/group messages,
  native SAS/cross-signing for trust, and the SDK's encrypted room-key export.
  Do not implement replacement key agreement, signatures, KDFs or ratchets.
- FG is an authenticated relay, not a federated Matrix homeserver. Map FG user
  IDs to `@fg_<sha256(UTF8 userId)>:fg.invalid` and conversations to
  `!fg_<sha256(UTF8 conversationId)>:fg.invalid`. SHA256 here only creates
  stable public identifiers; it is not an encryption algorithm. Return these
  identities from the state/key APIs. Reject client-selected foreign identities.
- Self-signed device registration is separate from signature additions. Before
  merging additions, compare the unsigned canonical public payload with the
  registered payload and verify the signature through the native protocol.
  Never replace public device keys under an existing device ID. Revoke and
  register a fresh identity on a new device; no server-controlled verified flag.
- Queue native encrypted Olm events, bounded SAS metadata and key-withheld
  metadata separately. Preserve SDK transaction IDs and `org.matrix.msgid`.
  Strict schema checks are structural guards, not cryptographic authentication.
  Do not expose plaintext room keys, private signing keys or device secret exports.
- Upload/replenish signed one-time prekeys atomically; claim each at most once.
  Unknown/depleted keys fail visibly. This relay does not silently substitute
  an unsigned key, a server-generated session or reusable fallback key.

## Membership, sessions and decoded content

Every membership, kick/ban or eligible-device change increments the conversation
revision in the same transaction as the membership change and ACL invalidation.
Membership intervals are durable. Start a new outbound Megolm session before
sending at the new revision. SDK history visibility is Joined, sharing strategy
is onlyTrustedDevices. New members receive current sessions, never old sessions.
Rejoining users do not receive keys for the interval during which they were out.
Retained old keys cannot be remotely erased from a user's device.

The server binds each first-seen session ID permanently to conversation,
sender device and membership revision in `chat_crypto_outbound_sessions`.
Register/compare this binding in the message transaction; reject reuse at another
revision/device/room. Keep tombstones and revoked device identities. Do not delete
and re-create them to evade replay checks. Authorized membership is checked again
at queue read, attachment read, sync, socket delivery and reconnect, not just send.

Inside ciphertext, `CryptoDecryptedMessageSchema` binds conversation, sender,
device, clientMessageId and revision. After native decryption, compare these with
authenticated SDK sender information and the outer message; reject disagreement.
Reply previews, mention lists, filenames, MIME/dimensions and attachment keys
exist only inside this decoded content. Render body as text, never untrusted HTML.
Generic push/outbox notices carry identifiers only; never private previews.
Server message ID/cursor/time, sender, size, membership and reply relationships
are metadata; E2EE does not conceal all traffic patterns.

## Attachments and reporting

Use the Matrix v2 encrypted-file descriptor (native-standard AES-CTR/JWK key,
IV and SHA256 integrity) inside Megolm content. Validate/decode/re-encode allowed
images on the client, enforce the approved image limits, then encrypt bytes.
The server checks ciphertext quota, declared/actual size, SHA256, uploader,
conversation, current revision, expiry and atomic draft consumption. It cannot
inspect private image pixels. On download the client checks digest, descriptor,
decryption and decoded limits before rendering. No thumbnail or plaintext fallback.

`chat_crypto_upload_drafts` keeps opaque server object keys and ownership/digest
after binding. E2EE ciphertext is capped at 5 MiB; server-encrypted Lobby/report
objects may need up to 8 MiB for Transit representation of an allowed source.
Never treat representation overhead as permission for a larger source image.
No source filename or private descriptor is stored in a private upload draft.

Reporting is an explicit disclosure: select messages/images, preview, then consent.
Only that selection crosses the E2EE boundary. Report images require consent and
an authorized source message, validated/re-encoded server-side, then encrypted
under `fg-report`. Bind drafts to reporter/evidence atomically; expire abandoned
drafts. Admin reads require the existing single-admin ACL and a matching consented
evidence record. Reports never grant access to the original private conversation.
Report-derived text/images have their own retention and authenticated object path;
do not reuse a public upload URL or attach unselected/decrypted cache content.

## Recovery and Lobby custody

Recovery exports are encrypted by the SDK using a separately generated high-entropy
recovery code held by the user, not the account password. Server backup uses CAS
versioning and ciphertext only. Password reset/login cannot decrypt it. Wrong or
lost recovery code fails without a server plaintext copy. Imported room keys
restore previously possessed history, not a cloned device identity: a new device
still needs explicit trust verification for future sharing. Imported keys remain
marked imported; recovery is not proof of current member/device trust.
Trust/private cross-signing material remains in encrypted device-local storage;
the room-key recovery export does not back up that identity material.

Lobby remains public. Store its text/images encrypted with OpenBao Transit
AES256GCM under `fg-lobby`, then decrypt only through authorized app paths.
OpenBao 2.7.1 digest/TLS/Raft/AppRole/audit configuration is in the reviewed setup.
Separate app decrypt permissions from operator rotation/rewrap and report access.
DB/object backups contain ciphertext; independently protected Raft/unseal custody
must not be placed in the same backup. No dev root token in production. Sealed,
outage, tamper, expired/revoked credentials and rotation failures are errors,
never successful empty messages. Production custody/restore is verified at OPS.

## Additive migration and compatibility

Migrations 0008–0013 add state, intervals, devices/prekeys/public identities,
encrypted queues/recovery, consented evidence, upload drafts and immutable sessions.
Existing messages/images/IDs/cursors/members remain intact as LEGACY_PENDING.
No invented membership history or automatic old-key grant is backfilled.
The main application database has not been migrated by DATA.

BE must close legacy plaintext producers before activating any private crypto API.
Legacy private content is available only through explicit migration APIs, to an
existing member/device in a verified historical cohort and current authorization.
If historical membership is unknown, stop that cohort for explicit reconciliation;
being a current member alone never proves entitlement to old messages/images.
No normal history/image/socket/cache endpoint may fall back to that plaintext.
Read source bytes through cohort-bound legacy image routes; bind original content,
attachments and identifiers to a canonical SHA256 migration digest.

Client-assisted migration uses SDK-encrypted keys and the same verified original
cohort, preserving original IDs/times/cursors. Commit requires revision, source
digest and cohort; lock original rows and consume receipt/drafts transactionally.
Conflict or changed membership aborts. Prepared ciphertext is not reconciled
until client roundtrip, source/digest/count/object parity and access tests pass.
Lobby backfill uses Transit; private backfill never uses server AEAD as E2EE.
Keep recoverable, encrypted source backups outside plaintext production paths
until parity/security review; do not drop the database or discard old content to
claim a pass. Cutoff is per conversation only after reconciliation and removal
of plaintext sources/cache/outbox/objects. Rollback retains maintenance/error
mode and ciphertext; it never reopens plaintext endpoints to newer members.
Global E2EE claim requires QA evidence that no private legacy plaintext remains.

## Threat model and validation boundary

Protect against DB/object-only compromise, unauthorized users/admin/helpers,
stale/revoked membership/devices, replay/tampered ciphertext, insecure key sharing,
wrong recovery and unintended report disclosure. Device verification detects
relay key substitution; never automatically verify a device because the server
returned it. XSS/compromised client, a user disclosing keys/content, screenshots
and a malicious served web application are residual risks. Enforce CSP, dependency
review, text rendering, browser storage separation, no secret logging and session
cleanup. Device-local encryption does not defeat malicious JavaScript executing
while its user has unlocked the store. Lost keys without recovery lose history.

DATA native probes verify protocol/schema/SQL feasibility. BE verifies native
API/DB/object/realtime/worker paths; FE uses headed multi-device FG integration;
QA performs attack/legacy/backup/cache/bundle regressions. Neither setup probes
nor chat socket load prove the 1,000 concurrent voice/live target. Media remains
unchanged and is measured separately. No independent integration audit is claimed
solely because a protocol library has previously been audited.

References: https://spec.matrix.org/v1.17/client-server-api/#end-to-end-encryption,
https://github.com/matrix-org/matrix-sdk-crypto-wasm/releases/tag/v18.6.0,
https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/OlmMachine.html,
https://openbao.org/docs/secrets/transit/,
https://openbao.org/docs/configuration/audit/.
