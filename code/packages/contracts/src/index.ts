import { z } from 'zod';
import {
  SocketEventNames,
  IdSchema,
  GameSchema,
  ListGamesQuerySchema,
  ListOnlineUsersQuerySchema,
  createPageSchema,
  ApiErrorResponseSchema,
} from './common.js';
import { MeDTOSchema } from './auth.js';
import { PublicProfileSchema, PrivateProfileSchema, UpdateProfileRequestSchema, OnboardingRequestSchema, UpdateInterestsRequestSchema, InterestsResponseSchema, UpdateGameProfileRequestSchema, GameProfileSchema } from './profiles.js';
import {UploadImageRequestSchema,AttachmentUrlSchema,ImageContentSchema} from './uploads.js';
import { MessageSchema, CreateMessageRequestSchema, ListMessagesQuerySchema, AttachmentSchema, LobbyMessagesQuerySchema } from './messages.js';
import { RoomSchema, RoomMemberSchema, CreateRoomRequestSchema, UpdateRoomSettingsRequestSchema, UpdateHelperPermissionsRequestSchema, ListOwnRoomsQuerySchema, TransferRoomOwnerSchema } from './rooms.js';
import { RecruitmentSchema, PlaySessionSchema, PlaySessionRosterSchema, JoinRequestSchema, InvitationSchema, CreateInvitationRequestSchema, RespondJoinRequestSchema, RespondInvitationSchema, CreateRecruitmentSchema, PublicRecruitmentSchema, PublicRecruitmentQuerySchema, CancelJoinRequestSchema, ApproveInvitationSchema } from './teams.js';
import { CallGroupSchema, CallParticipantSchema, SetExternalLiveRequestSchema, ExternalLiveSchema, MuteParticipantRequestSchema, CallJoinSchema, ToggleSelfMicRequestSchema, ListCallParticipantsQuerySchema, RefreshPublishTokenSchema, KickCallParticipantSchema } from './calls.js';
import { NotificationSchema, NotificationPreferencesSchema, WebPushSubscriptionSchema } from './notifications.js';
import { ReportSchema, BlockSchema, CreateReportRequestSchema, CreateBlockRequestSchema, SendFriendRequestSchema, ListFriendsQuerySchema, ListFriendRequestsQuerySchema, PendingFriendRequestSchema, RespondFriendRequestSchema, RemoveFriendSchema, CancelFriendRequestSchema, CreateDirectConversationSchema, ListDirectConversationsQuerySchema, ListAdminReportsQuerySchema, UpdateAdminReportSchema, ListAdminUsersQuerySchema, AdminUserActionRequestSchema } from './moderation.js';
import { ListGameOnlineUsersQuerySchema, UpdateCustomStatusRequestSchema, UpdateCustomStatusResponseSchema, SocketPresenceRequestSchema, SocketScopedPresenceChangedPayloadSchema } from './presence.js';

export * from './common.js';
export * from './auth.js';
export * from './profiles.js';
export * from './presence.js';
export * from './messages.js';
export * from './uploads.js';
export * from './rooms.js';
export * from './teams.js';
export * from './calls.js';
export * from './notifications.js';
export * from './moderation.js';

export const SocketMessageCreatedPayloadSchema = MessageSchema;
export const SocketConversationRequestSchema=z.object({conversationId:IdSchema}).strict();
export type SocketConversationRequest=z.infer<typeof SocketConversationRequestSchema>;
export const SocketConversationAckSchema=z.discriminatedUnion('ok',[
  z.object({ok:z.literal(true),conversationId:IdSchema}).strict(),
  z.object({ok:z.literal(false),error:ApiErrorResponseSchema.strict()}).strict(),
]);
export type SocketConversationAck=z.infer<typeof SocketConversationAckSchema>;
export const SocketMessageDeletedPayloadSchema = z.object({
  messageId: IdSchema,
  conversationId: IdSchema,
});
export const SocketRecruitmentUpdatedPayloadSchema = RecruitmentSchema;
export const SocketTeamUpdatedPayloadSchema = z.object({
  playSession: PlaySessionSchema,
  roster: z.array(PlaySessionRosterSchema),
});
export const SocketRoomUpdatedPayloadSchema = RoomSchema;
export const SocketCallUpdatedPayloadSchema = CallGroupSchema;
export const SocketNotificationCreatedPayloadSchema = NotificationSchema;
export const SocketNotificationReadPayloadSchema = z.object({
  notificationId: IdSchema,
});

