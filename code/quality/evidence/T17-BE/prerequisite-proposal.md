# FG Task T17-BE — Social, Direct Messaging & Blocking Read-Only Preflight Analysis & Prerequisites Proposal

**Date**: 2026-10-06  
**Task**: T17-BE (Backend: Friends, Direct Messages, and Blocking)  
**Status**: Preflight Analysis Complete (Read-Only)  
**Workspace Root**: `E:/FGweb`  
**Command Working Directory**: `E:/FGweb/code`  

---

## 1. Executive Summary & Context

Per FG workflow rules (AGENTS.md, `.agents/rules/02-task-sequence.md`, `05-backend-services.md`, `06-database-schema.md`, `07-contracts.md`, `08-testing-and-evidence.md`) and user instructions for 06/10/2026:
- This invocation executed a **READ-ONLY source preflight** for task **T17-BE**.
- **No changes** were made to production code, test suites, database schema, API contracts, spec documents, rules, or `quality/tasks.json`.
- Predecessor task evidence (T00 through T16-FE) remains frozen and untouched.
- Output artifact is strictly created at `quality/evidence/T17-BE/prerequisite-proposal.md`.

---

## 2. API Contract & Database Schema Mapping Analysis

All 10 social contract endpoints declared in `@fg/contracts` (`packages/contracts/src/moderation.ts`, `index.ts`) and `quality/api-contract.md` section 5.4 are fully supported by existing database schemas in `@fg/database` (`packages/database/src/schema/social.ts` and `conversations.ts`):

| API Endpoint | HTTP Method | Contract Schema | Database Table & Persistence Mapping |
| :--- | :--- | :--- | :--- |
| `/api/v1/friends` | `GET` | `ListFriendsQuerySchema` -> `Page<PublicProfileSchema>` | Queries `friendships` where `user1_id = actor OR user2_id = actor`, joining `user` and `profiles` for peer details. Sorted by `created_at DESC, id DESC` cursor. |
| `/api/v1/friends/requests` | `POST` | `SendFriendRequestSchema` -> `{ requestId, status: "PENDING" }` | Inserts into `friend_requests` (`sender_id`, `receiver_id`, `status='PENDING'`). On conflict (previous `CANCELLED`/`REJECTED` row), updates `status` to `'PENDING'` (retry support). Rejects self-request and active blocks. |
| `/api/v1/friends/requests/:id/respond` | `PATCH` | `RespondFriendRequestSchema` -> `{ success: true }` | Verified target is `receiver_id`. On `'ACCEPT'`, updates request status to `'ACCEPTED'` and inserts canonical pair `user1_id = min(a,b)`, `user2_id = max(a,b)` into `friendships` within a single DB transaction. On `'REJECT'`, updates status to `'REJECTED'`. |
| `/api/v1/friends/:userId` | `DELETE` | `RemoveFriendSchema` -> `{ success: true }` | Deletes row from `friendships` matching canonical pair `user1_id = min(actor, userId)`, `user2_id = max(actor, userId)`. |
| `/api/v1/friends/requests/:id/cancel` | `DELETE` | `CancelFriendRequestSchema` -> `{ success: true }` | Verified target is `sender_id`. Updates `friend_requests` status to `'CANCELLED'`. |
| `/api/v1/direct-conversations` | `GET` | `ListDirectConversationsQuerySchema` -> `Page<{ conversationId, peer }>` | Queries `conversations` where `kind = 'DM'` and (`user1_id = actor OR user2_id = actor`), joining `user` and `profiles` of peer. |
| `/api/v1/direct-conversations` | `POST` | `CreateDirectConversationSchema` -> `{ conversationId }` | Computes canonical pair `u1 = min(actor, recipient)`, `u2 = max(actor, recipient)`. Returns existing DM `conversationId` if present, or inserts new `kind = 'DM'` row. Rejects if active block exists. |
| `/api/v1/blocks` | `GET` | N/A -> `z.array(BlockSchema)` | Queries `blocks` where `blocker_id = actor`, joining `user` and `profiles` of blocked user. |
| `/api/v1/blocks` | `POST` | `CreateBlockRequestSchema` -> `BlockSchema` | Inserts into `blocks` (`blocker_id`, `blocked_id`). Unique constraint `block_pair_unique` prevents duplicate blocks. |
| `/api/v1/blocks/:userId` | `DELETE` | N/A -> `{ success: true }` | Deletes row from `blocks` where `blocker_id = actor AND blocked_id = userId`. |

