# CHATCRYPTO-BE — consented report image progress

This continues the existing backend owner. It supersedes only the image-unimplemented limitation in report-text-review.md. CHATCRYPTO-BE remains IN_PROGRESS; no later task, production wiring or main database migration is authorized by these results.

## Additive source binding

The existing REPORT_AEAD draft requires message_id=NULL and cannot express its original source. The persisted broad scope permission was applied to ten exact database source/test/migration/derived paths in scope-report-upload.json. Migration0014 introduces a draft-to-source-message binding and keyed retry fingerprint, with mode/conversation/immutability enforcement. Abandoned draft deletion cascades its binding; source deletion is restricted. DATA PASS and all historical PASS records remain unchanged. The journal preserves its original fourteen entries, snapshot0014 adds exactly one table and preserves all previous definitions, and migrations/snapshots0000–0013 retain their original hashes. Only the new migration uses search_path-relative FKs to support isolated schemas. No backfill or main database migration was run. The stock successor gate is still required at backend closure.

Actual PostgreSQL source-binding tests progressed from five missing-table failures to five passing cases and an 82/82 database regression. The first RED was a configuration-path failure, not behavioral evidence. Generation, database build and structural review are separately recorded.

## Runtime behavior and evidence

The multipart upload requires explicit consent and a reconciled live E2EE IMAGE source. Current session/ban/membership and historical source interval are checked under shared epoch/source locks. PNG/JPEG/WebP signature and declared MIME must agree; inputs are limited to 5MiB and 20 million pixels. Sharp rotates to the displayed orientation, writes WebP and strips metadata. Native source fixtures use Matrix Megolm and encrypted attachments; the report server does not decrypt the original private source. Submitted image/text remain user-supplied, unverified evidence.

Normalized report images are encrypted under the independent fg-report writer. AEAD identity binds reporter, conversation, source and upload ID. The public identity SHA256 binds metadata only; it does not hash private image pixels or introduce an E2EE protocol. Retry equality uses HMAC-SHA256 with the existing server auth secret over a domain, identifiers and raw input bytes. No unkeyed input-image hash or filename is persisted. Secret rotation invalidates old retry identity, requiring a new client upload ID; dedicated custody/key-rotation policy remains open.

Ciphertext envelope JSON may exceed input size due to encoding, so only the report object store explicitly accepts up to 8MiB. Private storage retains its 5MiB default. Actual filesystem review checks both boundaries and rejects oversize/invalid budgets. Draft metadata and ciphertext size/SHA/canonical envelope bytes are verified at both claim and retry. A missing/corrupt-file retry first reproduced a false successful receipt (one failed case), then passed after integrity verification was added.

Claim checks owner, exact selected source, current revision, expiry, no prior consumption and no repeated image IDs. Report/evidence creation and image consumption occur atomically. Wrong-owner/source/epoch/expired/tampered input fails closed. Native KMS denial and actual PostgreSQL insertion faults leave no orphan object or committed metadata. Report image IDs are included only inside encrypted evidence. The private attachment read route cannot retrieve report objects.

Native image review progressed from route/claim failures to 13/13 and then 14/14 with retry integrity. Initial claim failures depended on unavailable upload receipts; those are retained as cascading failures, not independent bug claims. The full regression and latest builds/types/lint/diff/audit command records are linked from tasks.json after completion. Native TLS, role separation, denied binding substitutions, audit plaintext absence and fixture cleanup are verified by report-native.mjs.

The first full image regression had 169 passing cases and one filesystem test timeout. Jest deep equality walked a buffer larger than 5MiB; the review assertion now uses native Buffer.equals plus exact length, preserving whole-byte comparison and the 15-second limit. No production code or failure assertion was relaxed for that fixture issue; the failed run remains recorded.

The subsequent full native regression passed 170/170 tests across eleven suites (codex-report-image-regression-2.json). Its report-regression-image-2-result.json confirms TLS, role/binding denials, audit plaintext absence, restart/rotation/rewrap/revocation/outage probes and fixture cleanup. The database regression passed 82/82 across ten files. Native report-only review passed 14/14. Build/type/lint/diff/audit exit codes and hashes are recorded separately; these counts do not establish complete backend acceptance.

## Remaining acceptance

Audited admin report reading, custody provisioning, report retention/delete/rotation/restore, Lobby integration and client-assisted legacy reconciliation remain open. Production private realtime wiring, wakeups/notification workers/PUSH/preferences, moderation integration, ingestion quotas, cleanup/performance/timer fault review and complete security review remain open. This document records tested progress and does not establish backend PASS or production readiness.
