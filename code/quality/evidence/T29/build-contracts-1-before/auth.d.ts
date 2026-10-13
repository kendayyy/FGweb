import { z } from 'zod';
export declare const AuthProviderSchema: z.ZodEnum<{
    discord: "discord";
    credential: "credential";
}>;
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export declare const MeDTOSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    discordId: z.ZodNullable<z.ZodString>;
    customStatus: z.ZodDefault<z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    onboardingComplete: z.ZodOptional<z.ZodBoolean>;
    interestedGames: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>>;
}, z.core.$strip>;
export type MeDTO = z.infer<typeof MeDTOSchema>;
export declare const AuthSessionMetadataSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        discordId: z.ZodNullable<z.ZodString>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        onboardingComplete: z.ZodOptional<z.ZodBoolean>;
        interestedGames: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
            Valorant: "Valorant";
            "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
            "Dota 2": "Dota 2";
            Roblox: "Roblox";
            "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
            "Free Fire": "Free Fire";
        }>>>;
    }, z.core.$strip>;
    expiresAt: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type AuthSessionMetadata = z.infer<typeof AuthSessionMetadataSchema>;
export declare const AuthPasswordSchema: z.ZodString;
export declare const AuthExistingPasswordSchema: z.ZodString;
export declare const AuthEmailSchema: z.ZodString;
export declare const AuthCallbackPathSchema: z.ZodString;
export declare const AuthEmailTokenSchema: z.ZodString;
export declare const SignUpEmailRequestSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    callbackURL: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type SignUpEmailRequest = z.infer<typeof SignUpEmailRequestSchema>;
export declare const SignInEmailRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    rememberMe: z.ZodOptional<z.ZodBoolean>;
    callbackURL: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type SignInEmailRequest = z.infer<typeof SignInEmailRequestSchema>;
export declare const SignInAdminRequestSchema: z.ZodObject<{
    username: z.ZodLiteral<"kingame">;
    password: z.ZodString;
    rememberMe: z.ZodOptional<z.ZodBoolean>;
    callbackURL: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type SignInAdminRequest = z.infer<typeof SignInAdminRequestSchema>;
export declare const SendVerificationEmailRequestSchema: z.ZodObject<{
    email: z.ZodString;
    callbackURL: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type SendVerificationEmailRequest = z.infer<typeof SendVerificationEmailRequestSchema>;
export declare const VerifyEmailQuerySchema: z.ZodObject<{
    token: z.ZodString;
    callbackURL: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type VerifyEmailQuery = z.infer<typeof VerifyEmailQuerySchema>;
export declare const RequestPasswordResetSchema: z.ZodObject<{
    email: z.ZodString;
    redirectTo: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type RequestPasswordReset = z.infer<typeof RequestPasswordResetSchema>;
export declare const ResetPasswordRequestSchema: z.ZodObject<{
    token: z.ZodString;
    newPassword: z.ZodString;
}, z.core.$strict>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export declare const ChangePasswordRequestSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
    revokeOtherSessions: z.ZodDefault<z.ZodLiteral<true>>;
}, z.core.$strict>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export declare const PasswordChallengeRequestSchema: z.ZodDefault<z.ZodObject<{}, z.core.$strict>>;
export declare const AttachPasswordRequestSchema: z.ZodObject<{
    token: z.ZodString;
    newPassword: z.ZodString;
}, z.core.$strict>;
export type AttachPasswordRequest = z.infer<typeof AttachPasswordRequestSchema>;
export declare const PasswordStatusResponseSchema: z.ZodObject<{
    hasPassword: z.ZodBoolean;
}, z.core.$strict>;
export type PasswordStatusResponse = z.infer<typeof PasswordStatusResponseSchema>;
export declare const AuthStatusResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<true>;
}, z.core.$strict>;
export declare const AuthMailResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<true>;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const BetterAuthUserSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const SignUpEmailResponseSchema: z.ZodObject<{
    token: z.ZodNull;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        emailVerified: z.ZodLiteral<false>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SignInEmailResponseSchema: z.ZodObject<{
    redirect: z.ZodBoolean;
    token: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        emailVerified: z.ZodLiteral<true>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const VerifyEmailResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<true>;
    user: z.ZodNull;
}, z.core.$strict>;
export declare const ChangePasswordResponseSchema: z.ZodObject<{
    token: z.ZodNullable<z.ZodString>;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        emailVerified: z.ZodBoolean;
        image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
