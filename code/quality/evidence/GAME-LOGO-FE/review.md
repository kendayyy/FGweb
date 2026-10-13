# GAME-LOGO-FE — Codex review

Status: BLOCKED. No PASS; T24-FIX1 remains unopened.

Implemented fixed 72px desktop/tablet sidebar, 24px logos/46px rows, hover/keyboard tooltip, unchanged mobile drawer. Shared contract-based game mapping in Lobby/header/onboarding/profile selection/profile cards. FG approved monogram reconstructed with SVG paths in current header/login/sidebar; transparent light/dark SVG, favicon SVG/ICO16/32/48, Apple180, icons192/512 and opaque safe maskable192/512. Original raster game pixels retained; CSS frames remove transparent whitespace from display without cropping the actual marks. Free Fire SVG contains only original local vector paths, with black/white variants.

Latest checks: lint, app/test typecheck, Vite build, asset/icon/safe-circle checks, diff check and ownership audit exit0. Task DOM tests15/17; headed real API/PG/Redis tests6/7. The three remaining assertions require the missing Dota image. Earlier full frontend regression177/179 before final CSS framing; other12 test files passed. All existing assertions retained.

Socket test readiness corrected after observing initial auth/DM fetch connection transitions: initialize native DM panel, wait until its real conversation list finishes loading, then capture the two native root connections. The final run preserves both IDs and the complete event list across10 theme/viewport interactions, and keeps the same composer node/draft/session. No production auth/socket logic changed. Tooltip priority fixed; fractional browser bounds use close4 with exact computed24px retained.

Evidence: verification.json, audit.json, asset-provenance.json, final command JSON/text records and headed-7/screenshots. Historic PASS metadata/evidence/checker/configuration retained. Source helper setup failures (PowerShell quoting, CRLF anchor, ESM drive-letter URL), initial fixture upload directory constraint and failed test rounds are recorded as unsuccessful attempts; none count as PASS.

Blocker: user-provided Dota raster contains actual checkerboard. Imagegen rejected output with moderation_blocked/other, request20ac9472-7c29-4315-ae4c-e2b2555dbea6. Need a transparent PNG/SVG source from the user. Dota temporarily shows an accessible D2 fallback with no broken URL/hotlink. Do not remove seven-game assertions, publish, or proceed to T24-FIX1.

Actual install/notification behavior on iPhone/Android remains unverified and is not claimed by these icon/manifest URL checks; later device/PWA tasks still apply.
