# FG API Contract & Data Model Specifications (v1)

> Package `@fg/contracts` (v1.0.0) exports Zod schemas, inferred DTO types, ErrorCodes with HTTP mappings, Socket.IO realtime event payload schemas, and the `ApiEndpointRegistry`.

---

## 1. API Contract Version & Core Principles

- **Version**: `API_CONTRACT_VERSION1` = `"1.0.0"`
- **Timestamps**: All dates/times are UTC ISO 8601 strings ending in `Z` (e.g. `2026-10-05T00:00:00.000Z`).
- **Identifiers**: Non-empty opaque strings (`IdSchema`). Whitespace-only strings are rejected.
- **Idempotency**: State mutations (e.g. creating recruitments, joining sessions, sending messages, approvals) support an optional `idempotencyKey` string to enable safe client retries.

---

## 2. Privacy & ACL Control Policies

1. **Guest vs Authenticated User**:
   - Guests can view the 7 Game catalog, public Lobby messages, and OPEN PUBLIC recruitment cards.
   - Guests CANNOT send chat messages, create recruitment cards, request to join teams, access private rooms, view private room chats, or join voice/screen share calls.
2. **Profile Privacy**:
   - Public endpoint `GET /api/v1/users/:id/profile` returns `PublicProfileSchema` which strips private fields (`email`, `discordId`, `emailVerified`, auth secrets).
   - Authenticated `/api/v1/me` and `/api/v1/me/profile` return `PrivateProfileSchema`.
   - Better Auth manages session credentials exclusively via HTTP-only secure cookies. Public session DTOs expose safe session metadata (`id`, `userId`, `expiresAt`) and never expose raw session tokens.
3. **Room Permissions & Helper ACL**:
   - Helper permissions: `MANAGE_CHAT`, `MANAGE_CALLS`, `MANAGE_RECRUITMENT`, `MANAGE_MEMBERS`.
   - Owner-only actions: `OWNER_TRANSFER`, `ROOM_DISSOLVE`.
   - `RoomMemberSchema` rejects assigning owner-only permissions to a `HELPER` role. Regular `MEMBER` roles cannot be granted elevated permissions.
4. **Invitations & Play Session Roster**:
   - `ROOM` invitation: Grants room membership only.
   - `PLAY_SESSION` invitation: Grants roster slot and active play slot.
   - Scheduled sessions require manual start by the host/helper with `MANAGE_RECRUITMENT`. Slot allocation is atomic and aborts on conflict without auto-kicking users from existing sessions.

---

