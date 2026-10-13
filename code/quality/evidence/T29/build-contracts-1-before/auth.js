import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, CustomStatusSchema, GameTitleSchema } from './common.js';
// Better Auth account IDs: email/password uses the credential provider.
export const AuthProviderSchema = z.enum(['discord', 'credential']);
export const MeDTOSchema = z.object({
    id: IdSchema,
    displayName: z.string().min(1).max(50),
    avatarUrl: z.string().url().nullable().optional(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    discordId: z.string().min(1).nullable(),
    customStatus: CustomStatusSchema.default('JUST_CHATTING'),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    onboardingComplete: z.boolean().optional(),
    interestedGames: z.array(GameTitleSchema).refine(games => new Set(games).size === games.length, 'Interested games must be unique').optional(),
});
export const AuthSessionMetadataSchema = z.object({
    id: IdSchema,
    userId: IdSchema,
    user: MeDTOSchema,
    expiresAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
});
// Private auth transports; passwords are never trimmed or transformed.
export const AuthPasswordSchema = z.string().refine(value => value.length <= 256 && [...value].length >= 8 && [...value].length <= 128, { message: 'Mật khẩu cần 8–128 ký tự Unicode.', abort: true }).refine(value => /\p{Lu}/u.test(value), 'Mật khẩu cần ít nhất một chữ hoa.').refine(value => /[\p{P}\p{S}]/u.test(value), 'Mật khẩu cần ít nhất một ký tự đặc biệt.');
// Existing credential proof must not composition-gate legacy accounts.
export const AuthExistingPasswordSchema = z.string().refine(value => value.length > 0 && value.length <= 256 && [...value].length <= 128, { message: 'Mật khẩu cần 1–128 ký tự Unicode.', abort: true });
export const AuthEmailSchema = z.string().email().max(254);
export const AuthCallbackPathSchema = z.string().min(1).max(2048).refine(path => /^\/(?!\/)/.test(path) && !path.includes('\\') && [...path].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) && !/%(?:2f|5c)/i.test(path), 'Callback must be a relative same-origin path');
export const AuthEmailTokenSchema = z.string().min(1).max(2048);
export const SignUpEmailRequestSchema = z.object({ name: z.string().min(2).max(50), email: AuthEmailSchema, password: AuthPasswordSchema, callbackURL: AuthCallbackPathSchema.optional() }).strict();
export const SignInEmailRequestSchema = z.object({ email: AuthEmailSchema, password: AuthExistingPasswordSchema, rememberMe: z.boolean().optional(), callbackURL: AuthCallbackPathSchema.optional() }).strict();
export const SignInAdminRequestSchema = z.object({ username: z.literal('kingame'), password: AuthExistingPasswordSchema, rememberMe: z.boolean().optional(), callbackURL: AuthCallbackPathSchema.optional() }).strict();
export const SendVerificationEmailRequestSchema = z.object({ email: AuthEmailSchema, callbackURL: AuthCallbackPathSchema.optional() }).strict();
export const VerifyEmailQuerySchema = z.object({ token: AuthEmailTokenSchema, callbackURL: AuthCallbackPathSchema.optional() }).strict();
export const RequestPasswordResetSchema = z.object({ email: AuthEmailSchema, redirectTo: AuthCallbackPathSchema.optional() }).strict();
export const ResetPasswordRequestSchema = z.object({ token: AuthEmailTokenSchema, newPassword: AuthPasswordSchema }).strict();
export const ChangePasswordRequestSchema = z.object({ currentPassword: AuthExistingPasswordSchema, newPassword: AuthPasswordSchema, revokeOtherSessions: z.literal(true).default(true) }).strict();
export const PasswordChallengeRequestSchema = z.object({}).strict().default({});
export const AttachPasswordRequestSchema = z.object({ token: AuthEmailTokenSchema, newPassword: AuthPasswordSchema }).strict();
export const PasswordStatusResponseSchema = z.object({ hasPassword: z.boolean() }).strict();
export const AuthStatusResponseSchema = z.object({ status: z.literal(true) }).strict();
export const AuthMailResponseSchema = z.object({ status: z.literal(true), message: z.string().optional() }).strict();
export const BetterAuthUserSchema = z.object({ id: IdSchema, name: z.string(), email: AuthEmailSchema, emailVerified: z.boolean(), image: z.string().nullable().optional(), createdAt: IsoDateTimeSchema, updatedAt: IsoDateTimeSchema }).strip();
export const SignUpEmailResponseSchema = z.object({ token: z.null(), user: BetterAuthUserSchema.safeExtend({ emailVerified: z.literal(false) }) }).strip();
export const SignInEmailResponseSchema = z.object({ redirect: z.boolean(), token: z.string().min(1), url: z.string().optional(), user: BetterAuthUserSchema.safeExtend({ emailVerified: z.literal(true) }) }).strip();
export const VerifyEmailResponseSchema = z.object({ status: z.literal(true), user: z.null() }).strict();
export const ChangePasswordResponseSchema = z.object({ token: z.string().nullable(), user: BetterAuthUserSchema }).strip();
