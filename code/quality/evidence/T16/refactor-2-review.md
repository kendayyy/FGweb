# T16 review after first refactor

T16 remains IN_PROGRESS; no PASS and no downstream unlock. First refactor task suite recorded 12 passing tests in codex-green-task-v3.json/txt. Codex inspected production source and rejected closeout for missing behavior and unsafe cleanup.

Findings: unscoped Redis cleanup/data collision; non-atomic lease updates; canonical conversation/Lobby mapping assumption; heartbeat without subscription; missing revocation lease removal; status broadcast uses nonexistent game '*' and user IDs as conversations; missing expiry notifications; silent fabricated status fallback. Exact requested corrections and new behavior tests are in refactor-2-prompt.txt.

Codex stopped only the uniquely identified owned refactor process PID12360; first refactor exit -1. The partial full API regression output has no completion record and is NOT a passing regression result. A subsequent process inventory found no remaining node Jest/record-check process. No actual production deployment or public schema migration was authorized or performed. This review does not claim broad Redis cleanup was safe; the implementation must isolate test keys before another test run.

Second refactor continues the same conversation with Gemini 3.6 Flash (High). All earlier failures and partial outputs are retained. Clock transport violation was fixed in refactor1; the new behavior findings still require genuine RED/PASS and independent verification.
