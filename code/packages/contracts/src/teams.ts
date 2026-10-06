import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PlayerCapacitySchema, GameTitleSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';

export const PlaySessionStateSchema = z.enum(['SCHEDULED', 'ACTIVE', 'ENDED']);
export type PlaySessionState = z.infer<typeof PlaySessionStateSchema>;

export const RecruitmentStateSchema = z.enum(['OPEN', 'CLOSED']);
export type RecruitmentState = z.infer<typeof RecruitmentStateSchema>;

export const JoinRequestStateSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
]);
export type JoinRequestState = z.infer<typeof JoinRequestStateSchema>;

export const InviteTargetSchema = z.enum(['ROOM', 'PLAY_SESSION']);
export type InviteTarget = z.infer<typeof InviteTargetSchema>;

export const InvitationStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const PlaySessionRosterSchema = z.object({
  playSessionId: IdSchema,
  userId: IdSchema,
  user: UserSummarySchema.optional(),
  slotIndex: z.number().int().min(1).max(10),
  isHost: z.boolean(),
  joinedAt: IsoDateTimeSchema,
});
export type PlaySessionRosterDTO = z.infer<typeof PlaySessionRosterSchema>;

export const PlaySessionSchema = z
  .object({
    id: IdSchema,
    roomId: IdSchema,
    hostUserId: IdSchema,
    timingType: z.enum(['now', 'scheduledAt']),
    scheduledAt: IsoDateTimeSchema.optional(),
    state: PlaySessionStateSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.timingType === 'now') {
      if (data.scheduledAt !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scheduledAt must be undefined when timingType is now',
          path: ['scheduledAt'],
        });
      }
    } else if (data.timingType === 'scheduledAt') {
      if (!data.scheduledAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scheduledAt is required when timingType is scheduledAt',
          path: ['scheduledAt'],
        });
      }
    }
  });
export type PlaySessionDTO = z.infer<typeof PlaySessionSchema>;

export const RecruitmentSchema = z
  .object({
    id: IdSchema,
    roomId: IdSchema,
    gameId: IdSchema,
    gameTitle: GameTitleSchema,
    title: z.string().min(1).max(100),
    mode: z.string().min(1).max(50),
    playerCapacity: PlayerCapacitySchema,
    currentPlayers: z.number().int().min(1).max(10).default(1),
    timingType: z.enum(['now', 'scheduledAt']),
    scheduledAt: IsoDateTimeSchema.optional(),
    requirementText: z.string().max(300).optional(),
    experienceName: z.string().max(100).optional(),
    experienceUrl: z.string().url().optional(),
    state: RecruitmentStateSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.currentPlayers > data.playerCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPlayers cannot exceed playerCapacity',
        path: ['currentPlayers'],
      });
    }

    if (data.timingType === 'now') {
      if (data.scheduledAt !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scheduledAt must be undefined when timingType is now',
          path: ['scheduledAt'],
        });
      }
    } else if (data.timingType === 'scheduledAt') {
      if (!data.scheduledAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scheduledAt is required when timingType is scheduledAt',
          path: ['scheduledAt'],
        });
      }
    }

    if (data.gameTitle !== 'Roblox') {
      if (data.experienceName !== undefined || data.experienceUrl !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Roblox experience fields are only allowed for Roblox game recruitments',
          path: ['experienceName'],
        });
      }
    } else if (data.experienceUrl) {
      try {
        const parsed = new URL(data.experienceUrl);
        if (parsed.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'experienceUrl must use HTTPS protocol',
            path: ['experienceUrl'],
          });
        }
        if (parsed.username || parsed.password) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'experienceUrl cannot contain userinfo credentials',
            path: ['experienceUrl'],
          });
        }
        if (parsed.port && parsed.port !== '443') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'experienceUrl cannot use non-standard ports',
            path: ['experienceUrl'],
          });
        }
        const host = parsed.hostname.toLowerCase();
        if (host !== 'roblox.com' && !host.endsWith('.roblox.com')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'experienceUrl domain must be roblox.com or a roblox.com subdomain',
            path: ['experienceUrl'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'experienceUrl must be a valid URL',
          path: ['experienceUrl'],
        });
      }
    }
  });
export type RecruitmentDTO = z.infer<typeof RecruitmentSchema>;

