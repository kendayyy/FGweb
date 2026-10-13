# CHATCRYPTO-BE: existing ban producer prerequisite and ordering gate

Current checkpoint49: IN_PROGRESS, current full301/17, separate native room12,
admission16 and expiry backlog1. Main database/environment remain unchanged.

The API contract already reserves PATCH /api/v1/admin/users/:id/ban with the
existing AdminUserActionRequestSchema: BAN/UNBAN and optional reason up to300
characters. No new route or request shape needs invention. Current BE allowlist
includes moderation, chat-crypto, realtime, app.module and API tests. The crypto
API ownership paragraph explicitly includes moderation in the BE consumer scope.

However, .doc/task.md T37 assigns the ban/unban producer, and rule02 says:
"Không làm tính năng task sau trong task hiện tại." No moderation module or
moderation test currently exists; T37 is NOT_STARTED. A file allowlist alone does
not resolve this ordering requirement. Existing bare fixture BAN insertions prove
fresh denial but are not an actual producer that atomically advances epochs.

Proposed prerequisite if the user resolves the gate in favor of current BE:

- Implement only the already reserved ban route and its owning transaction as a
  crypto prerequisite in this same BE owner. Keep T37 NOT_STARTED and all report
  list/resolve/delete-message/general-admin UI work deferred.
- Exact prospective files: moderation/crypto-ban.controller.ts,
  moderation/crypto-ban.service.ts, moderation/moderation.module.ts under
  apps/api/src/modules; existing chat-crypto/crypto-membership.ts, app.module.ts
  and realtime/realtime.gateway.ts only if needed for actual post-commit revoke;
  new apps/api/test/chat-crypto-ban.integration.spec.ts. Existing contracts/schema,
  frozen PASS/checker/main/environment and media targets stay unchanged.
- Session/CSRF/sole-admin identity must use actual existing server authority.
  Enforce fresh admin session/BAN/role at the transaction boundary. Validate the
  locked action/reason shape and target, with no client grants or key access.
- BAN must atomically audit, revoke target sessions, advance affected private
  epochs and close active intervals; UNBAN must not restore old sessions or grant
  the banned history gap. Repeated actions must not duplicate intervals/epochs.
  Preserve encrypted device/recovery data and established legacy/cohort policy.
- Prove lock ordering and rollback through real PG waits, actual HTTP auth,
  existing SDK-backed routing/history and real socket revocation. Broadcast only
  after commit. No SQL triggers, fabricated auth/query/SDK success or T37 PASS.
- Native RED first against the actual existing application graph, then minimal
  producer code and scoped regression/build/lint/full native audit. Record every
  failure and review rebaseline only within the user-resolved gate.

Alternative: keep producer entirely at T37. Then BE cannot truthfully claim this
producer/epoch acceptance yet; preserve the open gate rather than change PASS or
implement a dormant hook and claim the actual producer is integrated.

Aggregate ingestion policy and periodic expiry capacity are separate open
operational decisions. The20,000-row backlog probe does not authorize numeric
quota/timer changes, production activation, off-machine custody or main cutoff.

## User resolution — 2026-10-10T06:18:59+07:00

The user chose "để vào task 37". Keep the actual ban/unban producer at T37; the proposed BE prerequisite above was not selected and is not authorized. The sequencing question is resolved. T37 remains NOT_STARTED and BE remains IN_PROGRESS; the producer/epoch acceptance remains unmet. No permission to waive that acceptance, change baselines/checkers, jump tasks or claim integration was given. The handoff requirements are recorded in .doc/task.md under CHATCRYPTO-BAN-T37-01 and T37. See ban-producer-t37-decision.json for metadata verification.
