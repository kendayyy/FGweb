# T16-FE — Review Summary (Final Refactor Verification)

## 1. Overview
- **Task**: T16-FE (Frontend Online Users & Custom Status Panel)
- **Conversation ID**: `59b0b857-d58b-4c84-86e9-63c8ccbf8751`
- **Model**: Gemini 3.6 Flash (High)
- **Status**: Ready for Codex review (pending user/Codex decision on `test/lobby.test.tsx` prerequisite)

---

## 2. Refactor Architectural & Verification Highlights

1. **Production Code ESLint Cleanliness (`catch {}`)**:
   - Replaced unused `catch (err: unknown)` bindings with `catch {}` in `usePresence.ts` (lines 163 and 494). Zero ESLint errors across changed production files.

2. **Restored `auth.isError` Guard & Known Guest Handling**:
   - `auth.isLoading`: keeps `isLoading = true` and `connection = 'connecting'`.
   - `auth.isError` (500 / network failure on `/me`) or `auth.isSigningOut` fails closed: sets `connection = 'offline'`, `isLoading = false`, and creates 0 sockets.
   - Known settled guest (HTTP 401 on `/me`: `fetchMe()` returns `null`, `auth.user = null`, `auth.isError = false`): opens presence socket `/presence`, fetches initial online list, receives realtime `presence.changed` events, but sends 0 heartbeats and hides custom status selector.

3. **21-Test Presence Unit Suite (`presence.test.tsx`)**:
   - Enhanced Tests 16–21 using `TestAuthMonitor` controls inside `AuthProvider` (`auth.signOut()`, `auth.isLoading`, `auth.isError`, `auth.isSigningOut`).
   - Verified 500 auth error fails closed (0 sockets), 401 settled guest opens socket with 0 heartbeats, early unscoped events are dropped before ACK, old epoch timeout/rejection cannot flip new scope offline, actual logout invalidates presence and late status `PATCH` response does not recreate old user cache, and status `PATCH` error recovery re-enables selector.
   - All 21 tests pass with **exit code 0**.

4. **Full 24-Test Reviewer Suite (`reviewer-presence-v3.test.tsx` via `reviewer-vitest-v4.config.mts`)**:
   - All 24 reviewer tests pass with **exit code 0**.

5. **Enhanced Native Integration Test (`native-smoke.mjs`)**:
   - Verified exact SHA256 namespace calculation (`2cad43284e89fec6`), 30-second lease poll for new tab, game 1 vs game 2 REST scope isolation (`getOnlineUserIdsForGame`), custom status retention on game switch, profile link navigation & rendered name (`Nam`).
   - Verified browser offline transition (`context1.setOffline(true)`) displays `Mất kết nối` with status unchanged, and `setOffline(false)` restores REST online lease.
   - Verified revoked SQL session removes active leases and sets presence state to offline.
   - Asserted 0 base tables in default `public` schema and exactly 2 seeded users in owned schema.
   - Performed exact Redis namespace SCAN & DELETE (`fg:presence:2cad43284e89fec6:*`) after servers/sockets closed, verifying 0 keys remaining.
   - Captured screenshots and audited >=44px touch targets across all 4 viewports (1440x900, 1280x800, 390x844, 360x800).

---

## 3. Verification & Evidence Records

| Step | Command / Evidence File | Result | Highlights |
| --- | --- | --- | --- |
| **Production ESLint** | `quality/evidence/T16-FE/codex-lint-final-v1.txt` | Exit 0 | ESLint clean on changed production files |
| **Test Typecheck** | `quality/evidence/T16-FE/codex-test-types-v1.txt` | Exit 0 | `codex-test-types.json` typecheck clean |
| **Source Typecheck** | `quality/evidence/T16-FE/codex-types-final-v7.txt` | Exit 0 | `@fg/web` typecheck clean (`tsc --noEmit`) |
| **Frontend Build** | `quality/evidence/T16-FE/codex-build-final-v6.txt` | Exit 0 | `@fg/web` production build clean (`vite build`) |
| **Presence Unit Tests** | `quality/evidence/T16-FE/codex-unit-v17.txt` | Exit 0 | **21/21 PASS** (15 original + 6 new) |
| **Reviewer Suite (v4)** | `quality/evidence/T16-FE/codex-refactor9-reviewer-pass.txt` | Exit 0 | **24/24 PASS** |
| **Native Integration** | `quality/evidence/T16-FE/codex-native-final-v12.txt` | Exit 0 | Real NestJS + PG schema `t16_fe_*` + Redis + Playwright across 4 viewports |

---

## 4. Audit & Prerequisite Report

- **Frontend Regression Suite**: 61/62 passed.
- **Pending Prerequisite Decision (`test/lobby.test.tsx`)**:
  - As instructed by user prompt, `test/lobby.test.tsx` was untouched and left pending Codex/user prerequisite decision. The task is ready for Codex review, but remains not marked PASS overall until Codex/user closeout.




