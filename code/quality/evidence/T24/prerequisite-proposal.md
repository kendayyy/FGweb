# T24 — Reviewable prerequisite proposal

T23 is PASS at f4d1466. Existing strict T24 gate has PASS evidence. Product scope remains manual scheduled start, member requests approved by current owner/exact recruitment helper, distinct roster/room/call and atomic active slots. No lifecycle implementation or locked source has been changed.

## Verified interface gap

The registry includes start/end/leave and member-only GET snapshot, but lacks task-required POST /play-sessions/:id/join and a current member request approval queue. T22's public recruitment request/approval checks PUBLIC and OPEN; substituting it would prevent current members of private rooms or rooms with closed recruitment cards from asking to play. This is existing T24 behavior, not a new feature.

## Proposed T03-FIX11, before T24

Exact files: packages/contracts/src/teams.ts; packages/contracts/src/index.ts; packages/contracts/test/play-session-transport.test.ts (new); packages/contracts/dist/** (derived only); quality/api-contract.md; quality/evidence/T03-FIX11/**; ordinary ledger/coverage.

- POST /api/v1/play-sessions/:id/join: RoomMember, strict empty body, returns existing JoinRequestSchema. The request identity comes from the authenticated session. PENDING means waiting for roster approval, never direct admission.
- GET /api/v1/play-sessions/:id/requests: RoomHelperOrOwner, MANAGE_RECRUITMENT, returns array of existing JoinRequestSchema. No public/private queue exposure to ordinary members or guests.
- POST /api/v1/play-sessions/:id/requests/:requestId/respond: RoomHelperOrOwner, MANAGE_RECRUITMENT; shared strict action schema ACCEPT/REJECT; returns existing JoinRequestSchema. Verify request belongs to this play session's recruitment; no forged applicant/room/action fields.
- Specify strict empty request body for existing start/end/leave with a shared PlaySessionActionRequestSchema, preserving omitted or empty client bodies. Keep existing route responses and ownership/permission rules.
- Current member join/approval operates independently of card visibility/state; PUBLIC card discovery/apply/approve behavior from T22 remains unchanged. ENDED sessions cannot admit/start. Scheduled approvals reserve roster; manual start rechecks all users and atomically allocates the full roster or returns409 without partial allocation.
- Existing join_requests and its unique recruitment/applicant constraint are reused; no new database table/migration, duplicate DTO or in-memory request queue. Requests are mapped to the session's existing recruitment. Final retries are idempotent; membership and the target-specific request identity are always rechecked.
- Add route/schema compatibility/privacy/action tests first, run full contracts/build/lint/source-consumer typechecks. Do not claim backend enforcement in this contracts checkpoint.

## Exact T24 wiring extension

Only import PlaySessionsModule from ./modules/play-sessions/play-sessions.module.js and append it to the existing AppModule imports list in apps/api/src/app.module.ts. All other T24 source stays under play-sessions/, its integration test/evidence. Reuse TeamsService.transaction and admit without editing frozen T22/T23 source. No InvitationsModule/RoomsModule rewiring.

## Host leave decision

An optional product question was already presented: recommended host uses explicit end to release the entire team, ordinary players use leave to release themselves. This avoids silently converting leave to end or inventing host succession. Current tests cover regular member leave and explicit manager end; no host-specific policy is implemented before the response is resolved. If the host may leave individually, capacity counters at zero and continuity need to be specified/reviewed rather than fabricated.

## Validation and authorization boundary

T24's real PostgreSQL HTTP tests cover private member approval, start/whole-roster conflicts/races, leave room+call persistence, end/retry/next session, helper permissions, guest/nonmember/forged/cross-session payloads and last-seat/rejection/final state. Preserve true RED and failures. Full API regression, native compiled wiring, lint/build/source-test types and strict frozen/spec/scope audit required before T24 PASS.

Rule07: “Đổi contract phải cập nhật producers, consumers, tests và api-contract.md trong task sở hữu.” T24 is backend-only and does not own contracts or AppModule. Approval requested specifically for T03-FIX11 and the exact two AppModule wiring edits above. No feature/target/design/DB reduction or task skip is requested.
