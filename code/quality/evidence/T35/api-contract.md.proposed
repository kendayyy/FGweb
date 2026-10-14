# FG API Contract & Data Model Specifications (v1)

## AUTH02 — approved email/password extension (Better Auth1.7.7)

All routes below remain under `/api/auth`; Discord social login/callback/logout remain unchanged. Shared strict requests reject client identity/grant/hash overrides. FG owner DTOs allow `discordId:null`; public serializers still strip email/verification/provider/secrets. Native Better Auth private auth results use `BetterAuthUserSchema`, never a public profile or authenticated FG session inferred from signup.

| Method/path | Access | Shared request → response |
| --- | --- | --- |
| POST `/api/auth/sign-up/email` | Public | SignUpEmailRequest → SignUpEmailResponse |
| POST `/api/auth/sign-in/email` | Public | SignInEmailRequest → SignInEmailResponse |
| POST `/api/auth/fg/sign-in/admin` | Public | SignInAdminRequest (reserved kingame alias + credential proof) → SignInEmailResponse |
| POST `/api/auth/send-verification-email` | Public | SendVerificationEmailRequest → AuthStatusResponse |
| GET `/api/auth/verify-email` | Public | VerifyEmailQuery → VerifyEmailResponse (or same-origin callback redirect) |
| POST `/api/auth/request-password-reset` | Public | RequestPasswordReset → AuthMailResponse |
| POST `/api/auth/reset-password` | Public | ResetPasswordRequest → AuthStatusResponse |
| POST `/api/auth/change-password` | Current session | ChangePasswordRequest → ChangePasswordResponse |
| GET `/api/auth/fg/password-status` | Current session | none → PasswordStatusResponse |
| POST `/api/auth/fg/password-challenge` | Current session | PasswordChallengeRequest → AuthStatusResponse |
| POST `/api/auth/fg/password-attach` | Current session | AttachPasswordRequest → AuthStatusResponse |

AUTH-PASSWORD-03 creation/reset/change/attach/provision uses8–128 Unicode code points, at least one Unicode Lu and one P/S; whitespace is preserved but not special. No trimming or normalization. Native UTF16 bounds8–256 are only an envelope; shared schemas enforce code points/composition. Current/signin password1–128 code points supports legacy credentials without a composition gate. New salted scrypt hashes use fgscrypt-v1 with the installed work factors and exact input; only old untagged native hashes retain their historical NFKC verifier, without rewriting hashes. Creation requires verification24h and creates no session; duplicate signup uses the native generic response with a synthetic non-authenticated result, never discloses existing identity. UI displays the same check-email guidance, never signup success/session from this result. Reset expiry1h, one use, revokes sessions; only existing credential accounts can use reset, preventing reset from silently adding credentials to Discord users. Email verification must reject expiration/replay. Mail resend/signin/challenge endpoints are rate limited and require real SMTP acceptance; generic unknown-email replies do not assert delivery.

Fresh attachment sends a one-use secret link to the current user's stored email, bound to current user/session/email with24h expiry; request contains no target email/userId. Old `emailVerified` alone never authorizes attachment. Only the same currently valid non-banned session can consume the link and attach one credential while keeping userId/profile/community. Password status exposes only `hasPassword`. Direct Better Auth `/set-password` is disabled. Change requires current password and revokes other sessions. Relative same-origin callback paths only; no external or protocol-relative redirects. Token/body values must never appear in logs/evidence. Backend AUTH02-BE owns actual ACL, fresh challenge, SMTP, replay/race and existing-credential reset enforcement; this checkpoint declares contracts only.

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
   - Authenticated `GET /api/v1/me` returns `MeDTOSchema`; profile mutation responses use `PrivateProfileSchema`.
   - `/me` includes server-derived `onboardingComplete` (persisted profile plus at least one game interest) and `interestedGames` (unique titles from the locked seven-game catalog). These additive fields are optional in the shared schema for legacy consumer compatibility, with no invented defaults. The auth producer must return both; T11 treats missing state as an integration error. Public profile never exposes this private completion state or private identity fields.
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

Clients emit `conversation.subscribe` or `conversation.unsubscribe` with strict `SocketConversationRequestSchema` (`{conversationId}`). Identity and permission overrides are rejected. `SocketConversationAckSchema` is `{ok:true,conversationId}` or `{ok:false,error:ApiErrorResponseSchema}`; errors never acknowledge success. Guest subscriptions are limited to public Lobby conversations. Private subscriptions require current membership; origin, session validity and ACL are checked on every event and before delivery to an existing subscription. Session cookies are the only socket identity source. Unsubscribe releases the identified subscription and remains subject to these checks. Server `message.created` retains its existing MessageSchema payload, emitted only after database commit.

Presence realtime connections connect via dedicated `/presence` Socket.IO namespace for T16. Handshake requires valid same-origin header and authenticated session cookie (or guest access limited strictly to canonical approved game Lobbies). Authenticated sessions contribute heartbeats and tab leases (`PRESENCE_HEARTBEAT_INTERVAL_MS = 15000`, `PRESENCE_TTL_MS = 45000`). Private presence subscriptions require active membership rechecked on every event/heartbeat. Closing one tab decrements refcount without dropping other socket leases or altering chosen profile custom status.

Clients emit `presence.subscribe`, `presence.unsubscribe`, and `presence.heartbeat` with strict `SocketPresenceRequestSchema` (`{conversationId}`). Identity is derived server-side. Acknowledgement uses `SocketPresenceAckSchema` (`{ok:true,conversationId}` or `{ok:false,error:ApiErrorResponseSchema}`). Server emits `presence.changed` with `SocketScopedPresenceChangedPayloadSchema` requiring `conversationId`. Legacy `SocketPresenceChangedPayloadSchema` accepts optional `conversationId` for backwards compatibility.

Engine.IO transport path: `/socket.io`. Chat uses the default `/` Socket.IO namespace; presence uses the `/presence` namespace over the same transport path.

| Event Name | ACL Scope | Payload Schema |
| --- | --- | --- |
| `message.created` | Public Lobby / Conversation Members | `SocketMessageCreatedPayloadSchema` (`MessageSchema`) |
| `message.deleted` | Public Lobby / Conversation Members | `SocketMessageDeletedPayloadSchema` |
| `presence.subscribe` | Public Lobby / Room Members | `SocketPresenceRequestSchema` -> `SocketPresenceAckSchema` |
| `presence.unsubscribe` | Public Lobby / Room Members | `SocketPresenceRequestSchema` -> `SocketPresenceAckSchema` |
| `presence.heartbeat` | Authenticated Lobby user / Room Members; guests cannot create leases | `SocketPresenceRequestSchema` -> `SocketPresenceAckSchema` |
| `presence.changed` | Public Lobby / Friends / Room Members | `SocketScopedPresenceChangedPayloadSchema` (`SocketPresenceChangedPayloadSchema` legacy) |
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
- **PATCH `/api/v1/me/status`** [Auth: Authenticated] -> Request: `UpdateCustomStatusRequestSchema` (`{customStatus}`) | Response: `UpdateCustomStatusResponseSchema` (`{customStatus, isOnline?}`). Updates the custom status using locked enum (`LOOKING_FOR_TEAM`, `PLAYING`, `JUST_CHATTING`). Actor identity comes strictly from session. Optional `isOnline` reports lease state and does not replace the independently persisted chosen status.

