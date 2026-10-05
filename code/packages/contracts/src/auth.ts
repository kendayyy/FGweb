import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, CustomStatusSchema, GameTitleSchema } from './common.js';

export const AuthProviderSchema = z.literal('discord');
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

export const MeDTOSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable().optional(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  discordId: z.string().min(1),
  customStatus: CustomStatusSchema.default('JUST_CHATTING'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  onboardingComplete: z.boolean().optional(),
  interestedGames: z.array(GameTitleSchema).refine(
    games => new Set(games).size === games.length,
    'Interested games must be unique',
  ).optional(),
});
export type MeDTO = z.infer<typeof MeDTOSchema>;

export const AuthSessionMetadataSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  user: MeDTOSchema,
  expiresAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});
export type AuthSessionMetadata = z.infer<typeof AuthSessionMetadataSchema>;