export const SocketEventSchemaMap = {
  [SocketEventNames.MESSAGE_CREATED]: SocketMessageCreatedPayloadSchema,
  [SocketEventNames.MESSAGE_DELETED]: SocketMessageDeletedPayloadSchema,
  [SocketEventNames.PRESENCE_SUBSCRIBE]: SocketPresenceRequestSchema,
  [SocketEventNames.PRESENCE_UNSUBSCRIBE]: SocketPresenceRequestSchema,
  [SocketEventNames.PRESENCE_HEARTBEAT]: SocketPresenceRequestSchema,
  [SocketEventNames.PRESENCE_CHANGED]: SocketScopedPresenceChangedPayloadSchema,
  [SocketEventNames.RECRUITMENT_UPDATED]: SocketRecruitmentUpdatedPayloadSchema,
  [SocketEventNames.TEAM_UPDATED]: SocketTeamUpdatedPayloadSchema,
  [SocketEventNames.ROOM_UPDATED]: SocketRoomUpdatedPayloadSchema,
  [SocketEventNames.CALL_UPDATED]: SocketCallUpdatedPayloadSchema,
  [SocketEventNames.NOTIFICATION_CREATED]: SocketNotificationCreatedPayloadSchema,
  [SocketEventNames.NOTIFICATION_READ]: SocketNotificationReadPayloadSchema,
} as const;

export type EndpointAuthLevel =
  | 'Public'
  | 'Authenticated'
  | 'RoomMember'
  | 'ConversationRead'
  | 'ConversationMember'
  | 'MessageAuthorOrModerator'
  | 'RoomOwner'
  | 'RoomHelperOrOwner'
  | 'CallParticipant'
  | 'Admin'
  | 'OwnUserOrTarget';

export interface ApiEndpointDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  auth: EndpointAuthLevel;
  requiredPermission?: 'MANAGE_CHAT' | 'MANAGE_CALLS' | 'MANAGE_RECRUITMENT' | 'MANAGE_MEMBERS';
  requestSchema?: z.ZodTypeAny;
  responseSchema: z.ZodTypeAny;
  requestFormat?: 'multipart';
  responseFormat?: 'binary';
}

