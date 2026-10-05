import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, CustomStatusSchema, GameTitleSchema } from './common.js';

export const UserSummarySchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable().optional(),
  customStatus: CustomStatusSchema.default('JUST_CHATTING'),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const GameProfileSchema = z.object({
  gameId: IdSchema,
  gameTitle: GameTitleSchema,
  inGameName: z.string().max(50).optional(),
  rank: z.string().max(50).optional(),
  role: z.string().max(50).optional(),
  playHours: z.number().nonnegative().optional(),
  playStyle: z.string().max(100).optional(),
});
export type GameProfileDTO = z.infer<typeof GameProfileSchema>;

export const UpdateGameProfileRequestSchema = GameProfileSchema.pick({
  inGameName: true,
  rank: true,
  role: true,
  playHours: true,
  playStyle: true,
}).strict();
export type UpdateGameProfileRequest = z.infer<typeof UpdateGameProfileRequestSchema>;

export const UpdateInterestsRequestSchema = z.object({
  interestedGames: z.array(GameTitleSchema).min(1).refine(
    games => new Set(games).size === games.length,
    'Interested games must be unique',
  ),
}).strict();
export type UpdateInterestsRequest = z.infer<typeof UpdateInterestsRequestSchema>;

export const InterestsResponseSchema = z.object({
  interestedGames: z.array(GameTitleSchema),
}).strict();
export type InterestsResponse = z.infer<typeof InterestsResponseSchema>;

export const PublicProfileSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  customStatus: CustomStatusSchema.default('JUST_CHATTING'),
  gameProfiles: z.array(GameProfileSchema).default([]),
  createdAt: IsoDateTimeSchema,
}).strip();
export type ProfileDTO = z.infer<typeof PublicProfileSchema>;

export const PrivateProfileSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  customStatus: CustomStatusSchema.default('JUST_CHATTING'),
  gameProfiles: z.array(GameProfileSchema).default([]),
  createdAt: IsoDateTimeSchema,
  email: z.string().email(),
  discordId: z.string().min(1),
  emailVerified: z.boolean(),
});
export type PrivateProfileDTO = z.infer<typeof PrivateProfileSchema>;

export const OnboardingRequestSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(50),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  interestedGames: z.array(GameTitleSchema).min(1, 'Select at least one game'),
});
export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  customStatus: CustomStatusSchema.optional(),
  gameProfiles: z.array(GameProfileSchema).optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
