# CHATCRYPTO-BE — membership and concurrency review

Codex executes this backend task directly in `E:/FGweb/code`. This is an
in-progress review, not backend acceptance or production activation.

## Verified behavior

- Empty private conversations activate with known current-member intervals.
  Legacy private plaintext remains intact behind `LEGACY_PENDING/UNKNOWN`;
  old endpoints cannot bypass reconciliation.
- Team admission, room invitation approval, kick, self-leave, rejoin and forced
  rollback update membership and the epoch in the owning transaction. Existing
  members/retries do not create duplicate intervals or epoch changes.
- Dissolution and last-owner leave revoke access while preserving ciphertext,
  outbound session bindings and closed history intervals. Removed members do
  not receive the history gap on rejoin.
- `sync-order-red-1` reproduced an HTTP 500 between two recipients processing
  opposite conversation orders. Sync now reads both queue pages, acquires all
  selected conversation states in database ordering, then filters by live
  membership, device eligibility and epoch. Original queue order and signed
  microsecond cursors are retained. `sync-order-green-1` passed 24 native tests.

## Admission / activation lock inversion

Activation owns the conversation row while initializing intervals. Interval
inserts reference the immutable user IDs. The old admission path owned user
rows with `FOR UPDATE`, then its conversation-member FK waited for activation.
Activation's user FK in turn waited for admission, causing a deadlock.

The first probe had an invalid play-session seed and the next probe initially
watched the wrong query boundary. Those failures are retained and are not
behavioral RED. The corrected direct service probe detected a conflict; the
final `activation-race-api-red-1` used the actual HTTP approval endpoint and
reproduced HTTP 409, with 25 other tests passing. The fixture uses actual
PostgreSQL wait boundaries, not timing-based success or a mocked service.

Teams and Invitations now serialize user operations with `FOR NO KEY UPDATE`.
They never change user IDs. This mode still conflicts with another such mutex
and with user update/delete locks while allowing FK `KEY SHARE` references.
The conversation/epoch locks and all capacity, consent and retry checks remain.
`activation-race-green-1` passed all 26 tests including the unchanged admission
and interval assertions through the real API.

Lock-mode rationale: [PostgreSQL row-level locks and conflict table](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

## Additional review

`sender-fk-red-1` separately reproduced device DELETE returning HTTP 500 when a
ciphertext insert reused an existing outbound session. The device transaction
owned the user row and waited for the epoch; the message transaction owned the
epoch and waited for its sender FK. The device mutex now also uses
`FOR NO KEY UPDATE`. `sender-fk-green-1` passed all 27 native tests: the message
commits before revocation, revocation advances the epoch, and old-epoch retries
are rejected. The full affected regression is recorded separately.

Full backend acceptance still requires private realtime/notifications,
Lobby/report Transit custody integration, legacy reconciliation/restore,
remaining ban producer integration, quotas/cleanup and security review.
Main AppModule crypto wiring and main database migration are not performed.
