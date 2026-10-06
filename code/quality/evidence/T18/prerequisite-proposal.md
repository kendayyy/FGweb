# T18 — Minimal production module wiring proposal

T17-FE is PASS at b40f8a9. T18 prerequisite/evidence/hash gate passes without requested paths. The initial requested-path gate failed because T18 did not yet have a declared writeAllowlist; it was not a failure of T17-FE output hashes. No application changes or Antigravity T18 conversation have started.

Declared task.md scope: apps/api/src/modules/rooms/** and apps/api/test/rooms.integration.spec.ts. Owned evidence: quality/evidence/T18/**. Existing room REST contracts and room/member database tables are present, so no contract or database expansion is proposed here.

One extra file is required for production integration: apps/api/src/app.module.ts, currently owned by PASS T17-BE. Current imports mount AuthModule, ProfilesModule, ChatModule, RealtimeModule, UploadsModule, PresenceModule, SocialModule. Nest does not discover a RoomsModule merely because files exist in modules/rooms. Tests importing the module alone would not establish the actual API entrypoint works.

Proposed exact change after permission:

```ts
import { RoomsModule } from './modules/rooms/rooms.module.js';
// Add only RoomsModule to the existing @Module imports array.
```

Preserve every existing import/provider/module. No auth/chat/realtime/services/schema/contracts/dependencies/frontend/spec changes are authorized by this proposal. Do not change T17-BE historical hashes; final T18 outputs may supersede the minimal app.module.ts path after verification.

Verification after approval: genuine RED then room implementation against migrated isolated PostgreSQL; outsider chat403, owner transfer races/outsider denial, member leave and last-owner close, dissolve membership/call authorization revocation, PRIVATE closes public recruitment while preserving room chat/session history. Import the real AppModule and probe real routes. Run task integration, API regression where shared mounting can affect it, changed lint, source/test types, build, immutable/scope/secret/fixture cleanup checks. Antigravity implements with Gemini3.6 Flash (High), Anti2 observes, Codex reviews; one task only. Do not declare media capacity or future feature endpoints verified by these checks.

Prior user response Permission to broaden Write Scope was explicitly limited to two T17-FE integration paths (approved-scope.md). It does not authorize this different T18 file. Approval requested only for the minimal RoomsModule import/mount above.