### 5.2 Games & Public Profiles
- **GET `/api/v1/users/:id/profile`** [Auth: Public] -> Response: `PublicProfileSchema`
- **GET `/api/v1/games`** [Auth: Public] -> Request: `ListGamesQuerySchema` | Response: `z.array(GameSchema)`
- **GET `/api/v1/games/:id/online`** [Auth: Public] -> Request: `ListGameOnlineUsersQuerySchema` | Response: `Page<PublicProfileSchema>`. Returns paginated online user profiles for the specified game lobby.
- **GET `/api/v1/online-users`** [Auth: Public] -> Request: `ListOnlineUsersQuerySchema` | Response: `Page<PublicProfileSchema>`

### 5.3 Conversations & Messages
- **GET `/api/v1/games/:gameId/lobby/messages`** [Auth: Public] -> Request: `ListMessagesQuerySchema` | Response: `Page<MessageSchema>`. Opaque catalog game ID resolves its single Lobby. Unknown game returns404. The existing **GET `/api/v1/lobby/messages`** alias accepts `LobbyMessagesQuerySchema` with a locked seven-game title and returns the same page/ACL behavior.
- History starts with the latest page (default/max50), ordered by UTC `createdAt,id` descending. `cursor` identifies the exclusive oldest returned pair; subsequent pages are strictly older and never lose tied timestamps. Reconnect clients fetch latest and earlier pages until their last known message and merge by message ID. The REST history remains the recovery source; no socket silence is treated as complete history.
- **GET `/api/v1/conversations/:id/messages`** [Auth: ConversationRead] -> Request: `ListMessagesQuerySchema` | Response: `Page<MessageSchema>`
- **POST `/api/v1/conversations/:id/messages`** [Auth: ConversationMember] -> Request: `CreateMessageRequestSchema` | Response: `MessageSchema`
- **DELETE `/api/v1/conversations/:id/messages/:messageId`** [Auth: Authenticated] -> Response: `{ success: boolean }`
- **POST `/api/v1/uploads/images`** [Auth: Authenticated plus conversation write access] -> Request: `UploadImageRequestSchema`, multipart `conversationId` and one `file`. The adapter normalizes the file as `{bytes: Uint8Array, fileName, mimeType}` for the shared validator; client uploader/ownership fields are rejected. Response: `AttachmentSchema`. Server verifies actual bytes and decoded dimensions (JPEG/PNG/WebP,5MiB/20MP), re-encodes WebP and returns an opaque ID/URL without storage paths. Unsent drafts belong to their uploader and conversation and expire after24h (`IMAGE_DRAFT_TTL_MS`). Repeated uploads use opaque storage names; attachment claiming happens atomically with message creation.
- **GET `/api/v1/attachments/:id`** [Auth: ConversationRead] -> JSON `AttachmentUrlSchema` (`{url}`), pointing to the same-origin protected content route. Guests may read attached Lobby images; room/DM images require current conversation access. Unbound drafts additionally require the uploader. Invalid/revoked/banned sessions never become guests. Recheck permission on every metadata/content read; no public static storage directory or URL token bypass.
- **GET `/api/v1/attachments/:id/content`** [Auth: ConversationRead] -> `ImageContentSchema` raw HTTP bytes (`responseFormat: binary`), Content-Type `image/webp`; no JSON envelope. Apply the same draft/attached ACL as metadata, `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. Decoder-level validity is a server obligation; the shared binary schema validates transport type/size. Stable opaque URLs remain protected after being copied or after membership revocation.

### 5.4 Social, Friends & DM
- **GET `/api/v1/friends`** [Auth: Authenticated] -> Request: `ListFriendsQuerySchema` | Response: `Page<PublicProfileSchema>`
- **GET `/api/v1/friends/requests`** [Auth: Authenticated] -> Request: `ListFriendRequestsQuerySchema` (`{ direction?: "INCOMING" | "OUTGOING", cursor?: string, limit?: number }`) | Response: `Page<PendingFriendRequestSchema>`. Returns paginated pending friend requests for the authenticated actor. Backend is obligated to enforce actor-only filtering for `INCOMING` (actor is receiver) and `OUTGOING` (actor is sender) directions. Projected responses contain `requestId`, `sender` and `receiver` `UserSummary`, literal status `"PENDING"`, and UTC timestamps (`createdAt`, `updatedAt`); no email, provider ID, session metadata, or private profile fields are included. Friend relationships and requests are strictly private to the actor; no public relationship graphs are exposed. Existing send (`POST /api/v1/friends/requests`), respond (`PATCH /api/v1/friends/requests/:id/respond`), and cancel (`DELETE /api/v1/friends/requests/:id/cancel`) transport endpoints remain unchanged.
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
- **POST `/api/v1/invitations/:id/approve`** [Auth: RoomHelperOrOwner] -> Request: `ApproveInvitationSchema` | Response: `InvitationSchema`. Exact target-specific permission from `InvitationApprovalPermissionByTarget`: ROOM `MANAGE_MEMBERS`, PLAY_SESSION `MANAGE_RECRUITMENT`; owner implicit. Body invitationId must match path.

### T03-FIX10 — consent, settings and delegated invitation approval

- **GET `/api/v1/rooms/:id/settings`** [Auth: RoomMember] -> `RoomSettingsSchema`, current membership/session required.
- **PUT `/api/v1/rooms/:id/helpers/:userId`** [Auth: RoomOwner] -> `UpdateHelperPermissionsRequestSchema` / `RoomMemberSchema`, same full grant replacement as existing PATCH alias. Owner-only transfer/dissolve cannot be granted.
- Both invitation DTO targets include optional server-produced `recipientAcceptedAt` UTC ISO. Existing DTO payloads without it remain compatible. Create/respond/approve schemas strictly reject extra actor/consent fields; actor always comes from the authenticated session.
- PENDING without consent awaits receiver; PENDING with consent awaits authorized management under current OWNER_APPROVAL. ACCEPTED means committed admission. Respond can be performed only by receiver; management approval before consent returns409. Owner-sent invitations and DIRECT_MEMBER invitations still require recipient consent. Current policy, sender membership, receiver eligibility and management grant are checked before each mutation.
- Existing GET `/invitations/me` returns sent/received invitations and consented pending invitations the actor currently has target-specific permission to review. No unrelated private room invitations. Old create/respond/approve transports remain compatible.
- ROOM admission adds room/chat membership only, limited to50 members. PLAY_SESSION uses T22 shared atomic roster/active-slot capacity rules; scheduled invitation reserves roster without immediate occupation. Final retries preserve outcome; contradictory action409. No notification delivery or producer implementation is claimed by this contracts task; those checks belong to T23/T33.
### T03-FIX11 — current-member roster approval and play lifecycle

- **POST `/api/v1/play-sessions/:id/join`** [Auth: RoomMember] -> Request: `PlaySessionActionRequestSchema` / Response: existing `JoinRequestSchema`. Authenticated actor is applicant; PENDING is a request for approval, never admission. Current room members can request in PRIVATE rooms and with CLOSED recruitment cards; public discovery/apply from T22 keeps its PUBLIC/OPEN policy.
- **GET `/api/v1/play-sessions/:id/requests`** [Auth: RoomHelperOrOwner, MANAGE_RECRUITMENT] -> `z.array(JoinRequestSchema)`. Queue is restricted to current owner/exactly delegated helper; ordinary members, guests and unrelated users cannot read it.
- **POST `/api/v1/play-sessions/:id/requests/:requestId/respond`** [Auth: RoomHelperOrOwner, MANAGE_RECRUITMENT] -> Request: `PlaySessionRequestDecisionSchema` (`ACCEPT`/`REJECT`, strict) / Response: existing `JoinRequestSchema`. Request must belong to this session's recruitment. Actor/room/applicant/status overrides are rejected. Reuse persisted join_requests; no separate in-memory queue or duplicate request DTO. Same final decision retries preserve result; contradictory decisions return409.
- **POST `/api/v1/play-sessions/:id/start`** [Auth: RoomHelperOrOwner, MANAGE_RECRUITMENT] -> Request: `PlaySessionActionRequestSchema` / Response: `PlaySessionSchema`. Arrival of scheduled time does not start automatically. Manual start rechecks all reserved roster members and allocates the entire active roster atomically; any conflicting user returns409 and preserves the scheduled roster and other active team.
- **POST `/api/v1/play-sessions/:id/end`** [Auth: RoomHelperOrOwner, MANAGE_RECRUITMENT] -> Request: `PlaySessionActionRequestSchema` / Response: `PlaySessionSchema`. Idempotent end releases active slots, closes attached recruitment and preserves room/chat/call and historical roster. ENDED cannot be restarted or admit members.
- **POST `/api/v1/play-sessions/:id/leave`** [Auth: Authenticated] -> Request: `PlaySessionActionRequestSchema` / Response: `{ success: boolean }`. Release caller's roster/active slot independently of room and call. No actor supplied by client.
- `PlaySessionActionRequestSchema` accepts omitted/empty bodies and rejects null/extra fields. Session/path identity comes from server authorization; DTO/schema validation does not itself enforce membership or atomic allocation. T24 implements and verifies producers, T25 imports shared contracts; no runtime producer change is claimed by this checkpoint.

### T03-FIX12 — room play-session discovery (T25 prerequisite)

- **GET `/api/v1/rooms/:id/play-sessions`** [Auth: RoomMember] -> Query: `ListRoomPlaySessionsQuerySchema` / Response: existing `Page<PlaySessionDTO>`. Current authenticated/onboarded member reads scheduled/active/ended sessions in this persistent room, including PRIVATE rooms with CLOSED cards. Ordinary members can read; this endpoint exposes no manager request queue, call data or provider/account secrets. Guest401, nonmember403, unknown room404. Keep public OPEN/PUBLIC recruitment discovery unchanged.
- Pagination default20, maximum50. Stable newest `(createdAt,id)` descending; opaque base64url cursor encodes UTC createdAt/id. Server validates cursor before SQL, uses strict query normalization and rejects actor/room overrides, invalid cursor/limit422. Fetch limit+1 to derive hasMore; nextCursor only when additional rows remain. No unbounded room history read or guessed play-session IDs.
- Producer authorization/cursor enforcement is verified by T24-FIX1, while T25 imports shared response/query contracts. This contract checkpoint adds no database migration, runtime producer, public card field or product feature.

### 5.8 Voice / Screen Share Calls
- **POST `/api/v1/rooms/:roomId/calls`** [Auth: RoomMember] -> Request: `CallActionRequestSchema` | Response: `CallGroupSchema`
- **GET `/api/v1/rooms/:roomId/calls`** [Auth: RoomMember] -> Response: `z.array(CallGroupSchema)`
- **POST `/api/v1/calls/:id/join`** [Auth: RoomMember] -> Request: `CallActionRequestSchema` | Response: `CallJoinSchema`
- **POST `/api/v1/calls/:id/leave`** [Auth: CallParticipant] -> Request: `CallActionRequestSchema` | Response: `{ success: boolean }`
- T03-FIX14: all three actions send explicit `{}` and reject unknown fields (422). Actor/session, room membership, call capacity and SFU identity are resolved server-side; viewers use the same admission and count toward 10. Request contracts grant no permission. T26 owns live ACL, opaque server leases and self-hosted gateway `sfuUrl`; existing response DTOs are unchanged. No credential or original session identifier is returned.
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

### T03-FIX7 Room Chat Bridge Transport Contract

- **Separate Identifiers**: `RoomSchema` requires both `id` (the opaque room ID) and `conversationId` (the opaque underlying chat conversation ID). `id` and `conversationId` are distinct opaque identifiers and may differ.
- **Membership ACL**: Access to room chat via `conversationId` requires active room membership (`RoomMember` / `ConversationRead` / `ConversationMember`). Public room visibility permits recruitment card discovery only and never grants room chat or voice call access.
- **Uniform Room Response Shape**: All room endpoints returning room objects (`POST /api/v1/rooms`, `GET /api/v1/rooms/:id`, `GET /api/v1/rooms`, `GET /api/v1/rooms/own`, `PATCH /api/v1/rooms/:id/settings`, `POST /api/v1/rooms/:id/transfer-owner`) output `RoomSchema` / `RoomDTO` containing the required `conversationId`.
- **Public Recruitment Cards**: `PublicRecruitmentSchema` remains unchanged and does not expose internal room `conversationId` or private room metadata to unauthenticated users or guest catalog views.

### T03-FIX8 Recruitment transports (approved 2026-10-07)

POST /api/v1/recruitments requires authentication. Optional opaque roomId selects an existing permanent room; its current owner or helper with MANAGE_RECRUITMENT may create the card, only for that room's game and PUBLIC visibility. Without roomId, the authenticated creator owns a new permanent PUBLIC room. Server authorization is conditional on this choice; authentication alone does not grant management of an existing room. Existing request fields remain compatible.

GET /api/v1/games/:id/recruitments and GET /api/v1/games/:id/recruitments/suggestions use PublicRecruitmentQuerySchema and a page of PublicRecruitmentSchema. Path game ID is authoritative; supplied game filters must agree with it. Only OPEN PUBLIC cards are discoverable; suggestions also exclude full/ENDED sessions and use exact game/mode, missing slots ascending then updatedAt descending and id ascending. No membership/chat/conversation data is added to the public schema. The existing GET /api/v1/recruitments remains supported.

PATCH /api/v1/recruitments/:id/reopen returns RecruitmentDTO and requires current owner or MANAGE_RECRUITMENT helper, as does close. Close/reopen changes the card only: closing does not end a play session or release active slots. ENDED sessions cannot reopen; a new POST in the same room creates a fresh session while retaining room members and chat. Creating now reserves only the room owner/host roster and active slot atomically; scheduled creation reserves a roster without an active slot. Existing room members are not automatically added to the playing roster. Scheduled input uses the supplied request-time clock; backend ACL and concurrency remain T20 work.

### T03-FIX9 Team approval aliases and member snapshot (approved 2026-10-07)

POST /api/v1/recruitments/:id/requests is an alias of the existing POST /recruitments/:id/join-requests. The applicant always comes from the authenticated/onboarded session; a body cannot select another applicant. POST /api/v1/join-requests/:id/approve and /reject are path-action aliases for legacy PATCH /join-requests/:id/respond with ACCEPT/REJECT. All management paths require current room owner or helper with MANAGE_RECRUITMENT; aliases accept no action override. Persisted request id identifies retries; backend must make the same accepted/rejected result idempotent and reject contradictory final-state actions. Existing routes/DTOs remain compatible.

GET /api/v1/play-sessions/:id requires current room membership and returns TeamSnapshotSchema (existing PlaySessionSchema plus PlaySessionRosterSchema array), reused identically by SocketTeamUpdatedPayloadSchema. PUBLIC visibility does not authorize guests/nonmembers to read team snapshots or private chat/call information. No private account/provider fields are added. Server rechecks session, membership and permission. Producer enforcement and atomic approval remain T22; contracts are not implemented middleware.

## AUTH-ADMIN-SINGLE

The strict reserved alias request cannot select userId/email/role. Server resolves only the single fixed ADMIN_USER_IDS identity and delegates to the installed native email/password producer for credential, verification, session, ban and cookie behavior. Empty/multiple IDs fail closed; ADMIN_DISCORD_IDS grants are removed. Admin authorization also checks the stored kingame identity, email verification, credential ownership and current ban. Public signup/OAuth, native name update and profile/onboarding cannot claim the reserved name. No admin role from display names, email coincidence, helper grants or client payloads.

Server-only provisioning is serialized and binds a single immutable owner via a protected fg-admin-provision:v1 marker (identity digest only, not a login token). Collision in existing user/email/reserved profile causes refusal; no linking/takeover/default password. First prepare stores a pending unverified salted credential; only native real email verification permits activation. Retry preserves the stored password and userId; a different binding refuses. Config/input email/password remain local ignored files and are absent from public DTOs/logs/repository. Script status/activate never create or repair an identity; activation requires the fixed owner marker and verification. Admin/support pages remain their scheduled later checkpoints.

## T03-FIX13 — Stored play-session capacity

PlaySessionDTO carries optional playerCapacity, validated as an integer1–10. Omission preserves legacy transport compatibility without a fabricated default. Current T24-FIX2 producers must always return the session's stored player_capacity in snapshots, member discovery and mutation responses. Room settings are independently mutable and cannot substitute this value; private/CLOSED sessions do not require public recruitment access. A roster consumer receiving an omitted capacity must show an incomplete-data error rather than infer a room limit. No admission, room-settings, database or invitation policy changes.

## CHAT-CRYPTO-01 — DATA protocol contract

Shared Zod source: packages/contracts/src/chat-crypto.ts. ADR and migration/cutoff
plan: quality/crypto/adr-001-chat-encryption.md. Endpoints are locked for subsequent
CHATCRYPTO-BE/FE implementation; registry presence is not an implemented API claim.

| Method | Route | Authorization | Format |
| --- | --- | --- | --- |
| POST | `/api/v1/crypto/devices` | Authenticated | json → json |
| POST | `/api/v1/crypto/devices/:deviceId/one-time-keys` | Authenticated | json → json |
| GET | `/api/v1/crypto/devices` | Authenticated | json → json |
| DELETE | `/api/v1/crypto/devices/:deviceId` | Authenticated | json → json |
| PUT | `/api/v1/crypto/identity` | Authenticated | json → json |
| POST | `/api/v1/crypto/signatures` | Authenticated | json → json |
| GET | `/api/v1/crypto/conversations/:id/state` | ConversationMember | json → json |
| POST | `/api/v1/crypto/keys/query` | ConversationMember | json → json |
| POST | `/api/v1/crypto/keys/claim` | ConversationMember | json → json |
| POST | `/api/v1/crypto/to-device` | ConversationMember | json → json |
| POST | `/api/v1/crypto/verification` | ConversationMember | json → json |
| GET | `/api/v1/crypto/sync` | Authenticated | json → json |
| POST | `/api/v1/crypto/sync/ack` | Authenticated | json → json |
| POST | `/api/v1/crypto/conversations/:id/messages` | ConversationMember | json → json |
| GET | `/api/v1/crypto/conversations/:id/messages` | ConversationMember | json → json |
| POST | `/api/v1/crypto/conversations/:id/attachments` | ConversationMember | multipart → json |
| GET | `/api/v1/crypto/conversations/:id/attachments/:attachmentId` | ConversationMember | json → binary |
| PUT | `/api/v1/crypto/recovery` | Authenticated | json → json |
| GET | `/api/v1/crypto/recovery` | Authenticated | json → json |
| DELETE | `/api/v1/crypto/recovery` | Authenticated | json → json |
| GET | `/api/v1/crypto/conversations/:id/legacy/batch` | ConversationMember | json → json |
| GET | `/api/v1/crypto/conversations/:id/legacy/attachments/:attachmentId` | ConversationMember | json → binary |
| POST | `/api/v1/crypto/conversations/:id/legacy/commit` | ConversationMember | json → json |
| POST | `/api/v1/crypto/reports` | Authenticated | json → json |
| POST | `/api/v1/crypto/reports/attachments` | Authenticated | multipart → json |

Current membership/revision, device ownership/revocation, verified historical cohort
and single-admin consented-report ACL are additional server checks. Auth labels
alone do not grant these rights. Actor comes from the authenticated session.
Native SDK device/signature additions must match stored canonical public payloads;
no server verified flag/private device or recovery key. Prekey claims, session
bindings, revision updates and draft consumption require atomic transactions.

Private uploads: ciphertext only, 5 MiB actual byte quota, digest/ownership/revision;
attachment JWK/IV/private filename/MIME/dimensions stay inside decoded content.
Decoded content: 2,000-character body, existing 10,000px/20MP image policy, bounded
90 KiB UTF8 aggregate. Megolm ciphertext ≤131,072 base64 characters; crypto message
HTTP/socket envelopes need a separate bounded 192 KiB budget in BE. Keep existing
plaintext route limits, no broad unbounded socket/JSON parser. Olm batches ≤256 KiB,
public verification events ≤8 KiB, recovery ASCII export ≤16 MiB through its own
authenticated route. Validate decoded content before rendering; reject identity,
conversation, device, clientMessageId or membership revision mismatches.

Encrypted sync and public verification sync use independent cursors. Acknowledgment
IDs are recipient/device-owned, deduplicated and do not bypass current ACL. Legacy
plaintext is available exclusively to a verified migration cohort through the
legacy routes; regular history/object/cache/socket routes have no plaintext
fallback. Unknown historical access blocks reconciliation. Normal consumers do
not import the legacy plaintext DTO. Report text/images cross the E2EE boundary
only after selected evidence preview and explicit consent; encrypt under fg-report.
Recovery restores possessed room keys, not cloned device identity or server trust.

Producer/consumer ownership: API chat/realtime/social/rooms/uploads/moderation/
notifications, worker notifications; web direct-messages/lobby/rooms and shared
chat components/crypto client. The upcoming BE/FE checkpoints cover these paths.
No change to media admission, voice/live target, support/feed or approved themes.

CHATCRYPTO-BE additive realtime prerequisite: `crypto.subscribe` and
`crypto.unsubscribe` use strict `{conversationId, deviceId}`. Successful ACK binds
the conversation, device and current membershipRevision; denied ACK uses the
existing strict ApiErrorResponse. `crypto.message.created` carries only the
EncryptedMessageSchema; legacy `message.created` retains its MessageSchema.
Every delivery must recheck session/ban/membership/device and history interval;
subscription alone is not authorization. REST history/sync remains reconnect
recovery, with no private keys or plaintext in Redis/outbox/push.

CHATCRYPTO-BE additive report-reader prerequisite: POST
`/api/v1/crypto/reports/:reportId/read` accepts strict `{}` for the sole server
admin and returns DisclosedReportSchema only after successful metadata audit.
GET `/api/v1/crypto/reports/:reportId/attachments/:attachmentId` returns binary
WebP only for IDs selected inside the authenticated report payload. Independent
fg-report reader custody, fresh session/ban/grant/expiry rechecks and shared
evidence locks are mandatory. Responses use no-store; unavailable custody/audit
never returns plaintext. Disclosure authenticity remains USER_SUPPLIED_UNVERIFIED.
These routes give no private conversation/key/history access.

CHATCRYPTO-BE Lobby storage prerequisite: existing public message/upload/image
routes retain their DTOs. Activated Lobby state must be RECONCILED and use
separate fg-lobby native AEAD custody; absent/denied custody fails503 without
plaintext fallback. LobbyStoredMessageSchema is an internal authenticated
storage payload bound to conversation/message IDs, never a client crypto request.
Normalized image metadata uses fixed image.webp/image/webp and source size≤5MiB;
original filenames are not persisted. Drafts are uploader-only, consumed images
public through the existing no-store image route and authenticated parent selection.
Ciphertext representation≤8MiB does not change source5MiB/20MP restrictions.
Conflicting clientMessageId retry returns409. Lobby storage encryption is not E2EE.

CHATCRYPTO-BE protocol wakeup prerequisite: `crypto.sync.available` carries strict
SocketCryptoSyncAvailableSchema `{conversationId,deviceId,membershipRevision}`.
Only an authorized current conversation/device subscription receives it. No
ciphertext, keys, event ID, recipient identity or verification payload is sent.
It signals a REST sync using the existing independent encrypted/verification
cursors and recipient-owned ACK. Durable metadata-only outbox references exactly
one authoritative queue event; duplicate/missed wakeups do not replace queue
state, grant access or claim key delivery. Recheck session/ban/member/device/epoch
and queue expiry/ACK on actual emission; Redis routing stays server internal.

CHATCRYPTO-BE protocol wakeups: Redis routing contains only strict kind=PROTOCOL_WAKE, queue=ENCRYPTED|VERIFICATION and opaque eventId. The public crypto.sync.available hint is conversationId/deviceId/membershipRevision only. Dispatch uses at most25 unlocked jobs/transaction; bus delivery has at most64 pending operations and512-character messages. Hints do not ACK queues; clients recover missed hints with existing independent REST sync cursors on reconnect and periodic catch-up while active. Actual PostgreSQL source expiry, ACK and current session/device/member/epoch checks apply before emission. No key/ciphertext/verification body in hints. No production activation claim.

CHATCRYPTO-BE verified legacy source reads: legacy/batch now requires a strict sourceManifest binding original IDs/client ID/type/text/reply/mentions, exact UTC source timestamps and sorted original image metadata with physical plaintext SHA256. The item fields must agree with the manifest. Cohort and per-message PREPARED mapping must already exist; current membership alone or caller claims do not establish old entitlement. KNOWN private unreconciled history, active owned device registered before cohort verification, current session/member/ban and post-I/O checks are mandatory. after is an original mapped message ID in the same cohort/conversation; responses are no-store/nosniff. Images are original bounded WebP bytes without normalization. These reads do not reconcile or delete sources.

CHATCRYPTO-BE candidate prerequisites: LegacyCandidateSchema represents PREPARED ciphertext only, binding source/cohort/revision/hash and actual importer identity. Optional commit attachmentMappings bind original attachment ID to a ciphertext draft and source/ciphertext digests, without file secrets. LegacyRoundtripAttestationSchema is strict Matrix signed JSON with registered recipient and complete candidate/image bindings; a native signature authenticates a client claim, not server decryption. LegacyReconcileRequestSchema contains cohort/revision/device and expected source count, with no force/verified/delete override. Imported message DTOs require separate importProvenance; LIVE messages reject it. LegacyImportedContentSchema is client-only, inside Megolm, retaining exact source manifest and native v2 image secrets. Candidate preparation/receipt/reconcile routes remain unimplemented at this prerequisite checkpoint.

CHATCRYPTO-BE legacy text preparation now implements POST /api/v1/crypto/conversations/:id/legacy/commit, returning strict LegacyCandidateSchema (PREPARED), not generic success. Optional candidateId is chosen before client archive encryption; omission retains old six-field request compatibility by server allocation, with no verified-archive claim. The server checks source/cohort/current revision, pre-verification owned device and optional native sender metadata, canonical public encodings, all original recipients still eligible, session/cohort binding and immutable retry identity. Digest/source/time remain intact and no RECONCILED transition occurs. Image preparation remains explicitly unavailable until native file/retention proofs; receipt/reconcile/upload and archive restore remain pending.

CHATCRYPTO-BE historical protocol amendment (current implementation; IN_PROGRESS): keys/query, keys/claim, verification and to-device accept an optional strict cohortId. It is mandatory for KNOWN unreconciled private history and must name a verified original cohort with mapped PREPARED sources; RECONCILED LIVE requests omit it. Keys/devices are filtered or rejected at the original verification cutoff. Authoritative encrypted/verification queues persist the context and retries compare it immutably. Sync returns cohortId only for historical events and rechecks current epoch/member/session/ban, sender/recipient devices and expiry. ACK validates every addressed authoritative row before and after updating, preserves eligible repeat timestamps, and rolls back mixed requests. Socket crypto subscribe/unsubscribe accept the same context, bind it to the subscription, and reauthorize delivery; CRYPTO_SYNC_AVAILABLE and Redis/outbox signals remain metadata-only. Native text archive roundtrip does not assert image/all-source migration or production readiness.

CHATCRYPTO-BE recipient-claim amendment (IN_PROGRESS): GET /api/v1/crypto/conversations/:id/legacy/candidates/:candidateId accepts strict deviceId/cohortId and returns the existing PREPARED ciphertext/public provenance DTO with no-store after revalidating current epoch, original mapped source, canonical hashes, importer device/session and recipient availability. POST /api/v1/crypto/conversations/:id/legacy/attest accepts LegacyRoundtripAttestationSchema, authenticates the session owner and required actual device Ed25519 signature against server-derived bindings, bounds JSONB16KiB, persists an immutable public claim and preserves exact retry time using canonical signature maps. All source/recipient authorization is rechecked after writes. Native decryption is separate evidence; no decrypted archive/private key, images, reconciliation or cleanup is exposed by these endpoints.


### CHATCRYPTO-BE historical image candidate preparation (current IN_PROGRESS subset)

`POST /api/v1/crypto/conversations/:id/legacy/uploads` uses one metadata JSON multipart field and one opaque file, max5MiB. LegacyEncryptedUploadRequestSchema requires the original cohort, current epoch, clientUploadId and registered preverification device. Only ciphertext size/SHA and opaque IDs enter storage; immutable retry and post-write authorization apply. Ordinary LIVE attachment reads/claims refuse nonNULL historical cohort drafts.

CommitLegacyCiphertextSchema attachmentMappings now requires the complete ordered original attachment set, physical original digest and owned historical encrypted drafts with exact context/hash/size. New expired drafts are denied. Prepared mappings retain their ciphertext after expiry and cannot change on retry. Candidate GET returns original attachmentIds. `GET /api/v1/crypto/conversations/:id/legacy/candidates/:candidateId/attachments/:attachmentId` requires strict device/cohort query and returns verified ciphertext as application/octet-stream/no-store/nosniff; source, epoch, importer/session and all original recipient availability are rechecked. Receipt attachmentDigests are derived from actual ordered mappings. Descriptor secrets remain exclusively in native client Megolm archives. Native v2 key_ops requires both encrypt/decrypt as distinct operations without a positional order. No source reconciliation/cutover/production claim is made.

Historical cutoff prerequisite (internal only): CryptoLegacyService.reviewReconciliation validates existing LegacyReconcileRequestSchema without exposing a reconcile REST producer or mutating source/state. It requires whole-conversation LEGACY_PENDING counts including unmapped rows, current native candidates/physical source/objects, and matching signed claims from every active preverification original device. Count/claim/object/context mismatch fails; a second source/object pass precedes final checks. Complete source conversion, staged maintenance/cleanup/encrypted restore and mixed-cohort cutoff remain unimplemented. See legacy-cutoff-readiness-review.md for native proof and resource/atomicity limits.

Internal readiness multi-cohort amendment: derive cohorts from each authoritative source mapping, authorize reviewing actor/device against each original cohort before reading that source, and derive/verify required native claims separately per cohort. The request cohort cannot replace source entitlement. Complete multi-cohort snapshots add sorted cohortIds; single-cohort shape remains unchanged. Native Alice/Bob versus Alice/C contexts prove distinct room-key/session/claims and deny cross-history plus actors outside any original cohort; Alice-only second claim does not suffice. This supersedes the prior single-cohort rejection limitation for the tested internal gate. REST cutoff/maintenance/source removal/restore remain open.

### CHATCRYPTO-BE internal durable legacy staging subset —09/10/2026

Internal stageReconciliation uses the existing strict LegacyReconcileRequest in the verified original-cohort transaction; no new REST endpoint or successful cutoff response. Public operation/manifest/source-image metadata are durable under0020, with exact candidate/cohort/epoch and original-image/draft references. Native SDK/PG subset verifies rollback/retry/service-restart/actor denial while every source remains LEGACY_PENDING. Stage is not conversion, server decryption proof or production activation. Full lifecycle and imported-history/restore remain open.


### CHATCRYPTO-BE imported-history consumers —09/10/2026 (subset)

Existing private messages/attachment GET paths support reconciled imported ciphertext with exact original IDs/time/client ID, strict importProvenance and original per-source cohort authorization. LIVE intervals cannot grant old history; a revoked importer public tombstone remains readable by eligible originals. Candidate/source/stage/session-envelope/image bindings and completed cleanup markers must match or fail closed. Actual native clone fixture verifies mixed-cohort REST reads, owner-bound microsecond pagination, staged metadata/object tampering, current bans/post-I/O bans and buffer clearing, MIGRATING denial and realtime null. Native recovery independently restores client-side encrypted text/image archives with wrong-code/tamper/expired-session rejection. These are prerequisites; the cutoff producer, actual source cleanup, production activation and authenticated database/object backup restore remain open. See evidence/CHATCRYPTO-BE/legacy-import-read-review.md and legacy-archive-recovery-review.md.


### CHATCRYPTO-BE atomic staged DB conversion —09/10/2026 (internal subset)

Internal convertStagedReconciliation reuses complete native all-source receipt/candidate/source/object/stage gate, commits only exact ciphertext/original IDs/public mappings and marks DB_CONVERTED with conversation MIGRATING at old epoch. It never deletes source files, exposes plaintext fallback, publishes the nextLIVE epoch or adds a REST cutoff endpoint. Converted retry/restart revalidates retained public bindings/opaque ciphertext/native claims without server key recovery. Native PG source/attachment faults and a recipient BAN introduced during writes prove full rollback including consumed draft/TTL; concurrent retries converge. Existing candidate-bound expired images use actual atomic claim clock with minimal expiry extension solely to preserve the unchanged lifecycle constraint, never a LIVE expiry bypass. Reader follow-ups prove post-I/O changed-source409/zeroed buffers and exact microsecond UTC-convention timestamps/cursors under nonUTC connection timezone. Physical cleanup/resume/cutoff, imported report selection, authenticated DB/object backup restore, production graph/custody/performance/security remain open. Evidence: evidence/CHATCRYPTO-BE/legacy-conversion-review.md and legacy-import-read-review.md.

### CHATCRYPTO-BE internal cleanup and imported reports — 2026-10-09
Native legacy-cleanup-boundary-1 19/19: source-directory pin, exact owned unlink, PG marker/finalization failures, ENOENT/restart, next LIVE epoch/send and completed retry. Native legacy-report-boundary-1 38/38: original-cohort explicit USER_DISCLOSED selected text/image on existing report routes, exact completed imported binding, late KMS ban rollback, sole-admin selected evidence reads/audits; no full private-history access. Cleanup remains internal/default disabled and no new REST contract/schema/main migration/production activation. See code/quality/evidence/CHATCRYPTO-BE/legacy-cleanup-review.md and legacy-report-review.md. Task IN_PROGRESS; operational backup/restore/custody/wiring/notifications/moderation/security/performance remain open.


CHATCRYPTO-BE native backup/restore + LIVE object authority (09/10/2026): UUID-only encrypted DB/object archive under separate nonexportable fg-backup key, operation/tamper/role separation, rotation/rewrap and actual AppModule/SDK restore preserve ACL/history/public Lobby/selected report. Fresh client without keys remains MissingRoomKey. LIVE attachment rechecks actor/session clock/current membership/state/draft binding after filesystem I/O; real late BAN/interval/digest changes return403 with rejected buffer zero. Evidence backup-restore-review.md/live-object-authority-review.md, boundary2 five native cases; no production/off-machine, general backup CLI or full BE PASS claim.


CHATCRYPTO-BE private DM notification subset (09/10/2026): existing GET /api/v1/notifications and notification.created DTO remain unchanged. Crypto namespace emits fixed generic DM text and ID-only data; inbox is authenticated/no-store, bounded by existing PaginationQuery limit1–50 with opaque notice-ID cursor. Owner/current source visibility/session clock rechecked before response/emission; malformed/changed metadata and revoked access filtered. Only private crypto-dm IN_APP jobs handled here; other notification endpoints/types remain owned by their later tasks. This records scoped backend behavior, not production/PWA or general notification completion.

Client-selected private mentions codec prerequisite (09/10/2026): SendEncryptedMessageSchema and LIVE EncryptedMessageSchema allow optional mentionedUserIds (distinct opaque IDs≤128 chars, list≤1000). Omitted remains compatible; LEGACY_IMPORT DTO rejects the new LIVE-only routing field. IDs are routing claims selected by the client, with actual mention semantics in encrypted binding; server cannot verify/decrypt mention text. Existing HTTP total body quota still applies. Producer must reject self/unknown/outsider/banned targets atomically, bind retry selection in existing mentions table, and enforce current member/source visibility/preferences in generic MENTION delivery; backend producer/transport integration not yet verified at this codec milestone.


### CHATCRYPTO-FE native SAS transport IDs

`SendCryptoVerificationSchema.transactionId` is the unchanged native SDK to-device HTTP transport transaction ID, used for relay idempotency and content-conflict detection. `content.transaction_id` is the separate unchanged native SAS verification flow ID, shared across request/ready/start/key/mac/done steps. They need not be equal. The client and relay never rewrite either ID to the other. Strict public event schemas and sender `from_device` ownership remain enforced; native SAS cryptographically binds the flow and authenticates keys before the client grants trust. This correction follows ADR001 and changes neither protocol nor database uniqueness. Original source/test/document bytes and the actual native RED remain in CHATCRYPTO-FE evidence; earlier PASS records are historical.


### CHATCRYPTO-FE native sync context and depletion

Authenticated crypto sync returns `oneTimeKeyCounts.signed_curve25519`, the actual unclaimed key count for the requesting user/device (0–100, matching admission), and original `conversationId`/`membershipRevision` on verification events. Counts are read before final device/session/membership rechecks. They never grant trust or allow a foreign-device query. Native upload acknowledgements use this count; recipients feed it into native sync to replenish signed keys on depletion. The client does not guess missing counts or incoming verification conversation context.

CHATCRYPTO-FE historical context discovery: GET /api/v1/crypto/conversations/:id/state optionally includes legacyCohorts: [{cohortId,sourceCount,members:[{userId,deviceIds}]}]. Only verified cohorts containing the authenticated actor with PREPARED source rows appear while history is KNOWN and E2EE migration is pending. Device IDs are nonrevoked and created no later than cohort verified_at; a new device has no historical entitlement. Empty deviceIds means unavailable, never verified/trusted. No source plaintext/private keys or automatic migration is returned. Reconciled/unknown/Lobby states return an empty array. Maximum1000 cohorts,1000 members per cohort,10000 members total,100 devices per member; overflow fails closed without truncating recipients. Existing batch/query/share/attest ACLs still enforce actual cohort and current authorization on every operation.


### T29 — screen publishing and call moderation transport

POST /api/v1/calls/:id/screen-share/claim requires the current session-bound call participant and strict empty body. A server-allocated ordinal1–3 is atomic per call and idempotent per user. It returns the existing CallJoinDTO using the current admission identity; source permissions are derived from current membership/restrictions/slot server state, not stale token claims. Quota does not limit microphone viewers.

POST /api/v1/calls/:id/screen-share/release accepts strict empty body, releases only the actor's slot idempotently and returns strict {success:true}. Moderation endpoint POST /api/v1/calls/:id/moderation accepts strict {action,targetUserId}; actions MUTE_MIC, ALLOW_MIC, STOP_SCREEN_SHARE, ALLOW_SCREEN_SHARE, KICK. Current room owner or current helper with MANAGE_CALLS only; no client actor/role/permission. Mute/stream restrictions prevent self re-enable until allowed. Kick revokes the current admission and publication, preserving persistent room membership/chat/team; it is not a room ban.

The existing publish-token and participant mute/kick/stop-publish registry entries remain preserved as compatible service aliases, with their strict existing path/body semantics. Screen and microphone grants are separately restricted; camera/data publication remain unavailable. Token replay or direct native SDK publication does not bypass the current gateway/SFU policy. Producer/native evidence is required before implementation PASS; contract declarations alone do not prove enforcement.


### T29 native publication policy review

Canonical screen claim/release and moderation routes use the shared strict contracts; legacy publish-token/mute/kick/stop-publish aliases preserve their DTO/statuses and reject extra authority fields/path mismatches. Actor/session, current room membership, owner or current HELPER + permission_grants.MANAGE_CALLS, target admission and slot quota are server state.

Screen claims allocate exactly one of ordinals1–3 per user atomically and idempotently. The private signaling gateway rewrites original/SFU-refreshed grants from current DB policy, checks native JoinResponse before forwarding bytes, and serializes AddTrack with room/group controls. A screen quota permits one native video track and optional one native screen-audio track; only an existing verified native SID may add another codec. Duplicate/unknown/camera/source-type violations receive protocol NOT_ALLOWED/LIMIT_EXCEEDED; no fabricated publication success. No data or own-metadata publication grants.

Moderator MIC_MUTED suppresses outgoing MICROPHONE and SCREEN_SHARE_AUDIO to prevent a microphone re-labeled as screen audio from bypassing mute. Screen video/quota and incoming subscriptions remain available. ALLOW_MIC restores allowed audio sources without automatically starting a device. User self-mic intent remains separate. STOP_SCREEN_SHARE frees quota and blocks reclaim until allow; KICK revokes admission/seat/slot/native peer without removing persistent room/chat/team membership.

Verified signed native track_unpublished events and reconciliation return quota; unused reservations expire at30s, and admission disconnect grace remains30s. Late event identity/time/slot generation cannot restore stale grants. Evidence: quality/evidence/T29/; local tests only, closure.json controls completion. No main migration, production activation, physical/audible-quality or1,000-media claim.


## T31 reviewed external-source backend

PUT and legacy POST `/api/v1/calls/:id/external-live` accept the shared strict provider/url/title request and return200 ExternalLiveSchema. GET returns200 ExternalLiveSchema or JSON null when absent; DELETE returns200 `{success:true}` and is idempotent. Every verb requires the current session-bound, unbanned, onboarded call admission and room membership. A room/helper role alone is insufficient. One row/call is replaced atomically under existing call/room locks.

Stored `videoId` or lowercase `channelName` accompanies canonical HTTPS URL; `availability` is always `unknown`, never a source-existence/health assertion. Server only parses whitelisted YouTube watch/youtu.be/live/embed/shorts and Twitch channel inputs, strips ancillary query/fragment data, never fetches arbitrary URLs. Legacy source rows remain; recognizable IDs backfill, unrecognized rows stay preserved without a health claim. Creator leave and call closure clean the source in the same DB transaction, retaining room/chat. Frontend playback/Twitch parent belongs to T32.


## T33 reviewed in-app notifications

GET `/api/v1/notifications` returns the existing typed cursor page, currently authorized source metadata and trusted generic text. GET `/notifications/unread-count` returns `{unreadCount}`. PATCH `/notifications/:id/read` returns the owned authorized NotificationDTO; PATCH `/notifications/read-all` returns `{updatedCount}` and touches only the actor. Reads are idempotent, require current session/ban/source permission, and emit committed read IDs for fresh server-authorized same-user sockets. Missing or foreign source IDs return404; unauthenticated requests401; CSRF writes403; malformed inputs422. All routes are no-store.

GET `/notifications/preferences` returns all eight event types and three channels with approved defaults. PATCH accepts a strict nonempty full or partial per-event/channel object, preserves omitted values and rejects EMAIL=true for DM/MENTION/JOIN_REQUEST/JOIN_REQUEST_RESULT. Actor identity comes from the server session. Producers use the same domain transaction for notification and permitted channel outbox records; unique recipient/event and channel/recipient/event keys deduplicate retries. Ordinary Lobby messages do not enqueue bulk notifications; selected mentions retain generic text and approved channel preferences.

The BullMQ worker processes only due committed IN_APP IDs, locks the PostgreSQL row, rechecks actual current source and preferences, publishes only notice IDs and commits SENT. Failed transport retries are capped at three with generic errors. Socket delivery independently authenticates current sessions and source ACL; private membership/epoch authority and batch DTOs are retained exactly. Removed members, blocked pairs and revoked sessions cannot use notification links or events to recover private text. PUSH/EMAIL adapters and reminder production remain T35; local compiled smoke is not production deployment.

## T35 — current per-device Push and external delivery

- `GET /api/v1/push/config`: current authenticated session/ban, no-store; shared WebPushConfigSchema returns available/public VAPID key only or available:false. No private VAPID material.
- `POST /api/v1/push/subscriptions`: session+trusted Origin/CSRF, strict WebPushSubscriptionSchema,201 {success:true}; known HTTPS providers, canonical endpoint and actual browser ECDH keys. Same-owner idempotence/key rotation; foreign endpoint/keypair403. No subscription lists/keys in response. Browser JSON is projected onto endpoint/keys; expirationTime is not a DTO field.
- `DELETE /api/v1/push/subscriptions`: session+CSRF, strict WebPushUnsubscribeSchema, owned canonical endpoint200 {success:true}; foreign/missing404.
- `GET /api/v1/push/notifications/:id`: current session, owned ACCEPTED external target receipt and current source/channel authority; NotificationSchema generic trusted content/internal source data,404 when unavailable/revoked. Independent PUSH/EMAIL access does not change IN_APP preferences or unread counts.
- External worker: independently current channel preferences, blocks/ban/source membership/state/epoch and verified email are required. EMAIL policy is invitations/reminders only. Durable target digests distinguish accepted, definitive rejected/retryable, gone and uncertain; at most3 definitive attempts, no automatic replay of accepted/uncertain targets. Current owned HTTP410/404 endpoint cleanup, no raw provider errors. Generic titles/body only; guarded internal /notifications/:id links.
- Reminder: real scheduled UTC source, ten-minute-before-start window, microsecond-preserving metadata/dedup, current roster/member/state checks and eligible missing-target filtering before100-row locked batch limit. Cancellation/end/reschedule/revocation suppress stale delivery.
- Actual real-provider/native Chrome test and inbox/Telegram receipt evidence are separate from mocked adapter integration. T36 owns product PWA permission/install/click/background on physical iPhone/Android. No main migration or production deployment.
