# T19 independent review: NEEDS REFACTOR

Initial implementation is not PASS. Same task/conversation retained; T20 closed.
The initial worker's six failed tests used invalid MeDTO fixtures, so they are not accepted as six behavior RED checks. Correct fixtures and stronger current missing-behavior tests required.

Real browser/API/Postgres private access: `codex-native-private-1` exit1, real GET403, no permission alert with empty outsider own list.
Revocation original `codex-native-revoke-1` exit1 timed out waiting for revalidation: this is an unsuccessful probe, not evidence of cache leak.
Reconnect probe first invocation had a harness syntax error, retained. Corrected `codex-native-revoke-reconnect-2` exit1 confirms real GET403 after real member removal and browser offline/online revalidation, but old private message remains visible (expected0, actual1). This is genuine behavior RED, with failure screenshot and verified owned fixture cleanup.

Review findings sent in refactor1 prompt: actor/auth/query isolation, fail-closed cache revocation, late generation guards, reconnect history recovery, typed requests, helper permissions, mutation failures/invalidation, paging, meaningful acceptance tests and responsive/accessibility behavior.
Additional source finding to verify in refactor review: initial CreateRoomModal hardcodes gameId `game-${index}` instead of game catalog UUID. Initial prompt already requires real seven-game selector. A real UI create test will assert exact catalog ID and successful API create; no fake IDs accepted.
