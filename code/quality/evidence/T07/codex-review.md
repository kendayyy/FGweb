# T07 — Codex direct review: PASS

Baseline: ac67baf5bd790016707cad04fcc96249f766fc37. User stopped the Antigravity runner and requested “chạy t07”; Codex resumed this task directly. Historical executor scope violation and failed runs are retained, rather than treated as successful closeout evidence. No new Antigravity session or later implementation task was started.

## Reviewed implementation

Three schema files, source exports, new migration 0003 and snapshot/journal implement calls, notifications/outbox and moderation storage. Calls keep room membership, playing roster and call membership separate. Active call membership requires membership in the same room and an OPEN call, is unique per user across calls, and uses bounded seats 1–10. Generated active/state values free seats after leaving while preserving history. Publish slots are bounded 1–3 and reference active members; external live configuration permits one supported provider per call and requires an active member. Restrictions persist across leaving; webhook event IDs are unique. Actual signatures, admission tokens and media processing belong to later backend tasks.

Notification and outbox keys are mandatory and deduplicated. Outbox recipients must match the notification owner; preferences restrict email to approved types. Reports require the correct USER or MESSAGE foreign key shape, including rejection of mixed targets. Administrator identities remain mandatory and referenced audit rows block hard deletion of their identities. This is relational protection for later soft-delete workflows, not a claim that raw SQL UPDATE or DELETE of audit rows is impossible.

Reviewed SQL and snapshot agree; generation reports no additional schema changes. Old migrations and T04–T06 tests were preserved, including T05 reply-column-only SET NULL and T06 deferred owner FK. The previously approved test/hook timeout extension to 30 seconds accommodates the real local PostgreSQL integration harness; no product latency threshold was relaxed.

## Fresh verification

final-verification.json records actual commands, UTC times, working directory, exit codes and SHA256 hashes of raw output. Acceptance: 13/13; database regression: 36/36; independent T07: 11/11; independent T05: 2/2; independent T06: 12/12. Database build, source/test typecheck, lint and migration consistency checks exited 0. Following the full run, Codex added exact preservation of seven Lobby rows to the populated migration test and reran all 13 T07 tests, typecheck and lint successfully. Earlier command records and logs remain intact.

Real PostgreSQL two-client transaction races prove exactly one winner for the last call seat, third publish slot and same user joining two calls. Populated prefix 0000–0002 data are snapshotted before applying 0003 twice: identity, seven games, seven Lobbies, DM/chat, private rooms/members and playing sessions/rosters/active slots remain identical. Fresh database migration and webhook dedup are also exercised. Fixtures use owned random schemas and guarded temporary folders, with cleanup errors surfaced.

Initial independent failures and the first refactor's remaining MESSAGE-target failure are retained in codex-regressions-red.txt, codex-expanded-red.txt and codex-loop1-review.txt. The final independent run additionally verifies a valid MESSAGE-only report, so rejection tests do not merely prove all reports are forbidden.

## Preflight and boundaries

The resumed T07 gate rejects three changed predecessor-owned shared files while T07 is unfinished: index exports, migration journal and database test config. predecessor-audit.txt verifies unchanged five-document baseline, prior PASS evidence hashes and all other latest predecessor outputs. Their reviewed changes are legitimate T07 additions, and T07 records their new output hashes; no old output hashes, baseline or checker rules were altered. T08 gate is the final check after ledger closeout.

Root npm test includes a future API Jest suite with no tests yet; this review claims task-scoped verification only. OAuth routes, email/push delivery, SFU enforcement, PWA and 1,000 concurrent media users are not implemented or certified by database tests. No secret output, dependency replacement, production migration, purchase or deployment.

The final `npm run task:check -- T08` exited 0 and confirmed prerequisites, unchanged baseline, evidence hashes and task scope; raw output is next-task-gate.txt. T08 remains NOT_STARTED.

Next task: T08 (Discord authentication and session guards).
