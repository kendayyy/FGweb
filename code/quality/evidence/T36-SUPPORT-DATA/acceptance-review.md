# T36-SUPPORT-DATA — Codex acceptance review

The human chose authenticated-only support forms/chat in the actual reply recorded in human-guest-policy1.json. SUPPORT-AUTH-ONLY-01 updates only the previously open guest decision in spec16 and the task handoff. No guest support history or login-link authority is introduced. The reviewed entry preserves87priorPASS rows and the checker.

Shared strict contracts declare15 authenticated/admin routes and8 separate support socket payloads. User responses/events cannot contain notes/audit/account email; admin detail uses separate bounded pages. Actors/roles/owners/status/sequence are server-derived. Unicode title/body bounds, fixed receipt, ordered same-parent messages, receipt identities and status/read consistency are checked. Existing contracts/events remain intact. Endpoint metadata is not an implemented API.

Migration0025 and the matching Drizzle schema add five support tables. Reviewed owner/client and author/client uniqueness, per-request ordinal/initial-receipt uniqueness, explicit SQL-NULL guards in audit, composite message-cursor and note-author-audit foreign keys, UTC timestamps, request-child cascade and actor restriction protect persisted relationships. Table role strings do not grant admin authority; T37 must enforce current session/ban/owner/sole-admin at API/subscription/emission, monotonic reads, transactional allocation and receipt-after-commit.

Observed verification:

-39 contract REDs preceded source implementation; all305 current contract tests pass, including39 support cases and every existing assertion.
-12 actual missing-table PostgreSQL REDs preceded migration. Final serial database run passes30 tests across support14/auth/social16; fresh and populated pre0025 schemas, retry, concurrent duplicate creation, message retry rollback, Unicode, fixed bot receipt, cursor and note-audit isolation, status revision, SQL NULL and cascades are exercised.
- Source lint passes. Both packages compile from source-pinned owned copies; canonical outputs are adopted byte-for-byte through an exact reviewed transition. Nine canonical compiled export/metadata smoke checks pass.
- Final integrity driver checks every pinned original, all87 prior task rows, checker/environment/lock/baselines and stock gate; compares historical41table fingerprints and independently verifies all owned support test schemas absent. The separate final-integrity-review1.json contains actual counts, command pins and cleanup results and is mandatory for closure.

Failures remain unmodified: the initial stock gate rejected old spec lineage before reviewed entry; one post-implementation test attempt timed out before connecting to PostgreSQL, with teardown timeout. A fresh direct probe connected and found no support schema; final independent cleanup verifies that failed run's exact names and removes only its empty owned runtime. Root cause of the transient connection failure is not proven. Another run passed11/12; its wrong-author fixture reused an already-audited note and hit23505 first. A separate unaudited note now exercises the exact23503 assertion; no assertion or database constraint was relaxed. Original failed records remain.

Direct Codex review found no unresolved blocking source defect in this DATA scope. Existing schema/SQL pairs agree on columns, defaults, checks, identities, foreign-key delete actions and access indexes. Final acceptance requires the integrity record, successful fresh command hashes and ledger closure; this document alone does not set PASS.

No support backend/frontend/admin provisioning, main migration or production activation is claimed. The existing finite T36 human HTTPS runtime remains independent; its manual mobile acceptance and disclosed backend correlation limits remain unchanged. UI/E2E is not run in this data-only checkpoint. No Antigravity, Anti2, cockpit or delegation was used.
