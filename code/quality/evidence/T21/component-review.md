# T21 — Codex component review (task not closed)

T20 PASS prerequisite verified; Codex implemented directly, Anti2 remains paused. Product spec/design/task and all predecessor source/tests/evidence hashes remain unchanged. Production LobbyPage remains byte-identical to its frozen version.

Implemented in original task scope:
- Contract-validated public cards, actual selected game ID, exact free-text mode/timing filters and cursor pages; truthful loading/error/empty/full states. No invented teams, ranks, avatars or production transport mocks.
- Create now/scheduled in an inline panel form; seven game titles from shared contracts; optional advisory requirements and mandatory Roblox experience name/HTTPS Roblox URL. No automatic rank restriction.
- Bangkok local date/time converts explicitly to UTC; invalid/past dates rejected. Failed input persists. Inline errors link to fields and an immediately focused summary.
- Existing/new persistent room selector preserves all pages. Private rooms disabled; fresh room visibility/game and helper membership+MANAGE_RECRUITMENT checks precede POST. Server remains authoritative for race/occupancy.
- Suggest missing-player teams for exact game/mode/timing, while allowing valid create when suggestions are empty/unavailable. Occupied409 shown without fake success. Stable per-draft idempotency key retained across unchanged retries; changed input begins a new operation.
- Cancellation/unmount/game/actor/sign-out changes abort pending requests; late responses are ignored. Existing AppShell composition keeps chat mounted when switching phone tabs.
- Navy/Inter/shared semantic tokens, scoped component CSS, no new packages/redesign. No joining/approval flow fabricated; those are T22/T23.

Verification notes:
- Initial placeholder produced genuine behavior RED for the twelve initial cases, then implementation. Error summary was originally focused via requestAnimationFrame; a strict focus check exposed delayed focus. Source fixed with useLayoutEffect; original focus assertion preserved.
- Additional coverage includes all seven game-specific forms, helper/member ACL, pagination, filters, malformed/private data, empty/full states, request cancellation and late-response switching.
- Unsafe Roblox response fixture initially expected partial display. The existing shared response contract correctly rejects the entire unsafe response. Test corrected to require the visible load error, no unsafe card content and no link; the redundant local URL validator was removed. This strengthens fail-closed validation and keeps one shared schema. No old tests or assertions changed.
- Test types import the existing Vitest jest-dom augmentation, matching other project test files; initial typecheck failure preserved.
- Current feature tests report 26 passing. Full frontend regression/types/lint/scope audit command records must be checked before marking the component review complete.

Pending before T21 PASS: approve minimal frozen LobbyPage wiring in wiring-proposal.md; apply only that import/placeholder replacement; build and test actual integrated production entry against real API/PostgreSQL in browser at1440x900,1280x800,390x844,360x800; review screenshots/keyboard/mobile behavior and freeze final evidence. Unit AppShell composition is not represented as production integration or device verification. Backend/media load is not claimed.

Component review: ready for wiring approval once final command records are verified. T21 is not PASS; T22 remains closed.

Final pre-wiring verification:26 feature tests and130 full frontend tests PASS; types/lint/scope audit PASS. T21 BLOCKED solely on minimal frozen LobbyPage write-scope approval and its subsequent integrated build/browser checks. All commands, failures and original assertions preserved.