### Key Findings & Integrity Rules:
1. **No Invented DTOs**: All endpoints map cleanly to existing `@fg/contracts` types without requiring backend-only custom DTOs or extra adapter layers.
2. **DM Friendship Independence**: DM conversations do NOT require prior friendship, strictly adhering to Spec Section 3 ("Nhắn riêng không yêu cầu kết bạn trước").
3. **Canonical Pair Enforcement**: `friendships` (`user1_id < user2_id`) and `conversations` (`kind = 'DM'`, `user1_id < user2_id`) constraints in PostgreSQL enforce single canonical rows per pair, preventing duplicate relationship state.

---

## 3. Direct Messaging (REST & WebSocket) Trace & Block Enforcement

### 3.1 REST Message Creation & Block Check Tracing
- **Current `ChatService.authorize` Logic**:
  - Checks if actor is logged in and not banned (`admin_actions`).
  - For DM conversations, verifies `actor.userId === conversation.user1_id || actor.userId === conversation.user2_id`.
- **Gap Identified**:
  - `ChatService.authorize` does **NOT** currently check the `blocks` table!
  - If User A blocks User B, User B can currently still invoke `POST /api/v1/conversations/:dmId/messages`.
- **Required Implementation for T17-BE**:
  - Extend `ChatService.authorize` (or add a dedicated block check in `ChatService` and `SocialService`) so that for DM conversations, if an active block exists between `user1_id` and `user2_id` in either direction, DM message write/send returns `403 FORBIDDEN` (`code: ErrorCode.FORBIDDEN`).
  - For Lobby conversations: Spec Section 3 states "Trong Lobby, nội dung tin nhắn từ người bị chặn bị ẩn cục bộ ở phía người chặn (locally hidden). Server lưu báo cáo được." Therefore, Lobby messages from blocked users are **still stored in DB**, and local hiding is handled on the client (T17-FE).

### 3.2 WebSocket Realtime Subscriptions & Deliveries Tracing
- **`RealtimeGateway.subscribe`**:
  - Emits `conversation.subscribe` with `{ conversationId }`.
  - Calls `ChatService.authorize(conversationId, actor)`.
  - Guest subscriptions (`actor === null`) to DM conversations are rejected with `403 FORBIDDEN`.
  - Non-participant subscriptions to DM conversations are rejected with `403 FORBIDDEN`.
- **`RealtimeGateway.deliver`**:
  - Before emitting `message.created` to a subscribed socket, re-checks `ChatService.authorize(conversationId, socketActor)`.
  - Unsubscribes any socket whose actor is no longer authorized.

### 3.3 History & Membership Preservation Policy Trace
- Spec Section 3: "Chặn không tự động kick người dùng khỏi phòng nhóm lâu dài hoặc xóa lịch sử chat cũ."
- Task T17-BE Acceptance: "block chặn DM/invite; chat riêng phải participant; dữ liệu quan hệ riêng không lộ qua public profile."
- Creating a block does **NOT** delete existing DM conversation records, room memberships, or historical messages. It halts **new** DM sends and **new** friend/room invitations.

---

## 4. AppModule Wiring Confirmation

- **Current `apps/api/src/app.module.ts`**:
  ```ts
  imports: [AuthModule, ProfilesModule, ChatModule, RealtimeModule, UploadsModule, PresenceModule]
  ```
- **Required Wiring for T17-BE**:
  - Create `apps/api/src/modules/social/` containing:
    - `social.module.ts`
    - `social.controller.ts`
    - `social.service.ts`
  - Add `SocialModule` to `imports` in `AppModule`.
  - No global interceptors, DB triggers, or provider hacks are required.

---

## 5. Friend Request Listing Contract Identification (T17-FE Boundary)

