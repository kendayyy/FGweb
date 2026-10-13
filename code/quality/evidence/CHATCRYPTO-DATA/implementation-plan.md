# CHAT-CRYPTO-01 — approved execution plan

Human approved Matrix WASM + OpenBao in this thread on 2026-10-08.
Code is confined to code/. Codex executes sequentially; no delegation.

1. **T01-FIX4 setup prerequisite**: suspend DATA; freeze existing source,
   parent WIP, prior PASS records and main environment. Install exactly
   @matrix-org/matrix-sdk-crypto-wasm 18.6.0 in @fg/web. Check registry
   integrity against lock, unchanged previous dependency versions, native
   WASM runtime compatibility, web typecheck/build and lint. Record actual
   command exits and review before PASS. No feature implementation.
2. **T02-FIX3 service prerequisite**: only after T01-FIX4 PASS. Pin OpenBao
   2.7.1 image digest; isolated TLS/storage/service-account configuration.
   Test Transit encrypt/decrypt, tamper rejection, RBAC, rotation/rewrap,
   sealed/outage behavior, persistence/restart and private-key separation.
   Native Matrix two-device encryption/verification/restore/rotation probes
   must establish adapter feasibility. Browser probes are headed. No main
   DB migration or production key provisioning. Missing GUI/service is a
   real blocker, not a fake success or a reason to skip setup.
3. **CHATCRYPTO-DATA**: resume only after setup PASS and adoption of setup
   outputs with provenance. Contracts RED for strict ciphertext/device/
   revision/migration payloads and bounded encrypted attachments. Database
   tests RED on isolated actual PostgreSQL; additive migration, constraints,
   membership intervals, ciphertext/public-key queues, recovery ciphertext,
   legacy states/idempotence. Preserve IDs/cursors/data. Review all tests,
   lint/typecheck, freeze evidence and stock next-task gate before PASS.
4. **CHATCRYPTO-BE**: pin actual chat/realtime/social/rooms/uploads producer
   paths before opening. Tests RED for routing/ACL/revision/device revoke,
   Transit failures, no plaintext in outbox/logs/push, migration reconciliation
   and report consent. Native API/DB/object/socket tests, then review/PASS.
5. **CHATCRYPTO-FE**: pin actual direct-messages/lobby paths. SDK adapter,
   trusted-device verification, independent recovery, new-member history,
   client-side image validation, selected report preview, migration UI.
   RED behavior tests; actual headed multi-context integrations with API/DB;
   keep approved light/dark design and auth/call/composer state.
6. **CHATCRYPTO-QA**: threat-model attack cases, SDK/browser interoperability,
   legacy private fixtures, backup/restore key separation, regression and
   security review evidence. No global E2EE claim while legacy plaintext
   remains unresolved. Only then continue T29; media target unchanged.

Old PASS records, source baselines and checker are immutable. Setup uses
the existing manual T00–T02 followup precedent, with DATA suspended and WIP
frozen; parent adopts reviewed setup outputs before its stock closure.
No purchases, production publication or destructive main-data cleanup.