## 3. Error Codes & HTTP Status Mapping

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "requestId": "req_12345",
  "details": {}
}
```

| Error Code | HTTP Status | Description |
| --- | --- | --- |
| `LOGIN_REQUIRED` | 401 | User must be authenticated via Discord OAuth session cookie |
| `FORBIDDEN` | 403 | Insufficient ACL permissions or guest user attempting restricted action |
| `NOT_FOUND` | 404 | Resource with specified ID does not exist |
| `CAPACITY_FULL` | 409 | Room limit (50), team roster limit (1-10), or call limit (10) reached |
| `ACTIVE_PLAY_CONFLICT` | 409 | User already occupies an active play slot in another session |
| `CALL_CLOSED` | 409 | Attempting to join or modify a call that has closed |
| `PUBLISH_LIMIT` | 409 | Maximum active screen share publishers (3) reached |
| `INVALID_INPUT` | 422 | Request body / query failed Zod schema validation |
| `RATE_LIMITED` | 429 | Too many requests sent in short window |

---

## 4. Socket.IO Realtime Events & Schemas

Path: `/socket.io`

| Event Name | ACL Scope | Payload Schema |
| --- | --- | --- |
| `message.created` | Public Lobby / Conversation Members | `SocketMessageCreatedPayloadSchema` (`MessageSchema`) |
| `message.deleted` | Public Lobby / Conversation Members | `SocketMessageDeletedPayloadSchema` |
| `presence.changed` | Public Lobby / Friends | `SocketPresenceChangedPayloadSchema` |
| `recruitment.updated` | Public Game Lobby | `SocketRecruitmentUpdatedPayloadSchema` (`RecruitmentSchema`) |
| `team.updated` | Room / Team Members | `SocketTeamUpdatedPayloadSchema` |
| `room.updated` | Room Members | `SocketRoomUpdatedPayloadSchema` (`RoomSchema`) |
| `call.updated` | Room Members | `SocketCallUpdatedPayloadSchema` (`CallGroupSchema`) |
| `notification.created` | Target User | `SocketNotificationCreatedPayloadSchema` (`NotificationSchema`) |
| `notification.read` | Target User | `SocketNotificationReadPayloadSchema` |

---

## 5. REST API Endpoint Registry (`/api/v1`)

Below is the complete listing of API endpoints bound in `ApiEndpointRegistry`:

### 5.1 Auth & User Profile
- **GET `/api/v1/me`** [Auth: Authenticated] -> Response: `MeDTOSchema`
- **PATCH `/api/v1/me/profile`** [Auth: Authenticated] -> Request: `UpdateProfileRequestSchema` | Response: `PrivateProfileSchema`
- **POST `/api/v1/me/onboarding`** [Auth: Authenticated] -> Request: `OnboardingRequestSchema` | Response: `PrivateProfileSchema`
- **PUT `/api/v1/me/interests`** [Auth: Authenticated] -> Request: `UpdateInterestsRequestSchema` | Response: `InterestsResponseSchema`. Replaces interests with at least one unique title from the locked seven-game catalog; invalid/duplicate/empty input returns422. Actor identity comes only from session; extra payload fields are rejected.
- **PUT `/api/v1/me/game-profiles/:gameId`** [Auth: Authenticated] -> Request: `UpdateGameProfileRequestSchema` | Response: `GameProfileSchema`. Replaces the actor's game details; rank/role/inGameName/playHours/playStyle remain optional. `gameId` comes from the route, `gameTitle` from the catalog; identity/catalog overrides in the payload are rejected. `playHours` is nonnegative numeric duration, not a local-time or ISO timestamp string.

### 5.2 Games & Public Profiles
- **GET `/api/v1/users/:id/profile`** [Auth: Public] -> Response: `PublicProfileSchema`
- **GET `/api/v1/games`** [Auth: Public] -> Request: `ListGamesQuerySchema` | Response: `z.array(GameSchema)`
- **GET `/api/v1/online-users`** [Auth: Public] -> Request: `ListOnlineUsersQuerySchema` | Response: `Page<PublicProfileSchema>`

### 5.3 Conversations & Messages
- **GET `/api/v1/conversations/:id/messages`** [Auth: ConversationRead] -> Request: `ListMessagesQuerySchema` | Response: `Page<MessageSchema>`
- **POST `/api/v1/conversations/:id/messages`** [Auth: ConversationMember] -> Request: `CreateMessageRequestSchema` | Response: `MessageSchema`
- **DELETE `/api/v1/conversations/:id/messages/:messageId`** [Auth: Authenticated] -> Response: `{ success: boolean }`
- **POST `/api/v1/uploads/images`** [Auth: Authenticated] -> Response: `AttachmentSchema`

### 5.4 Social, Friends & DM
- **GET `/api/v1/friends`** [Auth: Authenticated] -> Request: `ListFriendsQuerySchema` | Response: `Page<PublicProfileSchema>`
- **POST `/api/v1/friends/requests`** [Auth: Authenticated] -> Request: `SendFriendRequestSchema` | Response: `{ requestId: string, status: "PENDING" }`
- **PATCH `/api/v1/friends/requests/:id/respond`** [Auth: Authenticated] -> Request: `RespondFriendRequestSchema` | Response: `{ success: boolean }`
- **DELETE `/api/v1/friends/:userId`** [Auth: Authenticated] -> Request: `RemoveFriendSchema` | Response: `{ success: boolean }`
- **DELETE `/api/v1/friends/requests/:id/cancel`** [Auth: Authenticated] -> Request: `CancelFriendRequestSchema` | Response: `{ success: boolean }`
- **GET `/api/v1/direct-conversations`** [Auth: Authenticated] -> Request: `ListDirectConversationsQuerySchema` | Response: `Page<{ conversationId: string, peer: PublicProfileSchema }>`
- **POST `/api/v1/direct-conversations`** [Auth: Authenticated] -> Request: `CreateDirectConversationSchema` | Response: `{ conversationId: string }`
- **GET `/api/v1/blocks`** [Auth: Authenticated] -> Response: `z.array(BlockSchema)`
- **POST `/api/v1/blocks`** [Auth: Authenticated] -> Request: `CreateBlockRequestSchema` | Response: `BlockSchema`
- **DELETE `/api/v1/blocks/:userId`** [Auth: Authenticated] -> Response: `{ success: boolean }`

### 5.5 Rooms
- **GET `/api/v1/rooms`** [Auth: Authenticated, own membership only] -> Response: `Page<RoomSchema>`
- **GET `/api/v1/rooms/own`** [Auth: Authenticated] -> Request: `ListOwnRoomsQuerySchema` | Response: `Page<RoomSchema>`
- **POST `/api/v1/rooms`** [Auth: Authenticated] -> Request: `CreateRoomRequestSchema` | Response: `RoomSchema`
- **GET `/api/v1/rooms/:id`** [Auth: RoomMember] -> Response: `RoomSchema`
- **PATCH `/api/v1/rooms/:id/settings`** [Auth: RoomOwner] -> Request: `UpdateRoomSettingsRequestSchema` | Response: `RoomSchema`
- **GET `/api/v1/rooms/:id/members`** [Auth: RoomMember] -> Response: `z.array(RoomMemberSchema)`
- **PATCH `/api/v1/rooms/:id/helpers/:userId`** [Auth: RoomOwner] -> Request: `UpdateHelperPermissionsRequestSchema` | Response: `RoomMemberSchema`
- **DELETE `/api/v1/rooms/:id/members/:userId`** [Auth: Authenticated] -> Response: `{ success: boolean }`
- **POST `/api/v1/rooms/:id/transfer-owner`** [Auth: RoomOwner] -> Request: `TransferRoomOwnerSchema` | Response: `RoomSchema`
- **DELETE `/api/v1/rooms/:id`** [Auth: RoomOwner] -> Response: `{ success: boolean }`

### 5.6 Recruitments & Sessions
- **GET `/api/v1/recruitments`** [Auth: Public, OPEN PUBLIC only] -> Request: `PublicRecruitmentQuerySchema` | Response: `Page<PublicRecruitmentSchema>`
- **POST `/api/v1/recruitments`** [Auth: Owner or MANAGE_RECRUITMENT helper] -> Request: `CreateRecruitmentSchema()` | Response: `RecruitmentSchema`
- **GET `/api/v1/recruitments/:id`** [Auth: Public, OPEN PUBLIC only] -> Response: `PublicRecruitmentSchema`
- **PATCH `/api/v1/recruitments/:id/close`** [Auth: Owner or MANAGE_RECRUITMENT helper] -> Response: `RecruitmentSchema`
- **POST `/api/v1/recruitments/:id/join-requests`** [Auth: Authenticated] -> Response: `JoinRequestSchema`
- **GET `/api/v1/recruitments/:id/join-requests`** [Auth: Authenticated] -> Response: `z.array(JoinRequestSchema)`
- **PATCH `/api/v1/join-requests/:id/respond`** [Auth: Authenticated] -> Request: `RespondJoinRequestSchema` | Response: `JoinRequestSchema`
- **DELETE `/api/v1/join-requests/:id/cancel`** [Auth: Authenticated] -> Request: `CancelJoinRequestSchema` | Response: `{ success: boolean }`

### 5.7 Invitations & Play Sessions
- **POST `/api/v1/invitations`** [Auth: Authenticated] -> Request: `CreateInvitationRequestSchema` | Response: `InvitationSchema`
- **GET `/api/v1/invitations/me`** [Auth: Authenticated] -> Response: `z.array(InvitationSchema)`
- **PATCH `/api/v1/invitations/:id/respond`** [Auth: Authenticated] -> Request: `RespondInvitationSchema` | Response: `InvitationSchema`
- **POST `/api/v1/invitations/:id/approve`** [Auth: RoomOwner] -> Request: `ApproveInvitationSchema` | Response: `InvitationSchema`
- **POST `/api/v1/play-sessions/:id/start`** [Auth: Authenticated] -> Response: `PlaySessionSchema`
- **POST `/api/v1/play-sessions/:id/end`** [Auth: Authenticated] -> Response: `PlaySessionSchema`
- **POST `/api/v1/play-sessions/:id/leave`** [Auth: Authenticated] -> Response: `{ success: boolean }`

### 5.8 Voice / Screen Share Calls
- **POST `/api/v1/rooms/:roomId/calls`** [Auth: RoomMember] -> Response: `CallGroupSchema`
- **GET `/api/v1/rooms/:roomId/calls`** [Auth: RoomMember] -> Response: `z.array(CallGroupSchema)`
- **POST `/api/v1/calls/:id/join`** [Auth: RoomMember] -> Response: `CallJoinSchema`
- **POST `/api/v1/calls/:id/leave`** [Auth: Authenticated] -> Response: `{ success: boolean }`
- **GET `/api/v1/calls/:id/participants`** [Auth: Authenticated] -> Request: `ListCallParticipantsQuerySchema` | Response: `z.array(CallParticipantSchema)`
- **POST `/api/v1/calls/:id/external-live`** [Auth: Authenticated] -> Request: `SetExternalLiveRequestSchema` | Response: `ExternalLiveSchema`
- **DELETE `/api/v1/calls/:id/external-live`** [Auth: Authenticated] -> Response: `{ success: boolean }`
- **PATCH `/api/v1/calls/:id/participants/:userId/mute`** [Auth: Authenticated] -> Request: `MuteParticipantRequestSchema` | Response: `CallParticipantSchema`
- **POST `/api/v1/calls/:id/self-mic`** [Auth: Authenticated] -> Request: `ToggleSelfMicRequestSchema` | Response: `CallParticipantSchema`
- **POST `/api/v1/calls/:id/publish-token`** [Auth: Authenticated] -> Request: `RefreshPublishTokenSchema` | Response: `CallJoinSchema`
- **POST `/api/v1/calls/:id/participants/:userId/kick`** [Auth: Authenticated] -> Request: `KickCallParticipantSchema` | Response: `{ success: boolean }`

### 5.9 Notifications & Push
- **GET `/api/v1/notifications`** [Auth: Authenticated] -> Response: `Page<NotificationSchema>`
- **PATCH `/api/v1/notifications/:id/read`** [Auth: Authenticated] -> Response: `NotificationSchema`
- **PATCH `/api/v1/notifications/read-all`** [Auth: Authenticated] -> Response: `{ updatedCount: number }`
- **GET `/api/v1/notifications/preferences`** [Auth: Authenticated] -> Response: `NotificationPreferencesSchema`
- **PATCH `/api/v1/notifications/preferences`** [Auth: Authenticated] -> Request: `NotificationPreferencesSchema` | Response: `NotificationPreferencesSchema`
- **POST `/api/v1/push/subscriptions`** [Auth: Authenticated] -> Request: `WebPushSubscriptionSchema` | Response: `{ success: boolean }`
- **DELETE `/api/v1/push/subscriptions`** [Auth: Authenticated] -> Request: `z.object({ endpoint: z.string().url() })` | Response: `{ success: boolean }`

### 5.10 Community Moderation & Admin
- **POST `/api/v1/reports`** [Auth: Authenticated] -> Request: `CreateReportRequestSchema` | Response: `ReportSchema`
- **GET `/api/v1/admin/reports`** [Auth: Admin] -> Request: `ListAdminReportsQuerySchema` | Response: `Page<ReportSchema>`
- **PATCH `/api/v1/admin/reports/:id`** [Auth: Admin] -> Request: `UpdateAdminReportSchema` | Response: `ReportSchema`
- **GET `/api/v1/admin/users`** [Auth: Admin] -> Request: `ListAdminUsersQuerySchema` | Response: `Page<PrivateProfileSchema>`
- **PATCH `/api/v1/admin/users/:id/ban`** [Auth: Admin] -> Request: `AdminUserActionRequestSchema` | Response: `{ success: boolean }`

## T03 repaired request-time and access contracts

CreateRecruitmentSchema accepts an injected clock function (Date remains supported for fixed tests). Its default clock is evaluated on every parse, including reuse by ApiEndpointRegistry; historical DTO parsing never applies the future-time check.

Room lists return only rooms the authenticated user belongs to; room details/member lists require current room membership. PUBLIC visibility allows recruitment discovery and never grants room chat/call access. PublicRecruitmentSchema requires OPEN state and PUBLIC room visibility. Backend must filter/query by both before serialization and recheck room visibility, including public card detail; switching PRIVATE closes the card. Guest access remains public Lobby history, images according to conversation access, and OPEN PUBLIC recruitment cards.

ConversationRead permits guest reads only for canonical public Lobby; private chat/attachments require current conversation membership. ConversationMember requires authenticated authorized membership. MessageAuthorOrModerator requires author, applicable MANAGE_CHAT or website admin. RoomMember and CallParticipant require current membership, not merely login. RoomHelperOrOwner requires owner or the exact requiredPermission stored in the registry (MANAGE_CALLS for calls, MANAGE_RECRUITMENT for team/recruitment actions). Owner transfer/dissolve remain owner-only. Metadata is a contract, not an implemented authorization middleware; backend tasks must enforce it.

LobbyMessagesQuerySchema imports the shared GameTitleSchema enum of the approved seven games; no independent game-title validation. Public room endpoints cannot return private metadata even though members may receive private RoomDTOs.
