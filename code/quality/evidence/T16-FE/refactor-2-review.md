# Codex review — T16-FE loop 1 failed

Two implementation test runs (`codex-pass.json`, `codex-pass-v2.json`) fail all 15 tests. RED attempts are also timer timeouts, not defensible behavior evidence. Fake setTimeout/clearTimeout prevent Testing Library/React Query waits from progressing; use real timeout scheduling and only fake the heartbeat interval, with explicit async act flushing and proper unmount before restoring timers. Preserve assertions and every failure.

Remaining inspected source defects:
- Initial and pagination HTTP completions overwrite newer per-user offline events and overwrite newer initial refreshes; lifecycle generation alone is insufficient.
- Status synchronization depends on isSavingStatus and reverts a confirmed response to stale auth.user.customStatus. Generation can change during auth.refetchUser leaving isSavingStatus stuck. No auth error socket guard.
- Scope changes do not reset onlineUsers/hasMore/loadingMore/errors, leaking previous Lobby data while loading the next.
- Disconnect does not invalidate pending subscribe/heartbeat ACKs within the same generation. A delayed ACK may mark a disconnected socket connected.
- Dedupe overwrites the first displayName with the duplicate, failing retained test 1.
- Event profile fetch uses state updater side effects to determine isPresent; use refs or authoritative refresh with ordering.
- No pagination repeated-cursor bound and no namespace-specific heartbeat ACK conversation check.
- Several tests have broader names than their assertions: test 7 does not exercise logout/late status/ACK; test 11 does not defer ACK; test 15 does not exercise loading/error/signout guards. Add actual deferred cases, do not merely rename them as proof.
- The online panel currently has unstyled class names; native four-viewport evidence and real backend proof remain missing.

Owned PID14488 stopped to deliver the final allowed refactor loop. No next task unlocked; no source repaired by Codex.
