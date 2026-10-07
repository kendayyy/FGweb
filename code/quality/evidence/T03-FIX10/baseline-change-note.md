# Unexpected spec metadata change during verification

Read-only git diff and SHA check observed .doc/01-product-spec.md changed outside this task: only its update date went from04/10/2026 to07/10/2026. Observed SHA E09CB0B7DC0953436F9B81B8221610F9B8FC0C7352E1DF52A94822071FDEB2CF; approved baseline7041323FCAFE84BF51B080DB1EFDA6E151AD9253D6547DF4ADCEA79FB1901C83. No task script writes this spec. Do not attribute the change to an actor without evidence; do not silently update the baseline/checker or revert an external edit.

User decision requested: restore the original date (preserves the reviewed baseline) or keep new metadata through an explicit baseline-owner task. Contract tests81 pass, but the current prerequisite may not freeze PASS until this discrepancy is resolved and audit/gate rechecked.

The first scope audit additionally caught an untracked apps/web/tsconfig.tsbuildinfo emitted by tsc -b --noEmit. This was an agent-generated build artifact, not a user source change. Removed only that exact file and reran ordinary frozen-project typecheck with -p and --noEmit; no web source/config changed. Scope checks remain strict.

Resolution: the date-only restoration stopped before writing when further feed additions appeared. All three changed documents and diffs were archived byte-for-byte. After the preservation/restoration proposal and the user's “tiếp tục làm”, the recommended route was stated explicitly and exact original baseline bytes were restored. restore-docs-1 and audit-3 exited0; baseline/checker were not changed. The feed archive and new mockup remain intact. See doc-restoration.json for hashes and source/copy paths.