export function CreateRecruitmentSchema(clock: Date | (() => Date) = () => new Date()) {
  return z
    .object({
      roomId: IdSchema.optional(),
      gameId: IdSchema,
      gameTitle: GameTitleSchema,
      title: z.string().min(1, 'Title is required').max(100),
      mode: z.string().min(1, 'Mode is required').max(50),
      playerCapacity: PlayerCapacitySchema,
      timingType: z.enum(['now', 'scheduledAt']),
      scheduledAt: IsoDateTimeSchema.optional(),
      requirementText: z.string().max(300).optional(),
      experienceName: z.string().max(100).optional(),
      experienceUrl: z.string().optional(),
      idempotencyKey: z.string().min(1).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.timingType === 'now') {
        if (data.scheduledAt !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'scheduledAt must not be provided when timingType is now',
            path: ['scheduledAt'],
          });
        }
      } else if (data.timingType === 'scheduledAt') {
        if (!data.scheduledAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'scheduledAt is required when timingType is scheduledAt',
            path: ['scheduledAt'],
          });
        } else {
          const scheduledDate = new Date(data.scheduledAt);
          if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= (typeof clock === 'function' ? clock() : clock).getTime()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'scheduledAt must be a valid future ISO date',
              path: ['scheduledAt'],
            });
          }
        }
      }

      if (data.gameTitle !== 'Roblox') {
        if (data.experienceName !== undefined || data.experienceUrl !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Roblox experience fields are only allowed for Roblox game recruitments',
            path: ['experienceName'],
          });
        }
      } else if (data.experienceUrl) {
        try {
          const parsedUrl = new URL(data.experienceUrl);
          if (parsedUrl.protocol !== 'https:') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'experienceUrl must use HTTPS protocol',
              path: ['experienceUrl'],
            });
          }
          if (parsedUrl.username || parsedUrl.password) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'experienceUrl cannot contain userinfo credentials',
              path: ['experienceUrl'],
            });
          }
          if (parsedUrl.port && parsedUrl.port !== '443') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'experienceUrl cannot use non-standard ports',
              path: ['experienceUrl'],
            });
          }
          const host = parsedUrl.hostname.toLowerCase();
          if (host !== 'roblox.com' && !host.endsWith('.roblox.com')) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'experienceUrl domain must be roblox.com or a roblox.com subdomain',
              path: ['experienceUrl'],
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'experienceUrl must be a valid URL',
            path: ['experienceUrl'],
          });
        }
      }
    });
}

export const JoinRequestSchema = z.object({
  id: IdSchema,
  recruitmentId: IdSchema,
  applicantId: IdSchema,
  applicant: UserSummarySchema.optional(),
  status: JoinRequestStateSchema,
  createdAt: IsoDateTimeSchema,
});
export type JoinRequestDTO = z.infer<typeof JoinRequestSchema>;

export const RoomInvitationSchema = z.object({
  id: IdSchema,
  targetType: z.literal('ROOM'),
  senderId: IdSchema,
  sender: UserSummarySchema.optional(),
  receiverId: IdSchema,
  receiver: UserSummarySchema.optional(),
  roomId: IdSchema,
  status: InvitationStatusSchema,
  createdAt: IsoDateTimeSchema,
});

export const PlaySessionInvitationSchema = z.object({
  id: IdSchema,
  targetType: z.literal('PLAY_SESSION'),
  senderId: IdSchema,
  sender: UserSummarySchema.optional(),
  receiverId: IdSchema,
  receiver: UserSummarySchema.optional(),
  roomId: IdSchema,
  playSessionId: IdSchema,
  status: InvitationStatusSchema,
  createdAt: IsoDateTimeSchema,
});

export const InvitationSchema = z.discriminatedUnion('targetType', [
  RoomInvitationSchema,
  PlaySessionInvitationSchema,
]);
export type InvitationDTO = z.infer<typeof InvitationSchema>;

export const CreateInvitationRequestSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('ROOM'),
    receiverId: IdSchema,
    roomId: IdSchema,
  }),
  z.object({
    targetType: z.literal('PLAY_SESSION'),
    receiverId: IdSchema,
    roomId: IdSchema,
    playSessionId: IdSchema,
  }),
]);
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const RespondJoinRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});
export type RespondJoinRequest = z.infer<typeof RespondJoinRequestSchema>;

export const RespondInvitationSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});
export type RespondInvitation = z.infer<typeof RespondInvitationSchema>;

export const CancelJoinRequestSchema = z.object({
  requestId: IdSchema,
});
export type CancelJoinRequest = z.infer<typeof CancelJoinRequestSchema>;

export const ApproveInvitationSchema = z.object({
  invitationId: IdSchema,
  action: z.enum(['ACCEPT', 'REJECT']),
});
export type ApproveInvitation = z.infer<typeof ApproveInvitationSchema>;

// Public discovery exposes only open cards attached to public rooms.
export const PublicRecruitmentSchema = RecruitmentSchema.safeExtend({
 state: z.literal('OPEN'),
 visibility: z.literal('PUBLIC'),
});
export type PublicRecruitmentDTO = z.infer<typeof PublicRecruitmentSchema>;
export const PublicRecruitmentQuerySchema = z.object({
 gameId: IdSchema.optional(), gameTitle: GameTitleSchema.optional(),
 mode: z.string().min(1).max(50).optional(),
 timingType: z.enum(['now','scheduledAt']).optional(),
 state: z.literal('OPEN').default('OPEN'),
 visibility: z.literal('PUBLIC').default('PUBLIC'),
 cursor: z.string().optional(), limit: z.number().int().min(1).max(50).default(50),
});
