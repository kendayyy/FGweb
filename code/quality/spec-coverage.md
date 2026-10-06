# FG — Requirement / task / verification

| Requirement | Task | Verification | Status |
| --- | --- | --- | --- |
| Approved spec/design/mockups | T00 + AUTH-CHANGE-01 | baseline5hashmatches, manualreview | PASS |
| Exact deps and reproducible install | T01 | verification.json ci/dependencies/audit | PASS |
| Setup failure returns nonzero | T01 | probe-failures.test.mjs2/2, codex-red.txt/codex-tests.txt | PASS |
| Local services ready | T01 | final-readiness.txt/final-compose.txt | PASS |
| Frontend/database tooling compatible | T01 | final-vite.txt/final-drizzle.txt | PASS |
| External services/credentials/task gate | T02 | quality/evidence/T02/verification.json and review.md; real service smoke and task gate | PASS |
| Shared API/realtime contracts | T03 | quality/evidence/T03/final-verification.json,29contracts+3regression | PASS |
| Identity/profiles/7game7Lobby migrations | T04 | PostgreSQL6/6 twice, real adapter4models, build/test-types/lint; T04/codex-review.md | PASS |
| Chat/social constraints and forward migration | T05 | PostgreSQL10T05+6T04 and2independentregressions; quality/evidence/T05/codex-review.md | PASS |
| Rooms/teams/recruitment constraints and populated migration | T06 | PostgreSQL7T06+23DB+12independent+2T05; quality/evidence/T06/codex-review.md | PASS |
| Call/notification/moderation constraints and populated migration | T07 | PostgreSQL13T07+36DB+11independent+T05/T06; quality/evidence/T07/codex-review.md | PASS |
| Discord auth/session guards | T08 | 16PG/Nest, build, source/test typecheck, lint, native smoke, real Discord OAuth session/logout/replay and cleanup; quality/evidence/T08/direct-review.md | PASS |
| Discord frontend auth/guest guards and UI foundation | T09 | 16behavior tests, build/source+test types/lint, real Nest/PG browser logout/replay/session deletion,4viewport screenshots, cleanup/secret audit; T09/final-verification.json and codex-review.md | PASS |
| Profile APIs/security and transactional game interests | T10 | 15acceptance+31auth/profile regression+7independent, build/types/lint, native7/cleanup/secret audit; T10/final-verification.json and codex-review.md | PASS |
| Product UI/realtime features, media1000, PWA, release | T11–T42 | task.md acceptance owns future evidence | NOT_STARTED |
| Approved missing profile PUT contract correction | T03-FIX1 | 5RED before implementation;34contracts,build/API+web types/lint PASS; T03-FIX1/final-verification.json and review.md | PASS |
| Onboarding completion/interests additive shared read contract | T03-FIX2 | 3RED then38contracts/build/API+web types/lint; T03-FIX2/final-verification.json | PASS |
| Persisted onboarding/interest read and cleared owner avatar | T08-FIX1 | 5RED;6new+37BE+9FE tests, build/types/lint, native10 and cleanup/secret audit; T08-FIX1/final-verification.json | PASS |
| Onboarding, owner/public profiles and account-safe mutations | T11 | 12 task +28 frontend +7 reviewer; real PG/API E2E, four viewports and cleanup; quality/evidence/T11/final-verification.json | PASS |
| Game-ID Lobby history and realtime subscription contracts | T03-FIX3 | 3RED;42 contracts tests, build/types/lint/audit; T03-FIX3/final-verification.json | PASS |
| Durable message creation outbox prerequisite | T07-FIX1 | 4RED;40 PostgreSQL tests; build/types/lint/audit; T07-FIX1/final-verification.json | PASS |
| Lobby history, native Socket.IO text chat, current session/private ACL, committed durable Redis events | T12 | 16 native tests;53 API regression tests; build/types/lint/audit; T12/final-verification.json | PASS |
| Seven-game responsive Lobby, guest/member text chat, reconnect ID merge and reading position | T13 | 9 task +37 FE tests; native built-web/Nest/PG/Redis; four viewports, drawer/focus/scroll; T13/final-verification.json | PASS |
| Multipart upload and protected image content transport contracts | T03-FIX4 | 2RED;44 contracts tests, build/types/lint/audit; T03-FIX4/final-verification.json | PASS |
| Durable image draft ownership/context/expiry and additive migration | T05-FIX1 | 6 task +46 PostgreSQL tests; populated/empty upgrades, atomic consume/rollback/expiry; build/types/lint/audit; T05-FIX1/final-verification.json | PASS |
| Protected durable image uploads, atomic rich messages/replies/mentions and 24h orphan cleanup | T14 | 11 task +64 API regression tests; compiled Nest/PG/Redis upload/restart/membership revocation; T14/final-verification.json | PASS |
| Rich chat images, upload progress/retry, replies, emoji/caret, opaque mentions, protected image modal | T15 | 10 task +47 FE tests; built web/compiled Nest/real PG/Redis, offline retry, reconnect, script safety, four viewports; T15/final-verification.json | PASS |
| Scoped presence socket request/ack/events, game-online and chosen-status contracts; 15s heartbeat/45s TTL | T03-FIX5 | Antigravity 10 task; Codex 54 contracts regression, build/API/web types/lint/baseline audit; T03-FIX5/final-verification.json | PASS |
| Atomic scoped presence leases, current session/private ACL, chosen status and cross-instance realtime | T16 | 25 task +89 API regression;6 compiled native checks with real PG/Redis/two instances; build/types/lint/audit; T16/final-verification.json | PASS |
| Presence-compatible Lobby test adapter; original 9 behaviors/assertions preserved | T13-FIX1 | 8RED; independent68FE, types/lint/assertion+baseline audit; T13-FIX1/final-verification.json | PASS |
| Lobby online panel, independent chosen status, tab deduplication, authenticated lifecycle and profile links | T16-FE | 21task+24reviewer;68FE with T13-FIX1; native built web/Nest/PG/Redis,4 viewports; types/lint/build/frozen audit; T16-FE/final-verification.json | PASS |
| Authenticated incoming/outgoing pending friend-request transport and public peer projection | T03-FIX6 | 5RED;59contracts+4independent;API/web/source+test types,build,lint,78legacy route compatibility,frozen baseline audit; T03-FIX6/final-verification.json | PASS |
| Blocked DM writes denied before message/draft/outbox effects; history preserved; canonical pair race serialization | T12-FIX1 | Real RED201→403;10task+99API;independent compiledAPI/PG bothactors,draft/history/replay/pg_locks;types,lint,build,baseline/scope/cleanup audit | PASS |
| Private friends/requests/DM/blocks, receiver and sender ACL, retries and fresh consent, canonical pair race/session checks, preserved history | T17-BE | genuine route RED;30 social+129 API;18 independent compiledAPI/PG/WS check groups;types/lint/build/frozen/scope/secret/cleanup audit | PASS |
| Friends/requests/block UI, actual profile/Lobby DM without friendship, actor/thread isolation/cache, draft retry, unread tabs, true cursor pages/error retry, keyboard/mobile | T17-FE |17 task +85 frontend +10 independent review tests;10 compiledAPI/PG/built-web native probe groups;types/lint/build/frozen/scope/secret/cleanup/diff | PASS |
