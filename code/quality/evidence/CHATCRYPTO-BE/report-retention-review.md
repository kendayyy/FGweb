# CHATCRYPTO-BE — expired report evidence

This continues the same backend owner. Only report evidence whose persisted expires_at has elapsed is swept. No production retention duration, main database cleanup/migration, custody deployment or later task was introduced.

## Behavior and ruling

Ruling: use a separate report sweep with the existing explicit 8MiB representation store, rather than mixing report ciphertext with private storage's 5MiB budget. Stored consent expiry determines eligibility. Deletion requires no Transit reader or private E2EE keys. Moderation root reports and private source messages remain; encrypted evidence, consumed report-image drafts, their source bindings and associated ciphertext files are deleted after expiry. Root routing metadata remains for moderation and must not be presented as retained evidence.

Each transaction selects at most 100 expired evidence rows FOR UPDATE SKIP LOCKED. Across those parents it removes at most 100 unlocked draft objects. A parent remains while any referenced draft remains, including a locked draft or a draft beyond the current file budget. Parent locks serialize another sweep and future compliant readers. The future admin-reader implementation must check expires_at and hold the same parent boundary; no reader route is claimed here.

Bytes are removed before draft/evidence metadata. Filesystem refusal rolls metadata back. A database fault may restore metadata after expired bytes were removed; ENOENT then permits a safe retry. Live evidence, original private sources and unexpired image objects are preserved. Source-binding rows follow the established draft deletion cascade. No report plaintext is decrypted, logged or copied.

A 60-second unref'ed timer avoids overlapping periodic sweeps, emits only a generic warning on failure, and shutdown clears the timer and awaits its tracked sweep before ending the pool. These lifecycle paths are implemented; dedicated timer/fault/shutdown verification remains open. Main AppModule crypto activation remains disabled.

## Evidence

- report-retention-red-1: five new failures because cleanup was absent, fourteen existing cases passed.
- report-retention-green-1: eighteen passed; one fixture SELECT used id rather than the binding's upload_id (PostgreSQL42703). Production was not changed in response to that fixture error.
- report-retention-green-2: twenty passed with actual API/PostgreSQL/native Matrix source/Transit TLS/filesystem, including expiry/no-op retry, live/root/source preservation, locked parent/draft skips, real filesystem refusal, actual PostgreSQL delete-trigger rollback and retry.
- 101 expiry-row clones prove a 100-evidence batch. 101 real owned files/draft/source-binding rows prove a separate 100-file budget and delayed parent deletion. These structural fixtures reuse native ciphertext and do not claim valid per-clone cryptographic bindings. Independent native custody/binding assertions remain in the same suite.

The full native API regression, build/type/lint/diff/audit results are recorded separately. Failed attempts and hashes remain preserved. No broad test was skipped or weakened.

Fresh report-retention-regression-1 passed 176/176 across eleven suites. Its native result confirms TLS/role/binding/audit/restart/rewrap/revocation/outage probes and owned fixture cleanup. The report-only review passed 20/20. Final command exit codes and artifact hashes are recorded in tasks.json; these are progress evidence, not complete backend acceptance.

## Remaining acceptance

Production retention policy and expiry performance/index benchmarking, audited admin read, report key rotation/restore/provisioning, timer fault/shutdown probes and general orphan detection remain open. Lobby integration, legacy reconciliation, private realtime production wiring, notification workers/PUSH/preferences/wakeups, moderation integration, ingestion quotas and full security review also remain open. CHATCRYPTO-BE remains IN_PROGRESS.
