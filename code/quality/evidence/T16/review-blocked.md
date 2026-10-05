# T16 — BLOCKED after Antigravity review

T03-FIX5 PASS commit665f2530e80c7b892a01a43b8f43b58ec500e767. T16 does not PASS; T16-FE remains NOT_STARTED, dependency T16 unmet. Antigravity conversation e8329300-b94f-4885-8458-0c338acc44a2, requested Gemini3.6 Flash (High), two refactor loops. Codex stopped uniquely owned final process PID2440 after persistent review failures; exit -1. No third loop/model switch or production source repair by Codex.

Implemented draft files: apps/api/src/modules/presence/{presence.service.ts,presence.gateway.ts,presence.controller.ts,presence.module.ts}, minimal apps/api/src/app.module.ts wiring, apps/api/test/presence.integration.spec.ts. All changes remain uncommitted for review and repair. Frozen contracts/spec/design/predecessor tests must remain unchanged.

## Actual verification

- Task suite via npm API workspace:17/17 PASS (codex-green-task-refactor2.json).
- Full API root Jest regression:81/81 PASS,6 suites (codex-full-api-regression-v2.json).
- Codex independent session review:FAIL, exit1. Real PostgreSQL/Redis/Nest/socket scenario: subscribe authenticated user1, delete its session, send heartbeat. Heartbeat correctly rejected but GET game online still returns user1. Assertion expected false, received true. See codex-independent-session-review.txt/json and independent-review.spec.ts:716. Filtered run executes one new reviewer assertion;17 original copied tests were not rerun in that command and are covered by separate full regression.
- Final source typecheck completion, lint, owned test types and compiled CommonJS native acceptance proof are not complete. Missing npm typecheck script failure is retained; do not claim completion from empty v3 output.

## Remaining failures

1. Session/ban validation fails before heartbeat cleanup, leaving lease online. Delivery denial also removes local subscription without removing Redis lease. Repair all invalid actor/member lifecycle paths while preserving valid tabs.
2. Lease add/remove/sweeper still use multiple Redis commands with awaits; no Lua/atomic equivalent. Current two-instance test performs sequential disconnects, no renewal/disconnect interleaving, and cannot prove race safety. Implement atomic transitions plus deterministic concurrent behavior regression.
3. Pubsub still trusts payload status/online instead of rehydrating current server state; key components concatenate opaque IDs unencoded, and timers do not track/await in-flight sweep work on close. Inspect and repair before acceptance.
4. New regression assertions must have meaningful RED/PASS. Refactor2 evidence records a green suite but no complete new-feature RED run; retain earlier genuine RED and explicitly document remaining evidence gaps.

## Concrete next step for approval

Change T16 implementer to Codex direct repair within the existing allowlist; Anti2 stays observation-only. Keep all contracts/database/frontend/design frozen. Add behavior tests before fixes, prove revoked-session cleanup, atomic concurrent leases, current-state events, safe shutdown and namespace isolation. Run scoped lint/types,17 existing task tests plus new tests,full API regression,compiled native proof and scope/baseline/database audit. Codex may mark PASS only after actual evidence; then resume Antigravity for T16-FE in a fresh conversation.

Runner rule: "If Gemini 3.6 Flash (High) fails two review/refactor loops for the same core issue ... stop the task as blocked." Source C:/Users/PC/.codex/skills/antigravity-task-runner/antigravity-task-runner/SKILL.md, Failure Handling/Hard Limits. Persistent lease correctness after two review loops requires this stop; user decision is needed to change the current Antigravity-implements workflow.

Interrupted test cleanup: initial run left exact disposable schema t16_1791217801136_9dcuy6. Codex verified creation within owned run, exact fixture identities and zero messages, removed only that named schema. Evidence codex-interrupted-schema-cleanup.json. Public schema never migrated. Preserve failed initial audit and rerun audit separately.
