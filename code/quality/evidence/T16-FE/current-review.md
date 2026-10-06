# T16-FE — current independent review

User-authorized fixed retry-limit removal is recorded in root AGENTS.md, rule 02 and resume-policy.md. Antigravity implemented through refactor 8 with Gemini 3.6 Flash (High); Codex independently verified the resulting draft. Earlier failures and the earlier retry-limit blocker remain historical evidence, not the current blocker.

Current verification:
- Task behavior tests: 21/21 PASS.
- Independent reviewer v4: 24/24 PASS, including actual AuthProvider error/sign-out races.
- Owned lint, source and owned-test typecheck, production web build: exit 0.
- Independent native browser check: exit 0 against built web, compiled Nest, real PostgreSQL and Redis in an isolated schema. Guest leases, status persistence, two-tab deduplication, game switching, rendered profile navigation, offline/reconnect and revoked session heartbeat were asserted. Four viewport captures verify existing palette, loaded Inter, no horizontal overflow and control sizing. Codex visually inspected the 390x844 capture.
- Post-native audit: five baselines and 1,137 frozen predecessor outputs verified, approved minimal Lobby mount, no configured secret leak, no remaining owned schemas, public schema unchanged with zero tables.
- Full frontend regression: 60/68 PASS, 8 FAIL in frozen T13 Lobby tests. Adapter lacks the online endpoint and socket.emit and selects the latest socket without distinguishing chat/presence. No production compatibility bypass or assertion changes were made.

Status: BLOCKED pending the already-requested T13-FIX1 adapter-only scope approval. The concrete change is in test-adapter-prerequisite-proposal.md. Task.md rule 8 restricts changes to the task's allowed files; the retry-limit exception does not grant changes to frozen T13 tests. T17-BE remains NOT_STARTED. No PASS hash, commit or downstream unlock is authorized by these partial results. No media capacity claim follows from these presence checks.

Changed feature files: apps/web/src/features/presence/**, apps/web/src/features/lobby/OnlineUsers.tsx, the minimal LobbyPage.tsx mount and apps/web/test/presence.test.tsx. Evidence and Codex ledger metadata are under quality/. User-directed policy changes are root AGENTS.md and .agents/rules/02-task-sequence.md.

Exact commands, exit codes, timestamps and evidence hashes are in codex-independent-*-final.json and codex-independent-audit-after-native.json. Historical failures are preserved.
