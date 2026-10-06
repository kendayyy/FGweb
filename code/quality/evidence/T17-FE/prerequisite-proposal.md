# T17-FE — minimal integration scope proposal

T17-BE PASS e18f108; the actual T17-FE predecessor/evidence/hash/baseline gate passed on 2026-10-06. No T17-FE application implementation has started.

The frozen task write scope includes friends/**, direct-messages/**, chat/** and social.test.tsx. The acceptance explicitly requires actions from the existing Lobby and public profile plus hiding blocked senders in the Lobby. Both existing entry points are outside that scope: apps/web/src/features/lobby/LobbyPage.tsx currently renders messages directly and its Friends button is disabled; apps/web/src/features/profiles/ProfilePage.tsx mounts ProfileHeader without social controls. Building only new feature modules would leave them unreachable and could not satisfy these acceptance checks.

Request approval to add exactly these integration files to T17-FE:
- apps/web/src/features/lobby/LobbyPage.tsx: import/mount the new social controls, enable Friends/DM entry, and filter displayed Lobby messages using the current actor's actual block list. Preserve the existing Lobby chat/layout/game/presence behavior and established design tokens.
- apps/web/src/features/profiles/ProfilePage.tsx: import/mount peer social controls using the viewed profile ID and actual current actor; preserve public profile/edit behavior.

All substantive social UI, API adapters, account-scoped caches and same-browser cross-tab unread synchronization remain in the already-owned friends/direct-messages/chat directories. No App.tsx/auth/contracts/backend/database/dependency/spec baseline edits are requested. Use overlays/panels from existing entry points instead of adding routes that would require more files. Original closed tests remain unchanged; new social.test.tsx must test the actual integrated entry points with meaningful behavior and real API/browser verification before PASS.

This extends integration write scope only, with no product/design change or task skip. Codex will update the ledger allowlist after explicit approval; Antigravity remains the implementer, Anti2 observes and Codex independently reviews and closes.
