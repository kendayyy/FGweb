# T10 preflight — proposed contract correction

T09 PASS, commit9612719ee3b75f520e890c1fceab320a27195e56. Task gate permits T10. No T10 feature code or Antigravity conversation has started.

Conflict: .doc/task.md T10 requires PUT /api/v1/me/interests and PUT /api/v1/me/game-profiles/:gameId. Frozen packages/contracts/src/index.ts has neither endpoint and ApiEndpointDefinition.method excludes PUT. profiles.ts has no request schema for either endpoint. Existing PATCH /me/profile and POST /me/onboarding do not substitute for the two required PUT routes. Rule07 requires changes in the contract-owning task with tests and api-contract.md synchronization; T10 currently owns backend files only. Do not silently omit the routes, duplicate DTOs in backend, or rewrite the spec.

Recommended approval: create a traceable T03-FIX1 contract correction before T10, preserving historical T03 PASS and linking T10 to the fix. Keep the approved product behavior and locked7game identifiers unchanged.

Concrete proposed changes:
1. Add PUT to ApiEndpointDefinition.method.
2. Add UpdateInterestsRequestSchema: strict object with interestedGames array of existing GameTitleSchema; at least1 and no duplicates. Unknown game ->422. User identity comes from session, not payload. Response schema: object with interestedGames array of existing GameTitleSchema.
3. Add UpdateGameProfileRequestSchema: strict object reusing existing GameProfileSchema.pick for inGameName/rank/role/playHours/playStyle. These fields remain optional; gameId comes from route and gameTitle from the locked catalog. Response uses existing GameProfileSchema.
4. Register the two authenticated PUT endpoints with those schemas and update only corresponding sections of code/quality/api-contract.md.
5. Add contracts behavior tests for route/method registration, valid7game values, invalid game, duplicate interests, optional rank and rejection of payload identity overrides. Verify existing contracts tests, lint/typecheck and relevant consumers. Backend will consume these exports in T10; no frontend/database feature implementation inside the fix.

Proposed write scope for T03-FIX1: code/packages/contracts/src/profiles.ts, code/packages/contracts/src/index.ts, focused code/packages/contracts test files, code/quality/api-contract.md and code/quality/evidence/T03-FIX1/. Codex owns ledger/coverage updates. This is a scope correction needing user decision, not a proposed product redesign. If approved, implement/test the contract fix first, then resume T10 and subsequent tasks using Anti2 sequentially.
