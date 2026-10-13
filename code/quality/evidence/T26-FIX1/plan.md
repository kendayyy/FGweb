# T26-FIX1 — registered call controls producers

Read the approved producer proposal in T03-FIX15. Strict owner gate before implementation. Test native HTTP/isolated PostgreSQL/private SFU first: member-only participant metadata, session/ban/revoked membership, closed/missing group, strict path/query/body handling, viewer self-unmute, self-only action, moderator MIC_MUTED restriction, wrong/expired/revoked session lease and preservation of room/team/seat/identity. No frontend or new moderator actions.

Implement listParticipants and setSelfMic in the existing CallsService transaction/room authorization model. Parse exact shared schemas; emit safe profile summary, opaque active lease identity, publishing and restriction state. Return explicit DTO after commit, no fake media success. Self-mic is user intent/state; the actual local track toggle is T28. T29 owns native moderator publication enforcement/actions.

Verify native controls plus unchanged T27/T26 regressions, build/types/lint/diff/frozen files/baselines/credential scan and strict T28 gate. Existing T27 runtime files remain frozen; new regression fixture directories must finish cleanup. Preserve all failed logs; no PASS before closure validation.
