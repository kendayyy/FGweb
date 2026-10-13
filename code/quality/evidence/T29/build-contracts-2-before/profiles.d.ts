import { z } from 'zod';
export declare const UserSummarySchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customStatus: z.ZodDefault<z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>>;
}, z.core.$strip>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export declare const GameProfileSchema: z.ZodObject<{
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    inGameName: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    playHours: z.ZodOptional<z.ZodNumber>;
    playStyle: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GameProfileDTO = z.infer<typeof GameProfileSchema>;
export declare const UpdateGameProfileRequestSchema: z.ZodObject<{
    inGameName: z.ZodOptional<z.ZodString>;
    rank: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodString>;
    playHours: z.ZodOptional<z.ZodNumber>;
    playStyle: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type UpdateGameProfileRequest = z.infer<typeof UpdateGameProfileRequestSchema>;
export declare const UpdateInterestsRequestSchema: z.ZodObject<{
    interestedGames: z.ZodArray<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>;
}, z.core.$strict>;
export type UpdateInterestsRequest = z.infer<typeof UpdateInterestsRequestSchema>;
export declare const InterestsResponseSchema: z.ZodObject<{
    interestedGames: z.ZodArray<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>;
}, z.core.$strict>;
export type InterestsResponse = z.infer<typeof InterestsResponseSchema>;
export declare const PublicProfileSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customStatus: z.ZodDefault<z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>>;
    gameProfiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        gameId: z.ZodString;
        gameTitle: z.ZodEnum<{
            "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
            Valorant: "Valorant";
            "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
            "Dota 2": "Dota 2";
            Roblox: "Roblox";
            "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
            "Free Fire": "Free Fire";
        }>;
        inGameName: z.ZodOptional<z.ZodString>;
        rank: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
        playHours: z.ZodOptional<z.ZodNumber>;
        playStyle: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type ProfileDTO = z.infer<typeof PublicProfileSchema>;
export declare const PrivateProfileSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customStatus: z.ZodDefault<z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>>;
    gameProfiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        gameId: z.ZodString;
        gameTitle: z.ZodEnum<{
            "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
            Valorant: "Valorant";
            "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
            "Dota 2": "Dota 2";
            Roblox: "Roblox";
            "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
            "Free Fire": "Free Fire";
        }>;
        inGameName: z.ZodOptional<z.ZodString>;
        rank: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
        playHours: z.ZodOptional<z.ZodNumber>;
        playStyle: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    createdAt: z.ZodString;
    email: z.ZodString;
    discordId: z.ZodNullable<z.ZodString>;
    emailVerified: z.ZodBoolean;
}, z.core.$strip>;
export type PrivateProfileDTO = z.infer<typeof PrivateProfileSchema>;
export declare const OnboardingRequestSchema: z.ZodObject<{
    displayName: z.ZodString;
    avatarUrl: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    interestedGames: z.ZodArray<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>;
}, z.core.$strip>;
export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;
export declare const UpdateProfileRequestSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
    avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bio: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customStatus: z.ZodOptional<z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>>;
    gameProfiles: z.ZodOptional<z.ZodArray<z.ZodObject<{
        gameId: z.ZodString;
        gameTitle: z.ZodEnum<{
            "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
            Valorant: "Valorant";
            "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
            "Dota 2": "Dota 2";
            Roblox: "Roblox";
            "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
            "Free Fire": "Free Fire";
        }>;
        inGameName: z.ZodOptional<z.ZodString>;
        rank: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodString>;
        playHours: z.ZodOptional<z.ZodNumber>;
        playStyle: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
