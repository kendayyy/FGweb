import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';

export const CallStateSchema = z.enum(['OPEN', 'CLOSED']);
export type CallState = z.infer<typeof CallStateSchema>;

export const ExternalLiveProviderSchema = z.enum(['youtube', 'twitch']);
export type ExternalLiveProvider = z.infer<typeof ExternalLiveProviderSchema>;

export const ExternalLiveSchema = z
  .object({
    id: IdSchema,
    callId: IdSchema,
    provider: ExternalLiveProviderSchema,
    url: z.string().url('Must be a valid URL'),
    title: z.string().max(100).optional(),
    configuredBy: IdSchema,
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    try {
      const parsedUrl = new URL(data.url);
      if (parsedUrl.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External live URL must use HTTPS protocol',
          path: ['url'],
        });
      }
      if (parsedUrl.username || parsedUrl.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External live URL cannot contain userinfo credentials',
          path: ['url'],
        });
      }
      if (parsedUrl.port && parsedUrl.port !== '443') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External live URL cannot use non-standard ports',
          path: ['url'],
        });
      }
      const host = parsedUrl.hostname.toLowerCase();
      if (data.provider === 'youtube') {
        const allowedYoutube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
        if (!allowedYoutube.includes(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'YouTube external live URL must be a valid youtube.com or youtu.be domain',
            path: ['url'],
          });
        }
      } else if (data.provider === 'twitch') {
        const allowedTwitch = ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'twitch.com'];
        if (!allowedTwitch.includes(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Twitch external live URL must be a valid twitch.tv or twitch.com domain',
            path: ['url'],
          });
        }
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid external live URL format',
        path: ['url'],
      });
    }
  });
export type ExternalLiveDTO = z.infer<typeof ExternalLiveSchema>;

export const CallParticipantSchema = z.object({
  callId: IdSchema,
  userId: IdSchema,
  user: UserSummarySchema.optional(),
  mediaIdentity: z.string().regex(/^admission_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/).optional(),
  micRestricted: z.boolean().optional(),
  isPublishing: z.boolean().default(false),
  isMuted: z.boolean().default(true),
  joinedAt: IsoDateTimeSchema,
});
export type CallParticipantDTO = z.infer<typeof CallParticipantSchema>;

export const CallGroupSchema = z
  .object({
    id: IdSchema,
    roomId: IdSchema,
    state: CallStateSchema,
    participantCount: z
      .number()
      .int()
      .min(0)
      .max(10, 'Call participant limit is 10 max'),
    publisherCount: z
      .number()
      .int()
      .min(0)
      .max(3, 'Screen share publisher limit is 3 max'),
    hasExternalLive: z.boolean().default(false),
    externalLive: ExternalLiveSchema.optional(),
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.publisherCount > data.participantCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'publisherCount cannot exceed participantCount',
        path: ['publisherCount'],
      });
    }
  });
export type CallGroupDTO = z.infer<typeof CallGroupSchema>;

export const CallJoinSchema = z.object({
  callId: IdSchema,
  token: z.string().min(1),
  sfuUrl: z.string().url(),
  roomName: z.string().min(1),
});
export type CallJoinDTO = z.infer<typeof CallJoinSchema>;

// Actor, room, capacity and SFU identity come from authenticated server state.
export const CallActionRequestSchema = z.object({}).strict();
export type CallActionRequest = z.infer<typeof CallActionRequestSchema>;

export const SetExternalLiveRequestSchema = z
  .object({
    provider: ExternalLiveProviderSchema,
    url: z.string().url('Must be a valid YouTube or Twitch URL'),
    title: z.string().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    try {
      const parsed = new URL(data.url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'URL must use HTTPS, have no userinfo credentials, and use standard ports',
          path: ['url'],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid URL',
        path: ['url'],
      });
    }
  });
export type SetExternalLiveRequest = z.infer<typeof SetExternalLiveRequestSchema>;

export const MuteParticipantRequestSchema = z.object({
  muted: z.boolean(),
}).strict();
export type MuteParticipantRequest = z.infer<typeof MuteParticipantRequestSchema>;

export const ToggleSelfMicRequestSchema = z.object({
  muted: z.boolean(),
}).strict();
export type ToggleSelfMicRequest = z.infer<typeof ToggleSelfMicRequestSchema>;

export const ListCallParticipantsQuerySchema = z.object({
  callId: IdSchema,
});
export type ListCallParticipantsQuery = z.infer<typeof ListCallParticipantsQuerySchema>;

export const RefreshPublishTokenSchema = z.object({
  callId: IdSchema,
}).strict();
export type RefreshPublishTokenRequest = z.infer<typeof RefreshPublishTokenSchema>;

export const KickCallParticipantSchema = z.object({
  targetUserId: IdSchema,
}).strict();
export type KickCallParticipantRequest = z.infer<typeof KickCallParticipantSchema>;


// T29: actors/permissions/slot quotas always come from authenticated server state.
export const CallModerationActionSchema=z.enum(['MUTE_MIC','ALLOW_MIC','STOP_SCREEN_SHARE','ALLOW_SCREEN_SHARE','KICK']);
export const CallModerationRequestSchema=z.object({action:CallModerationActionSchema,targetUserId:IdSchema}).strict();
export type CallModerationRequest=z.infer<typeof CallModerationRequestSchema>;
export const CallControlSuccessSchema=z.object({success:z.literal(true)}).strict();
export type CallControlSuccess=z.infer<typeof CallControlSuccessSchema>;
