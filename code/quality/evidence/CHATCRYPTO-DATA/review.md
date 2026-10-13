# CHATCRYPTO-DATA review

Codex direct implementation/review under the user's approved Matrix/OpenBao and
persisted broad-scope authorization. One checkpoint at a time; no delegation.

## Acceptance

- Shared strict contracts/route registry, native Olm/Megolm/SAS/cross-signing,
  separately encrypted recovery, decoded binding/attachment/reply/mention schemas.
- Additive state, intervals, public identities/prekeys, queues, consented evidence,
  private/Transit object drafts, historical cohorts/receipts and immutable sessions.
  Fourteen journal entries, original 0000–0007 unchanged. Empty and populated
  native migration/reapplication preserve legacy IDs/content/images/cursors/members.
- ADR locks threat model, trust/membership/session policy, client-assisted cohort
  backfill, reconciliation/cutoff and rollback without plaintext fallback.
- Main database remains unmigrated; schema-only fixtures cleaned. This checkpoint
  does not claim FG application E2EE, end-user migration completion or 1,000 media.
- 162/162 contracts, 77/77 native database regression; 18 crypto DB cases included.
  Native SDK has eleven verified flags plus rich-content roundtrip (117,844 base64
  ciphertext characters), wrong-code/tamper/cross-room/verification/history checks.
  SDK probe is a labelled fixture relay, not a production adapter or browser UI.
  Reviewed setup's headed browser/TLS/OpenBao checks remain independently frozen.
- Contracts/database build, API/web no-emit types, lint and scope/baseline/security
  audit pass. Stock next-checkpoint gate is required in closure before PASS.

## Review corrections and retained failures

DB startup failures are environment failures, never counted as RED. Healthy RED
actually reproduced missing contracts/tables. Review reproduced SQL CHECK NULL
bypasses, missing/wrong ciphertext, hidden private metadata, JSON scalar coercion,
public-key/recovery shape gaps, attachment downgrade and nullable receipt timestamp.
Strict guards/constraints/ownership/expiry and session binding now pass.

Native SDK exposed withheld metadata (not a SAS transaction), SAS accept without
redundant method, Olm msgid, base64 cross-signature IDs and signature additions that
are distinct from self-signed registration. Support exact documented fields; do
not weaken registration or allow arbitrary plaintext/private-key extensions.
Server canonical identity comparison/signature validation remains a BE obligation.

Initial base64 budget and image dimensions could reject legitimate rich/image
content. Preserve 2,000-character body, 5 MiB source and existing 10,000px/20MP;
bound decoded UTF8 to 90 KiB, Megolm base64 to 131,072 chars and future crypto
envelopes to 192 KiB. Genuine SDK rich roundtrip verifies the budget. Limits on
original public routes remain unchanged; no unbounded parser or media load claim.

Preserve all command attempts. Native-sql-red-1 was a test syntax error; red-2
reproduced the missing SQL guard. Lint caught one unnecessary regex escape, fixed
without semantic change. A mutation helper initially encountered an already fixed
receipt condition; corrected its idempotence and kept its failed record.
contracts-build-2 returned a session while native-interop-2 was launched before
completion: Codex sequence mistake. Keep actual timestamps; later builds/probes
waited for completion. No future task ran in parallel.

Drizzle generate-6 misleadingly exited zero after an UNKNOWN Windows file-write
error: its snapshot existed, journal/SQL did not. generate-7 detected no change
because of that partial snapshot. Neither is a successful migration-generation
claim. Preserve the owned partial snapshot, leave journal through 0012 untouched,
then generate-8 created complete 0013; native empty/populated/reapplication and
final journal/artifact audit verify the repair.

Original T07 SELECT * equality needed the three approved additive message defaults
while preserving every original field; explicit exact expectations strengthen
migration verification. T05's former default five-second I/O window was too short
for fourteen migrations. Use runner timeout 30s, unchanged source/assertions.
Focused 23/23 and full 77/77 pass. See regression-compatibility-review.md for the
precise rationale; no partial match, skip, snapshot substitution or data deletion.

Historical pending proposal templates stay as history; authorization.json,
setup-adoption.json and the ADR record the actual approved choice. No old PASS,
credentials, live spec/design/task baseline, checker or unrelated source rewrite.

## Subsequent gates

BE must implement every actual producer/consumer path and atomic ACL/revocation/
session/draft checks, native objects/realtime/workers/Transit and legacy migration.
FE must implement trusted-device UX, decoded-binding validation, encrypted image
validation, independent recovery and headed multi-device actual FG integrations.
QA must reconcile legacy private plaintext and verify attack/cache/log/bundle/
backup/report flows before claiming complete E2EE. Production custody, physical
devices and media capacity remain their original later checkpoints. Do not use
these DATA fixture results as substitutes for those gates.
