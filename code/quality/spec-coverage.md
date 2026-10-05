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
