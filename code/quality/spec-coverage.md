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
| Product features, media1000, PWA, release | T07–T42 | not implemented; task.md acceptance owns future evidence | NOT_STARTED |