### Analysis:
- `@fg/contracts` (v1.0.0) exports `SendFriendRequestSchema`, `RespondFriendRequestSchema`, `RemoveFriendSchema`, `CancelFriendRequestSchema`, but does **NOT** currently include a contract endpoint for `GET /api/v1/friends/requests` (listing pending incoming/outgoing friend requests).
- Task T17-FE acceptance criteria requires rendering pending/accepted/blocked states ("social.test.tsx: pending/accepted/blocked states...").
- Rule 07 (`.agents/rules/07-contracts.md`) strictly prohibits inventing DTOs or endpoints inside `apps/api` without `@fg/contracts` definition: *"Một nguồn DTO/Zod schemas/event names ở packages/contracts. Không viết DTO copy riêng ở frontend/backend để che mismatch."*

### Recommendation:
- If T17-FE requires a dedicated REST endpoint to fetch pending incoming/outgoing friend request lists, a formal contract addition (`GET /api/v1/friends/requests`) should be proposed and approved for `@fg/contracts` and `quality/api-contract.md` prior to T17-FE.
- For T17-BE, implementation will strictly adhere to the frozen `@fg/contracts` v1.0.0 endpoints.

---

## 6. Privacy & Guest Protection Audit

1. **Public Profile Privacy**:
   - `GET /api/v1/users/:id/profile` returns `PublicProfileSchema`.
   - Strips private user attributes (`email`, `discordId`, `emailVerified`, auth tokens, onboarding completion).
   - Social relationship graphs (friend lists, block lists) are strictly private to the authenticated owner and are **never** returned in public profile endpoints.
2. **Outsider/Guest Protections**:
   - Guest requests to `/api/v1/friends*`, `/api/v1/direct-conversations*`, `/api/v1/blocks*` return `401 LOGIN_REQUIRED` (`SessionGuard`).
   - Non-participants attempting DM conversation history or subscriptions return `403 FORBIDDEN`.

---

## 7. Concrete Owner-Task Follow-Up Proposals & Allowlist for T17-BE

### 7.1 Target File Allowlist (Strict Scope for T17-BE Implementation)
- `apps/api/src/modules/social/social.module.ts` (NEW)
- `apps/api/src/modules/social/social.controller.ts` (NEW)
- `apps/api/src/modules/social/social.service.ts` (NEW)
- `apps/api/src/modules/chat/chat.service.ts` (MODIFY: add block check in DM `authorize` / message write)
- `apps/api/src/app.module.ts` (MODIFY: import `SocialModule`)
- `apps/api/test/social.integration.spec.ts` (NEW)
- `quality/evidence/T17-BE/**` (NEW evidence artifacts)
- `quality/tasks.json` (Task state update upon completion)

### 7.2 No-Feature-Change Rationale
- Implementation preserves all baseline rules established in T00-T16.
- No new external frameworks or npm dependencies are added.
- No database migrations are needed (schema in `social.ts` and `conversations.ts` is already in place from T05).

### 7.3 Test Plan (RED -> GREEN Lifecycle)
1. **RED Verification Step**:
   - Write integration tests in `apps/api/test/social.integration.spec.ts` covering:
     - Friend request lifecycle (send -> accept -> friendship created; send -> reject; cancel).
     - Unique constraint handling & retry after rejection/cancellation.
     - Direct conversation get-or-create (canonical user pair).
     - Block creation & deletion.
     - Block enforcement: Blocker/blocked cannot send DM messages or friend requests (`403 FORBIDDEN`).
     - Guest access attempts to social endpoints return `401 LOGIN_REQUIRED`.
     - Non-participant DM access attempts return `403 FORBIDDEN`.
   - Run `npm run test --workspace @fg/api -- --runInBand test/social.integration.spec.ts` -> Verify tests fail cleanly (RED).
2. **Implementation Step**:
   - Build `SocialService`, `SocialController`, `SocialModule`, update `ChatService.authorize`, wire into `AppModule`.
3. **PASS Verification Step**:
   - Run `npm run test --workspace @fg/api -- --runInBand test/social.integration.spec.ts` -> Verify tests PASS.
   - Run `npm run lint` and `npm run typecheck` across workspace.
   - Record evidence in `quality/evidence/T17-BE/`.

---

**Preflight Status**: Complete & Ready for Review.
