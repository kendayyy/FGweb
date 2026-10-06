# T13-FIX1 Implementation Report & Evidence

## Overview
Implemented the authorized T13-FIX1 test adapter update in `apps/web/test/lobby.test.tsx` to support `presence` component mounting in Lobby without modifying any production code, test assertions, or test titles.

## Summary of Edits in `apps/web/test/lobby.test.tsx`
1. **Socket Mock Namespace & Emit Support**:
   - Updated `socket.io-client` mock to accept `(urlOrOpts?: unknown)` overload.
   - Stored `namespace` on socket objects (`typeof urlOrOpts === 'string' ? urlOrOpts : '/'`).
   - Added `emit() { return socket; }` method required by `usePresence` unsubscribe cleanup.
2. **Fetch Handler for Game Online Status**:
   - Added contract-valid `GET /api/v1/games/:id/online` handler returning `reply(page([]))` (empty online list).
3. **Explicit Chat Namespace Socket Selection**:
   - Updated chat event triggers in tests 3, 4, and 5 to explicitly filter `transport.sockets` by `namespace === '/'` (`transport.sockets.filter(s => s.namespace === '/').at(-1)!`) rather than picking the last socket indiscriminately.

## Verification & Recorded Commands

| Label | Command | Exit Code | Result | Evidence File / SHA256 |
| --- | --- | --- | --- | --- |
| `red` | `npm run test --workspace @fg/web -- test/lobby.test.tsx` | 1 | 8 FAILED, 1 PASSED | `codex-red.txt`<br>`422bd56652a9cb246d040684af3a07c378240d804382d619181ddcbf7c339502` |
| `green-v2` | `npm run test --workspace @fg/web -- test/lobby.test.tsx` | 0 | 9 PASSED, 0 FAILED | `codex-green-v2.txt`<br>`0dd62e3644a1d052a1d0a216cc2ceff7492da3b4d5b535f0cb714c3879e35648` |
| `full-web-v2` | `npm run test --workspace @fg/web` | 0 | 68 PASSED (7 files) | `codex-full-web-v2.txt`<br>`1ab1d9c311013d1501b97c1742ba96d90dfdefbc9a2b780f3ba1dc187ab4152c` |
| `tsc-v2` | `tsc -p quality/evidence/T13-FIX1/test-types.json` | 0 | Typecheck clean | `codex-tsc-v2.txt`<br>`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `eslint-v2` | `eslint apps/web/test/lobby.test.tsx` | 0 | Lint clean | `codex-eslint-v2.txt`<br>`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Preserved Invariants & Status
- **Assertions & Tests**: All 9 original tests, assertions, queries, and snapshots remain byte-identical.
- **Production Files**: 0 production files modified.
- **Pre-existing Workspaces**: Pre-existing dirty T16-FE files remain intact and untouched.
- **Next Steps**: No commit, PASS, or unlock executed. Pending Codex independent review and closeout.
