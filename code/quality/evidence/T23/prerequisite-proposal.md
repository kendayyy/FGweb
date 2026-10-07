# T23 — Concrete prerequisite proposal

Executor remains Codex direct; Anti2 paused. T22 is PASS at977d077. The unchanged T23 checker passed all predecessor evidence, frozen hashes and the approved spec/design/mockup baselines. Only the existing T23 integration-test/evidence scope is being prepared. No locked contracts, database, application module or predecessor source has been changed.

## Verified gaps

- Product spec section5 requires a member invitation under OWNER_APPROVAL to wait for the recipient's consent and then for the owner/authorized manager's decision. The invitations table has only PENDING/ACCEPTED/REJECTED/CANCELLED and no persisted consent marker. PENDING cannot identify both states after a restart. ACCEPTED must continue to mean completed admission.
- taskT23 explicitly requires GET/PATCH settings and PUT permission grants. The frozen registry has PATCH settings and PATCH helpers, but no GET settings or PUT alias. Existing DTOs and RoomsService already support the data and owner enforcement.
- POST invitations/:id/approve is currently declared RoomOwner only. Spec grants distinct helper recruitment/member permissions, and taskT23 requires helper calls permission not to approve teams. Define target-specific delegated approval explicitly before implementation, retaining owner-only transfer/dissolve.
- AppModule registers TeamsModule but no InvitationsModule. The module import/registration is outside current T23 folders and is frozen by T22.

## 1. T03-FIX10 — invitation consent and settings/grants contracts

DependencyT22; ordered before the database fix and T23. Exact scope:

- packages/contracts/src/teams.ts
- packages/contracts/src/index.ts
- packages/contracts/test/invitation-transport.test.ts (new)
- packages/contracts/dist/** (derived build outputs only)
- quality/api-contract.md
- quality/evidence/T03-FIX10/** and ordinary ledger/coverage metadata

Add optional server-produced recipientAcceptedAt UTC ISO timestamp to both ROOM and PLAY_SESSION invitation DTOs. Existing payloads without the field remain valid. This records recipient consent; the client cannot submit or forge it. PENDING with no marker means awaiting recipient; PENDING with marker means recipient agreed and management approval is still required; ACCEPTED means actual membership/roster admission committed. Do not add a new status or treat an accepted invitation as unapproved.

Add GET /api/v1/rooms/:id/settings -> existing RoomSettingsSchema, RoomMember, current authorization. Add PUT /api/v1/rooms/:id/helpers/:userId -> existing UpdateHelperPermissionsRequestSchema and RoomMemberSchema, RoomOwner; retain old PATCH route as compatible alias to the same service.

Declare approve as RoomHelperOrOwner with a shared target-to-permission mapping: ROOM requires MANAGE_MEMBERS; PLAY_SESSION requires MANAGE_RECRUITMENT. Owner is implicit. MANAGE_CALLS alone cannot approve either. Transfer/dissolve remain exclusively owner actions. Describe this dynamic permission rule in api-contract.md rather than mislabeling it with one static permission.

Clarify existing GET /invitations/me as the user's sent/received invitations plus consented pending invitations they currently have the target-specific right to review. This gives T25 the approval queue without exposing other private rooms; all grants/memberships are rechecked. No new unrelated discovery endpoint.

Keep create/respond/approve routes and body shapes compatible. Respond action applies only to the authenticated receiver; approve action applies only to current owner/exact helper. Reject forged server fields and mismatched body/path invitation identity. Owner-created invitations still require recipient consent; they can complete on recipient consent while the sender remains current owner. A member-created OWNER_APPROVAL invitation persists consent and waits for management; approval before consent returns409. At response/approval use current policy/membership/permissions. Retries preserve final outcome.

Tests first: route metadata, old route compatibility, shared target permissions, optional consent timestamp roundtrip/validation, forbidden ownership delegation and all consumer/source typechecks. No frontend redesign or business feature is added by this contract task.

## 2. T06-FIX1 — durable consent marker with additive migration

DependencyT03-FIX10; ordered before T23. Exact scope:

- packages/database/src/schema/recruitments.ts
- packages/database/migrations/0006_invitation_consent.sql (new)
- packages/database/migrations/meta/_journal.json (append one entry)
- packages/database/migrations/meta/0006_snapshot.json (new generated schema snapshot)
- packages/database/test/invitation-consent.test.ts (new)
- packages/database/dist/** (derived build outputs only)
- quality/evidence/T06-FIX1/** and ledger/coverage metadata

Add nullable recipient_accepted_at timestamptz with no fabricated default consent. Existing invitation ids, statuses, targets, sender/receiver and data remain intact; existing rows retain NULL. Existing finalized invitations are not replayed into new admissions. Preserve all old migration files/snapshots/journal entries. Do not reset the local database.

Use RED real PostgreSQL tests and reviewed additive migration: migrate an empty isolated schema; migrate an isolated schema containing old ROOM/PLAY_SESSION invitation rows; prove preservation and NULL consent; persist/read UTC consent across client timezones; retain target/FK/self-invitation constraints. Run full database regression, lint/build/types and scope audit. Apply services' local migration only after the owner task passes, using the existing migration procedure.

## 3. T23 exact AppModule wiring extension

Allow only an InvitationsModule import from ./modules/invitations/invitations.module.js and InvitationsModule appended to the existing imports list in apps/api/src/app.module.ts. Preserve every existing module. PermissionsModule can be imported by InvitationsModule from the already allowed permissions folder. The rest of T23 remains apps/api/src/modules/{invitations,permissions}/, apps/api/test/invitations.integration.spec.ts and its own evidence.

After both prerequisite tasks PASS, implement the original T23 with real consent, current permissions and policy, ROOM max50 distinct from roster capacity, reusable T22 transaction-scoped PLAY_SESSION admission, last-seat/cross-team races, retries, atomic notifications/outbox rollback and private/session checks. ROOM invitation never creates an active play slot; scheduled PLAY_SESSION only reserves roster. No media, lifecycle or frontend completion claim belongs here.

## Reviewable preparation and reason for approval

The existing-scope integration suite defines14 real HTTP/PostgreSQL cases before implementation. Its RED run and source-test lint/types/scope checks are recorded under T23. A passing predecessor gate does not authorize altering frozen contracts/database/AppModule by itself.

Rule07 says: "Đổi contract phải cập nhật producers, consumers, tests và api-contract.md trong task sở hữu." Rule06 requires a reviewed migration and real PostgreSQL integration test for every schema change. taskT23 is backend-only and does not own the above frozen files. Approval requested is specifically to insert these two prerequisite tasks and the exact wiring extension, with these tests and file boundaries. Executor, approved product/design and task sequence remain the same.
