# FG T30 — Call Participant Lease Batching Minimal Implementation Proposal (`antigravity-call-participant-lease-batch-source-1`)

## 1. Executive Summary & Verification Context

- **Task**: FG T30 — Minimal Implementation Proposal following actual clean RED-2 verification.
- **Scope**: Strictly confined to `quality/evidence/T30/antigravity-call-participant-lease-batch-source-1/**`.
- **Target Files**:
  - `calls.service.ts`
  - `lease-store.ts`
  - `review-notes.md`
- **Operating Constraints**: Sequential single-task execution, Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents, proposals only. No application source, `dist/`, runtime configs, database migrations, ledger, or history files were modified. Zero tests, builds, or browser runs were executed by this agent.
- **Preceding Clean RED-2 Evidence**:
  - Execution: `2026-10-11T03:50:02.422Z` – `2026-10-11T03:50:40.422Z`, Exit Code: 1.
  - Evidence artifact: `codex-t30-call-participant-lease-batch-red-2.json` / `codex-t30-call-participant-lease-batch-red-2.txt` (`SHA256: 355f5f0d6df5921b8641e0926e0f4c7fd986870ee6761181c630ea3a1040e542`).
  - Result: 23 tests total, 19 passing, 4 expected failures:
    1. Public `participants` real guard queries: 3 observed vs 1 expected.
    2. Missing bulk helper `liveLeases` export assertion (empty input).
    3. Missing bulk helper `liveLeases` export assertion (absent/duplicate IDs).
    4. Missing bulk helper `liveLeases` export assertion (equivalence with individual `liveLease`).
  - Cleanups verified: schema, database pools, prototype observer, and environment restored successfully (`errorCount: 0`).
  - Real guards passing in RED-2: actual late lease revocation AND expiry, 1500ms PostgreSQL writer `FOR UPDATE` lock blocking with reader `FOR SHARE` verified via `pg_blocking_pids` resulting in 401 session denial, and per-participant ban, expiry, left, room membership, profile, and onboarding guards.

---

## 2. File Hashes & Transformation Summary

### Pinned SHA-256 Hashes

| Path | Type | SHA-256 Hash |
| :--- | :--- | :--- |
| `apps/api/src/modules/calls/calls.service.ts` | Base Source | `eabe88b1597df4c85f9fc76e871f00213107e87b3a942ad546e0578846c410ea` |
| `quality/evidence/T30/antigravity-call-participant-lease-batch-source-1/calls.service.ts` | Proposed Source | `13b05bbd3e8eed3384ef10aceb141817bd13267c7ba7ab8c40993c18ca69b531` |
| `apps/api/src/modules/calls/lease-store.ts` | Base Source | `de79098272f46678b703ad592cf3ab49993fc746f11ad017f42b97ada78a09f1` |
| `quality/evidence/T30/antigravity-call-participant-lease-batch-source-1/lease-store.ts` | Proposed Source | `36ece485c93dd1365f8ceb4c1ce9ea35aef052f802ecb6bd63213e4c2672f4b7` |

---

## 3. Detailed Source Transformation & Byte-Level Equivalence

### 1) `lease-store.ts`
- **Original File Prefix**: Lines 1 to 31 are 100% byte-identical to the current `apps/api/src/modules/calls/lease-store.ts`.
- **Appended Helper**: `export async function liveLeases(db: Pool | PoolClient, ids: string[]): Promise<LiveLease[]>`
- **SQL Parity**:
  - Prepared query name: distinct `fg_live_call_admissions_v1` (plural) vs `fg_live_call_admission_v1`.
  - Column projections: Byte-identical (`a.id,m.user_id,a.session_id,m.call_group_id,m.room_id,'fg-call_'||m.call_group_id AS room_name,s.expires_at AT TIME ZONE 'UTC' AS session_expires_at`).
  - Table joins: Byte-identical (`FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id JOIN profiles p ON p.user_id=m.user_id`).
  - Guard Predicates: Byte-identical except `a.id = $1` is replaced with `a.id = ANY($1::text[])`.
    - `a.revoked_at IS NULL`
    - `a.expires_at > clock_timestamp()`
    - `m.left_at IS NULL`
    - `c.state = 'OPEN'`
    - `s.expires_at > clock_timestamp() AT TIME ZONE 'UTC'`
    - `(a.disconnected_at IS NULL OR a.disconnected_at > clock_timestamp() - interval '30 seconds')`
    - `EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id = m.user_id)`
    - `COALESCE((SELECT action FROM admin_actions WHERE target_user_id = m.user_id AND action IN ('BAN', 'UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1), 'UNBAN') <> 'BAN'`
  - Input Handling:
    - Deduplicates input IDs: `const uniqueIds = [...new Set(ids)];`
    - Short-circuits empty input immediately: `if (!uniqueIds.length) return [];` (triggers 0 SQL queries).
    - Query parameter: `values: [uniqueIds]`.
    - Returns array directly: `return (await db.query<LiveLease>(...)).rows;`.
