# T21 — Minimal frozen Lobby wiring proposal

T20 is verified PASS. T21 owns apps/web/src/features/recruitments/** and apps/web/test/recruitments.test.tsx, but production Lobby panel currently contains the frozen T13 placeholder.

Proposed additional write scope: apps/web/src/features/lobby/LobbyPage.tsx, limited to these two changes:

1. Import RecruitmentPanel from ../recruitments/index.js.
2. Replace the static heading/introduction within panel with RecruitmentPanel, keyed to selected game/current actor/sign-out state and passed the actual GameDTO. Preserve OnlineUsers, ChatPane, all existing mobile tabs, navigation, friends/DM controls and shell/layout.

Exact proposed result: quality/evidence/T21/LobbyPage.proposed.tsx. Do not modify the frozen production file until approved. This is component wiring; no redesign, new dependencies, contracts/backend/database changes or new scope features.

Component and form are implemented and reviewed within original scope:26 feature tests and130 frontend regression tests PASS; strict source/new-test types, changed-source/test lint and scope/frozen/spec/secrets audit PASS. After wiring approval, run all frontend regression/types/lint/build and real built-web/API/PostgreSQL browser journeys at four required viewports. T21 cannot be marked PASS before that integrated verification.

The original task limits writes to features/recruitments and its tests, and earlier Lobby outputs are frozen. This approval is for the concrete additional file, not for changing the executor (Codex direct is already authorized).