export const ApiEndpointRegistry: ApiEndpointDefinition[] = [
  { method: 'GET', path: '/api/v1/me', auth: 'Authenticated', responseSchema: MeDTOSchema },
  { method: 'PATCH', path: '/api/v1/me/profile', auth: 'Authenticated', requestSchema: UpdateProfileRequestSchema, responseSchema: PrivateProfileSchema },
  { method: 'POST', path: '/api/v1/me/onboarding', auth: 'Authenticated', requestSchema: OnboardingRequestSchema, responseSchema: PrivateProfileSchema },
  { method: 'PUT', path: '/api/v1/me/interests', auth: 'Authenticated', requestSchema: UpdateInterestsRequestSchema, responseSchema: InterestsResponseSchema },
  { method: 'PUT', path: '/api/v1/me/game-profiles/:gameId', auth: 'Authenticated', requestSchema: UpdateGameProfileRequestSchema, responseSchema: GameProfileSchema },
  { method: 'PATCH', path: '/api/v1/me/status', auth: 'Authenticated', requestSchema: UpdateCustomStatusRequestSchema, responseSchema: UpdateCustomStatusResponseSchema },

  { method: 'GET', path: '/api/v1/users/:id/profile', auth: 'Public', responseSchema: PublicProfileSchema },
  { method: 'GET', path: '/api/v1/games', auth: 'Public', requestSchema: ListGamesQuerySchema, responseSchema: z.array(GameSchema) },
  { method: 'GET', path: '/api/v1/games/:id/online', auth: 'Public', requestSchema: ListGameOnlineUsersQuerySchema, responseSchema: createPageSchema(PublicProfileSchema) },
  { method: 'GET', path: '/api/v1/online-users', auth: 'Public', requestSchema: ListOnlineUsersQuerySchema, responseSchema: createPageSchema(PublicProfileSchema) },

  { method: 'GET', path: '/api/v1/conversations/:id/messages', auth: 'ConversationRead', requestSchema: ListMessagesQuerySchema, responseSchema: createPageSchema(MessageSchema) },
  { method: 'GET', path: '/api/v1/lobby/messages', auth: 'Public', requestSchema: LobbyMessagesQuerySchema, responseSchema: createPageSchema(MessageSchema) },
  { method: 'GET', path: '/api/v1/games/:gameId/lobby/messages', auth: 'Public', requestSchema: ListMessagesQuerySchema, responseSchema: createPageSchema(MessageSchema) },
  { method: 'POST', path: '/api/v1/conversations/:id/messages', auth: 'Authenticated', requestSchema: CreateMessageRequestSchema, responseSchema: MessageSchema },
  { method: 'DELETE', path: '/api/v1/conversations/:id/messages/:messageId', auth: 'MessageAuthorOrModerator', responseSchema: z.object({ success: z.boolean() }) },
  { method: 'POST', path: '/api/v1/uploads/images', auth: 'Authenticated', requestSchema: UploadImageRequestSchema,requestFormat:'multipart', responseSchema: AttachmentSchema },
  { method: 'GET', path: '/api/v1/attachments/:id', auth: 'ConversationRead', responseSchema: AttachmentUrlSchema },
  { method: 'GET', path: '/api/v1/attachments/:id/content', auth: 'ConversationRead', responseSchema: ImageContentSchema,responseFormat:'binary' },

  { method: 'GET', path: '/api/v1/friends', auth: 'Authenticated', requestSchema: ListFriendsQuerySchema, responseSchema: createPageSchema(PublicProfileSchema) },
  { method: 'GET', path: '/api/v1/friends/requests', auth: 'Authenticated', requestSchema: ListFriendRequestsQuerySchema, responseSchema: createPageSchema(PendingFriendRequestSchema) },
  { method: 'POST', path: '/api/v1/friends/requests', auth: 'Authenticated', requestSchema: SendFriendRequestSchema, responseSchema: z.object({ requestId: IdSchema, status: z.literal('PENDING') }) },
  { method: 'PATCH', path: '/api/v1/friends/requests/:id/respond', auth: 'Authenticated', requestSchema: RespondFriendRequestSchema, responseSchema: z.object({ success: z.boolean() }) },
  { method: 'DELETE', path: '/api/v1/friends/:userId', auth: 'Authenticated', requestSchema: RemoveFriendSchema, responseSchema: z.object({ success: z.boolean() }) },
  { method: 'DELETE', path: '/api/v1/friends/requests/:id/cancel', auth: 'Authenticated', requestSchema: CancelFriendRequestSchema, responseSchema: z.object({ success: z.boolean() }) },

  { method: 'GET', path: '/api/v1/direct-conversations', auth: 'Authenticated', requestSchema: ListDirectConversationsQuerySchema, responseSchema: createPageSchema(z.object({ conversationId: IdSchema, peer: PublicProfileSchema })) },
  { method: 'POST', path: '/api/v1/direct-conversations', auth: 'Authenticated', requestSchema: CreateDirectConversationSchema, responseSchema: z.object({ conversationId: IdSchema }) },

  { method: 'GET', path: '/api/v1/blocks', auth: 'Authenticated', responseSchema: z.array(BlockSchema) },
  { method: 'POST', path: '/api/v1/blocks', auth: 'Authenticated', requestSchema: CreateBlockRequestSchema, responseSchema: BlockSchema },
  { method: 'DELETE', path: '/api/v1/blocks/:userId', auth: 'Authenticated', responseSchema: z.object({ success: z.boolean() }) },

  { method: 'GET', path: '/api/v1/rooms', auth: 'Authenticated', requestSchema: ListOwnRoomsQuerySchema, responseSchema: createPageSchema(RoomSchema) },
  { method: 'GET', path: '/api/v1/rooms/own', auth: 'Authenticated', requestSchema: ListOwnRoomsQuerySchema, responseSchema: createPageSchema(RoomSchema) },
  { method: 'POST', path: '/api/v1/rooms', auth: 'Authenticated', requestSchema: CreateRoomRequestSchema, responseSchema: RoomSchema },
  { method: 'GET', path: '/api/v1/rooms/:id', auth: 'RoomMember', responseSchema: RoomSchema },
  { method: 'PATCH', path: '/api/v1/rooms/:id/settings', auth: 'RoomOwner', requestSchema: UpdateRoomSettingsRequestSchema, responseSchema: RoomSchema },
  { method: 'GET', path: '/api/v1/rooms/:id/members', auth: 'RoomMember', responseSchema: z.array(RoomMemberSchema) },
  { method: 'PATCH', path: '/api/v1/rooms/:id/helpers/:userId', auth: 'RoomOwner', requestSchema: UpdateHelperPermissionsRequestSchema, responseSchema: RoomMemberSchema },
  { method: 'DELETE', path: '/api/v1/rooms/:id/members/:userId', auth: 'Authenticated', responseSchema: z.object({ success: z.boolean() }) },
  { method: 'POST', path: '/api/v1/rooms/:id/transfer-owner', auth: 'RoomOwner', requestSchema: TransferRoomOwnerSchema, responseSchema: RoomSchema },
  { method: 'DELETE', path: '/api/v1/rooms/:id', auth: 'RoomOwner', responseSchema: z.object({ success: z.boolean() }) },

  { method: 'GET', path: '/api/v1/recruitments', auth: 'Public', requestSchema: PublicRecruitmentQuerySchema, responseSchema: createPageSchema(PublicRecruitmentSchema) },
  { method: 'GET', path: '/api/v1/games/:id/recruitments', auth: 'Public', requestSchema: PublicRecruitmentQuerySchema, responseSchema: createPageSchema(PublicRecruitmentSchema) },
  { method: 'GET', path: '/api/v1/games/:id/recruitments/suggestions', auth: 'Public', requestSchema: PublicRecruitmentQuerySchema, responseSchema: createPageSchema(PublicRecruitmentSchema) },
  { method: 'POST', path: '/api/v1/recruitments', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', requestSchema: CreateRecruitmentSchema(), responseSchema: RecruitmentSchema },
  { method: 'GET', path: '/api/v1/recruitments/:id', auth: 'Public', responseSchema: PublicRecruitmentSchema },
  { method: 'PATCH', path: '/api/v1/recruitments/:id/close', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', responseSchema: RecruitmentSchema },
  { method: 'PATCH', path: '/api/v1/recruitments/:id/reopen', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', responseSchema: RecruitmentSchema },
  { method: 'POST', path: '/api/v1/recruitments/:id/join-requests', auth: 'Authenticated', responseSchema: JoinRequestSchema },
  { method: 'GET', path: '/api/v1/recruitments/:id/join-requests', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', responseSchema: z.array(JoinRequestSchema) },
  { method: 'GET', path: '/api/v1/recruitments/me/joins', auth: 'Authenticated', responseSchema: z.array(JoinRequestSchema) },
  { method: 'PATCH', path: '/api/v1/join-requests/:id/respond', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', requestSchema: RespondJoinRequestSchema, responseSchema: JoinRequestSchema },
  { method: 'DELETE', path: '/api/v1/join-requests/:id/cancel', auth: 'Authenticated', requestSchema: CancelJoinRequestSchema, responseSchema: z.object({ success: z.boolean() }) },

  { method: 'POST', path: '/api/v1/invitations', auth: 'Authenticated', requestSchema: CreateInvitationRequestSchema, responseSchema: InvitationSchema },
  { method: 'GET', path: '/api/v1/invitations/me', auth: 'Authenticated', responseSchema: z.array(InvitationSchema) },
  { method: 'PATCH', path: '/api/v1/invitations/:id/respond', auth: 'Authenticated', requestSchema: RespondInvitationSchema, responseSchema: InvitationSchema },
  { method: 'POST', path: '/api/v1/invitations/:id/approve', auth: 'RoomOwner', requestSchema: ApproveInvitationSchema, responseSchema: InvitationSchema },

  { method: 'POST', path: '/api/v1/play-sessions/:id/start', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', responseSchema: PlaySessionSchema },
  { method: 'POST', path: '/api/v1/play-sessions/:id/end', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_RECRUITMENT', responseSchema: PlaySessionSchema },
  { method: 'POST', path: '/api/v1/play-sessions/:id/leave', auth: 'Authenticated', responseSchema: z.object({ success: z.boolean() }) },

  { method: 'POST', path: '/api/v1/rooms/:roomId/calls', auth: 'RoomMember', responseSchema: CallGroupSchema },
  { method: 'GET', path: '/api/v1/rooms/:roomId/calls', auth: 'RoomMember', responseSchema: z.array(CallGroupSchema) },
  { method: 'POST', path: '/api/v1/calls/:id/join', auth: 'RoomMember', responseSchema: CallJoinSchema },
  { method: 'POST', path: '/api/v1/calls/:id/leave', auth: 'CallParticipant', responseSchema: z.object({ success: z.boolean() }) },
  { method: 'GET', path: '/api/v1/calls/:id/participants', auth: 'RoomMember', requestSchema: ListCallParticipantsQuerySchema, responseSchema: z.array(CallParticipantSchema) },
  { method: 'POST', path: '/api/v1/calls/:id/external-live', auth: 'CallParticipant', requestSchema: SetExternalLiveRequestSchema, responseSchema: ExternalLiveSchema },
  { method: 'DELETE', path: '/api/v1/calls/:id/external-live', auth: 'CallParticipant', responseSchema: z.object({ success: z.boolean() }) },
  { method: 'PATCH', path: '/api/v1/calls/:id/participants/:userId/mute', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_CALLS', requestSchema: MuteParticipantRequestSchema, responseSchema: CallParticipantSchema },
  { method: 'POST', path: '/api/v1/calls/:id/self-mic', auth: 'CallParticipant', requestSchema: ToggleSelfMicRequestSchema, responseSchema: CallParticipantSchema },
  { method: 'POST', path: '/api/v1/calls/:id/publish-token', auth: 'CallParticipant', requestSchema: RefreshPublishTokenSchema, responseSchema: CallJoinSchema },
  { method: 'POST', path: '/api/v1/calls/:id/participants/:userId/kick', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_CALLS', requestSchema: KickCallParticipantSchema, responseSchema: z.object({ success: z.boolean() }) },
  { method: 'POST', path: '/api/v1/calls/:id/participants/:userId/stop-publish', auth: 'RoomHelperOrOwner', requiredPermission: 'MANAGE_CALLS', responseSchema: CallParticipantSchema },

  { method: 'GET', path: '/api/v1/notifications', auth: 'Authenticated', responseSchema: createPageSchema(NotificationSchema) },
  { method: 'PATCH', path: '/api/v1/notifications/:id/read', auth: 'Authenticated', responseSchema: NotificationSchema },
  { method: 'PATCH', path: '/api/v1/notifications/read-all', auth: 'Authenticated', responseSchema: z.object({ updatedCount: z.number() }) },
  { method: 'GET', path: '/api/v1/notifications/preferences', auth: 'Authenticated', responseSchema: NotificationPreferencesSchema },
  { method: 'PATCH', path: '/api/v1/notifications/preferences', auth: 'Authenticated', requestSchema: NotificationPreferencesSchema, responseSchema: NotificationPreferencesSchema },
  { method: 'POST', path: '/api/v1/push/subscriptions', auth: 'Authenticated', requestSchema: WebPushSubscriptionSchema, responseSchema: z.object({ success: z.boolean() }) },
  { method: 'DELETE', path: '/api/v1/push/subscriptions', auth: 'Authenticated', requestSchema: z.object({ endpoint: z.string().url() }), responseSchema: z.object({ success: z.boolean() }) },

  { method: 'POST', path: '/api/v1/reports', auth: 'Authenticated', requestSchema: CreateReportRequestSchema, responseSchema: ReportSchema },
  { method: 'GET', path: '/api/v1/admin/reports', auth: 'Admin', requestSchema: ListAdminReportsQuerySchema, responseSchema: createPageSchema(ReportSchema) },
  { method: 'PATCH', path: '/api/v1/admin/reports/:id', auth: 'Admin', requestSchema: UpdateAdminReportSchema, responseSchema: ReportSchema },
  { method: 'GET', path: '/api/v1/admin/users', auth: 'Admin', requestSchema: ListAdminUsersQuerySchema, responseSchema: createPageSchema(PrivateProfileSchema) },
  { method: 'PATCH', path: '/api/v1/admin/users/:id/ban', auth: 'Admin', requestSchema: AdminUserActionRequestSchema, responseSchema: z.object({ success: z.boolean() }) },
];