- **Preserved Functions**: `liveLease`, `publicationSources`, and `publicationPermission` remain completely untouched.

### 2) `calls.service.ts`
- **Imports**: Updated line 8 to import `liveLeases`:
  ```ts
  import {liveLease,liveLeases,publicationSources,publicationPermission,type LiveLease} from './lease-store.js';
  ```
- **Method `participantDtos`**:
  - The query fetching candidate DTO fields remains 100% byte-identical:
    ```ts
    const rows=(await db.query(`SELECT m.user_id,m.is_muted,p.display_name,p.avatar_url,p.custom_status,a.id AS media_identity,
     to_char(m.joined_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS joined_iso,
     EXISTS(SELECT 1 FROM call_publish_slots ps WHERE ps.call_group_id=m.call_group_id AND ps.user_id=m.user_id) AS publishing,
     EXISTS(SELECT 1 FROM call_restrictions r WHERE r.call_group_id=m.call_group_id AND r.target_user_id=m.user_id AND r.restriction_type='MIC_MUTED') AS restricted
     FROM call_members m JOIN profiles p ON p.user_id=m.user_id
     LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL
     WHERE m.call_group_id=$1 AND m.left_at IS NULL ORDER BY m.seat_index,m.user_id`,[id])).rows;
    ```
  - Replaces the serial `for` loop with one batched query:
    ```ts
    const candidateIds:string[]=[];for(const r of rows)if(r.media_identity)candidateIds.push(r.media_identity);
    const valid=new Set((await liveLeases(db,candidateIds)).map(l=>l.id));
    const result:CallParticipantDTO[]=[];
    for(const row of rows)if(row.media_identity&&valid.has(row.media_identity))result.push(CallParticipantSchema.parse({callId:id,userId:row.user_id,user:{id:row.user_id,displayName:row.display_name,avatarUrl:row.avatar_url,customStatus:row.custom_status},mediaIdentity:row.media_identity,micRestricted:row.restricted,isPublishing:row.publishing,isMuted:row.is_muted,joinedAt:row.joined_iso}));
    return result;
    ```
  - Empty `candidateIds` yields 0 SQL queries via `liveLeases` short-circuit.
  - Ephemeral `valid` `Set` is scoped strictly to the current execution; no cached state or cross-transaction leakage.
  - Preserves exact seat index ordering, `CallParticipantSchema.parse` validation, and error semantics.
- **Unchanged Methods**: All other methods (`onModuleInit`, `onModuleDestroy`, `config`, `transaction`, `actor`, `room`, `dto`, `create`, `list`, `controlsGroup`, `participants`, `selfMic`, `release`, `join`, `leave`, `revokeSession`, `sessionDeleted`, `reconcile`, `withControlGroup`, `requireAdmission`, `grantForAdmission`, `syncNativePermissions`, `muteNativeTrack`, `revokeMemberWithin`, `finishModeration`) remain 100% byte-identical.

---

## 4. Expected Test Outcomes on Unchanged Suite (GREEN-23)

When applied by Codex, the reviewed test suite `call-participant-lease-batch-tests2/t30-call-participant-lease-batch.integration.spec.ts` is expected to transition from 19/23 to 23/23 PASS:
1. `executes exactly 1 guarded lease query during CallsService.participants with 3 valid callers`: Now executes 1 query (GREEN, formerly 3).
2. `bulk helper liveLeases is exported and returns empty array with 0 SQL queries for empty input`: Now exported and returns `[]` with 0 queries (GREEN).
3. `bulk helper liveLeases fetches matching leases with 1 SQL query and handles absent IDs and duplicates`: Returns 2 valid leases in 1 query (GREEN).
4. `bulk helper liveLeases returns results structurally equivalent to individual liveLease calls`: Returns equivalent array in 1 query (GREEN).
5. All 19 prior passing tests (invalidation branches, access authority, post-lock-wait guard race, late revocation) remain passing.

---

## 5. Security & Verification Guardrails

- **Zero Secrets / Raw Logging**: No database connection strings, credentials, private tokens, or raw SQL queries with parameter values appear in logs or notes.
- **No Speculative Scope**: No changes to database migrations, contracts, schemas, lock modes, timeouts, pool configurations, cache, or external SFU transports.
- **Controlled Hypothesis**: Resolving the serial `liveLease` loop reduces the duration of shared row locks held on `rooms` and `call_groups` in `CallsService.participants`. However, native acceptance requires verification through canonical headed run 32 (`captureUiStep` + Telegram stream), and no performance or PASS claim is made at the proposal stage.
