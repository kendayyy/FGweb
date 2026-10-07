# T23 preflight review — prerequisite scope approved

T22 PASS at977d077:16 task-specific PostgreSQL integration tests, compiled AppModule probe,11 API suites/182 tests, build/lint/types and scope checks passed. T23 predecessor gate also passed unchanged.

The T23 source integration suite is real HTTP through the actual AppModule, using signed Better Auth cookies and isolated migrated PostgreSQL. red-1 is an infrastructure failure: restricted sandbox EACCES on localhost; it is not behavioral RED. red-2 used authorized local network access and exited1 with14 failures from missing invitation/settings routes (HTTP404), while existing room/recruitment fixture creation and isolated cleanup succeeded. No production mock, fake response or altered predecessor test was used.

Reviewable behavior is defined before implementation: persisted consent, current policy and target-specific management, private target and forged-field checks, ROOM vs PLAY_SESSION admission, distinct room50/roster limits, simultaneous last-seat and cross-team admission, scheduled roster, retries, outbox rollback, revoked sender/banned recipient and owner-only transfer/dissolve.

The user approved the exact prerequisite-proposal.md through the task question reply: “Duyệt đề xuất và tiếp tục (đề xuất)”. Insert T03-FIX10 and T06-FIX1, then permit only InvitationsModule import/registration outside current T23 folders. T23 waits for those prerequisite tasks to pass. Frontend/media/lifecycle scope is not opened. Codex direct execution remains authorized; Anti2 paused.
