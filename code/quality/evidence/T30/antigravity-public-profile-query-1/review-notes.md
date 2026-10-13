# FG T30 - ProfilesService Public Profile Query Consolidation Review Notes (`antigravity-public-profile-query-1`)

## 1. Problem Context, Lock Contention & Performance Hypothesis

In Native18, the signaling gateway encountered statement timeout `57014` (3020ms / 3035ms / 3146ms) while acquiring room locks `FOR SHARE`.
While startup pool pre-warming successfully eliminated physical connection acquisition timeouts (`connectTimeout`), pool queue contention remains under load:
- Pool 2 was observed holding a `SHARE` room lock for 3515ms.
- The owner of pool 2 is **not yet proven** to be `RoomsService`; no conclusive attribution is asserted.
- Inspection of `RoomsService.getRoomDetail` and `listRoomMembers` reveals that both hold shared room ACL locks while awaiting public profile enrichment for all room participants (e.g., 6 participants in parallel).
- In `ProfilesService.getPublicProfile`, fetching each public profile executed **three separate SQL queries** sequentially:
  1. `SELECT FROM "user" WHERE id = $1`
  2. `SELECT FROM profiles WHERE user_id = $1`
  3. `SELECT FROM game_profiles INNER JOIN games WHERE user_id = $1`
- For 6 concurrent participants, this issued 18 sequential/interleaved database queries across the pool while holding the room lock.

### Hypothesis Status & Non-Weakening
Consolidating `ProfilesService.getPublicProfile` into a single SQL query is an architectural **performance hypothesis** intended to drastically reduce lock hold durations and pool pressure during room member enrichment. It is not claimed to be a proven single root cause for all lock waits. The Native18 failure is not treated as a test fixture artifact; no assertions, locks, authority checks, or timeouts are weakened.

---

## 2. Minimal Single-Query Consolidation in `profiles.service.ts`

1. **Atomic Single-Query Consolidation**:
   Consolidates the three separate queries into a single Drizzle query using nested selection and left joins:
   ```ts
   const rows = await this.db
     .select({
       user: schema.user,
       profile: schema.profiles,
       gameProfile: {
         gameId: schema.gameProfiles.gameId,
         gameTitle: schema.games.title,
         inGameName: schema.gameProfiles.inGameName,
         rank: schema.gameProfiles.rank,
         role: schema.gameProfiles.role,
         playHours: schema.gameProfiles.playHours,
         playStyle: schema.gameProfiles.playStyle,
       },
     })
     .from(schema.user)
     .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
     .leftJoin(schema.gameProfiles, eq(schema.gameProfiles.userId, schema.user.id))
     .leftJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
     .where(eq(schema.user.id, userId));
   ```
2. **Equivalent Joining & Filtering Semantics**:
   - Users with zero profiles and zero game profiles still return exactly one record (`rows[0].user`).
   - Orphan or absent game profiles are filtered with `r.gameProfile.gameId !== null && r.gameProfile.gameTitle !== null`, preserving the exact filtering semantics of the original inner join against `schema.games`.
3. **Exact Mapping & Contract Preservation**:
   - Reuses downstream transformation logic verbatim: `displayName` fallback, `customStatus` fallback, ISO 8601 `createdAt`, and `PublicProfileSchema.parse(publicProfile)`.
   - Preserves exact avatar fallback rules:
     - `profile.avatarUrl === null` -> strictly `null` (never overridden by user image).
     - `profile.avatarUrl === ''` -> falls back to user image or `null`.
     - `profile.avatarUrl` set -> custom avatar URL.
     - Profile missing -> falls back to user image or `null`.
   - Missing user throws exact `NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'User profile not found: ${userId}' })`.
4. **AST Byte-Identical Invariants**:
   - Only `getPublicProfile` is modified.
   - All other methods (`getPrivateProfile`, `getGames`, `updateProfile`, `onboarding`, `updateInterests`, `updateGameProfile`, `checkReservedName`, `initDatabase`) remain 100% AST byte-identical.
   - Constructor, exports, database options, and pool capacities remain unchanged.

---

## 3. Integration Test Suite (`t30-public-profile-query.integration.spec.ts`)

Tests run against a real local PostgreSQL database using an isolated schema and migrations:
1. **Observational Query Counter**:
   - Observes `pg.Client.prototype.query` calls during method execution.
   - Guarantees complete restoration in a `finally` block.
   - Leaves query parameters, options, and results untouched; logs no query text or secrets.
2. **RED / GREEN Verification**:
   - Original unmodified source executes **3 queries** (RED for single-query assertion).
   - Proposed source executes **1 query** (GREEN).
3. **Comprehensive Fixture Baseline**:
   - **Case 1 (Full Profile)**: Normal profile with two game profiles (Valorant and League of Legends), testing both fully populated and null fields, asserting `count === 1` and exact DTO shape.
   - **Case 2 (Bare User)**: User with no profile row and no game profiles, asserting `count === 1` and correct fallbacks for display name, avatar, bio, and status.
   - **Case 3 (Empty Avatar String)**: Profile with `avatarUrl: ''`, verifying fallback to user image.
   - **Case 4 (Explicit Null Avatar)**: Profile with `avatarUrl: null`, verifying explicit null is preserved over user image.
   - **Case 5 (Missing User)**: Asserts exact 404 `NOT_FOUND` with contract error code and message.
   - **Case 6 (Contract Validation Integrity)**: Negative test with an uncatalogued game title, proving contract validation is strictly enforced via `ZodError` without masking invalid data.
4. **Lifecycle & Clean Teardown**:
   - Wraps `service.onModuleDestroy()` and schema drop in `afterAll` `finally` blocks, restoring environment variables and database handles even if assertions fail.

---

## 4. File Verification & SHA-256 Hashes

| File | SHA-256 | Description |
| :--- | :--- | :--- |
| `profiles.service.ts` | `a6e17104fe042fe8253387ad082b010105ce1697f5bb4bbcd70997bb2d1c5d56` | Consolidated single-query `getPublicProfile` |
| `t30-public-profile-query.integration.spec.ts` | `47d6e51b504b84c37198995f46026717dfe3d0db2917de49d6443403b37e504e` | Real-PG integration tests verifying query count and contract DTO shapes |
| `review-notes.md` | *(Computed below)* | Documentation & performance hypothesis analysis |

*No production source, dist, tests, git ledger, or history files were altered. No build or test runs were executed. No claim of task PASS or native acceptance.*
