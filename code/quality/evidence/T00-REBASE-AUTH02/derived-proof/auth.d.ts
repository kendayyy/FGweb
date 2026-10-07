import { z } from 'zod';
export declare const AuthProviderSchema: z.ZodLiteral<"discord">;
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export declare const MeDTOSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    email: z.ZodString;
    emailVerified: z.ZodBoolean;
    discordId: z.ZodString;
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
        discordId: z.ZodString;
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
