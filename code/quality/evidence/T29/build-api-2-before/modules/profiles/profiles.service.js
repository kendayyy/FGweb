"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilesService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const schema = __importStar(require("@fg/database"));
const contracts_1 = require("@fg/contracts");
const zod_1 = require("zod");
const auth_admin_js_1 = require("../auth/auth-admin.js");
let ProfilesService = class ProfilesService {
    db;
    pool;
    onModuleInit() {
        this.initDatabase();
    }
    async onModuleDestroy() {
        if (this.pool) {
            await this.pool.end();
        }
    }
    setDb(db) {
        this.db = db;
    }
    checkReservedName(userId, name) {
        if (name === undefined)
            return;
        if (((0, auth_admin_js_1.isReservedAdminName)(name) && userId !== (0, auth_admin_js_1.soleAdminUserId)()) || (userId === (0, auth_admin_js_1.soleAdminUserId)() && name !== 'kingame'))
            throw new common_1.UnprocessableEntityException({ code: contracts_1.ErrorCode.INVALID_INPUT, message: 'Tên này được dành riêng cho quản trị.' });
    }
    initDatabase() {
        if (this.db)
            return;
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is required');
        }
        this.pool = new pg_1.Pool({
            connectionString,
            max: 5,
        });
        const databaseSchema = { ...schema };
        Reflect.deleteProperty(databaseSchema, 'default');
        this.db = (0, node_postgres_1.drizzle)(this.pool, { schema: databaseSchema });
    }
    async getPublicProfile(userId) {
        const [dbUser] = await this.db
            .select()
            .from(schema.user)
            .where((0, drizzle_orm_1.eq)(schema.user.id, userId));
        if (!dbUser) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `User profile not found: ${userId}`,
            });
        }
        const [profile] = await this.db
            .select()
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId));
        const rawGameProfiles = await this.db
            .select({
            gameId: schema.gameProfiles.gameId,
            gameTitle: schema.games.title,
            inGameName: schema.gameProfiles.inGameName,
            rank: schema.gameProfiles.rank,
            role: schema.gameProfiles.role,
            playHours: schema.gameProfiles.playHours,
            playStyle: schema.gameProfiles.playStyle,
        })
            .from(schema.gameProfiles)
            .innerJoin(schema.games, (0, drizzle_orm_1.eq)(schema.gameProfiles.gameId, schema.games.id))
            .where((0, drizzle_orm_1.eq)(schema.gameProfiles.userId, userId));
        const gameProfiles = rawGameProfiles.map((gp) => ({
            gameId: gp.gameId,
            gameTitle: contracts_1.GameTitleSchema.parse(gp.gameTitle),
            inGameName: gp.inGameName ?? undefined,
            rank: gp.rank ?? undefined,
            role: gp.role ?? undefined,
            playHours: gp.playHours ?? undefined,
            playStyle: gp.playStyle ?? undefined,
        }));
        const avatarUrl = profile
            ? (profile.avatarUrl === null ? null : (profile.avatarUrl || dbUser.image || null))
            : (dbUser.image || null);
        const publicProfile = {
            id: dbUser.id,
            displayName: profile?.displayName || dbUser.name,
            avatarUrl,
            bio: profile?.bio || null,
            customStatus: profile?.customStatus || 'JUST_CHATTING',
            gameProfiles,
            createdAt: dbUser.createdAt.toISOString(),
        };
        return contracts_1.PublicProfileSchema.parse(publicProfile);
    }
    async getPrivateProfile(userId) {
        const [dbUser] = await this.db
            .select()
            .from(schema.user)
            .where((0, drizzle_orm_1.eq)(schema.user.id, userId));
        if (!dbUser) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `User not found: ${userId}`,
            });
        }
        const [discordAccount] = await this.db
            .select()
            .from(schema.account)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.account.userId, userId), (0, drizzle_orm_1.eq)(schema.account.providerId, 'discord')));
        const [profile] = await this.db
            .select()
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId));
        const rawGameProfiles = await this.db
            .select({
            gameId: schema.gameProfiles.gameId,
            gameTitle: schema.games.title,
            inGameName: schema.gameProfiles.inGameName,
            rank: schema.gameProfiles.rank,
            role: schema.gameProfiles.role,
            playHours: schema.gameProfiles.playHours,
            playStyle: schema.gameProfiles.playStyle,
        })
            .from(schema.gameProfiles)
            .innerJoin(schema.games, (0, drizzle_orm_1.eq)(schema.gameProfiles.gameId, schema.games.id))
            .where((0, drizzle_orm_1.eq)(schema.gameProfiles.userId, userId));
        const gameProfiles = rawGameProfiles.map((gp) => ({
            gameId: gp.gameId,
            gameTitle: contracts_1.GameTitleSchema.parse(gp.gameTitle),
            inGameName: gp.inGameName ?? undefined,
            rank: gp.rank ?? undefined,
            role: gp.role ?? undefined,
            playHours: gp.playHours ?? undefined,
            playStyle: gp.playStyle ?? undefined,
        }));
        const avatarUrl = profile
            ? (profile.avatarUrl === null ? null : (profile.avatarUrl || dbUser.image || null))
            : (dbUser.image || null);
        const privateProfile = {
            id: dbUser.id,
            displayName: profile?.displayName || dbUser.name,
            avatarUrl,
            bio: profile?.bio || null,
            customStatus: profile?.customStatus || 'JUST_CHATTING',
            gameProfiles,
            createdAt: dbUser.createdAt.toISOString(),
            email: dbUser.email,
            discordId: discordAccount?.accountId ?? null,
            emailVerified: dbUser.emailVerified,
        };
        return contracts_1.PrivateProfileSchema.parse(privateProfile);
    }
    async getGames(search) {
        const rows = await this.db
            .select({
            id: schema.games.id,
            title: schema.games.title,
            lobbyRoomId: schema.lobbies.id,
            description: schema.games.description,
            iconUrl: schema.games.iconUrl,
            bannerUrl: schema.games.bannerUrl,
        })
            .from(schema.games)
            .innerJoin(schema.lobbies, (0, drizzle_orm_1.eq)(schema.lobbies.gameId, schema.games.id));
        let filtered = rows;
        if (search && search.trim().length > 0) {
            const s = search.trim().toLowerCase();
            filtered = rows.filter((r) => r.title.toLowerCase().includes(s));
        }
        const dtos = filtered.map((g) => ({
            id: g.id,
            title: contracts_1.GameTitleSchema.parse(g.title),
            lobbyRoomId: g.lobbyRoomId,
            description: g.description ?? undefined,
            iconUrl: g.iconUrl ?? undefined,
            bannerUrl: g.bannerUrl ?? undefined,
        }));
        return zod_1.z.array(contracts_1.GameSchema).parse(dtos);
    }
    async updateProfile(userId, body, userImage) {
        this.checkReservedName(userId, body.displayName);
        const [dbUser] = await this.db
            .select()
            .from(schema.user)
            .where((0, drizzle_orm_1.eq)(schema.user.id, userId));
        if (!dbUser) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `User not found: ${userId}`,
            });
        }
        if (typeof body.avatarUrl === 'string') {
            if (!userImage || body.avatarUrl !== userImage) {
                throw new common_1.UnprocessableEntityException({
                    code: contracts_1.ErrorCode.INVALID_INPUT,
                    message: 'Arbitrary avatar URL is not permitted before T14',
                });
            }
        }
        await this.db.transaction(async (tx) => {
            await tx
                .select({ id: schema.user.id })
                .from(schema.user)
                .where((0, drizzle_orm_1.eq)(schema.user.id, userId))
                .for('update');
            const [existingProfile] = await tx
                .select()
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId));
            const now = new Date();
            let effectiveAvatar = existingProfile ? existingProfile.avatarUrl : (userImage ?? null);
            if (body.avatarUrl === null) {
                effectiveAvatar = null;
            }
            else if (body.avatarUrl !== undefined) {
                effectiveAvatar = body.avatarUrl;
            }
            await tx
                .insert(schema.profiles)
                .values({
                userId,
                displayName: body.displayName || dbUser.name,
                avatarUrl: effectiveAvatar,
                bio: body.bio ?? null,
                customStatus: body.customStatus ?? 'JUST_CHATTING',
                createdAt: now,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [schema.profiles.userId],
                set: {
                    displayName: body.displayName ?? existingProfile?.displayName ?? dbUser.name,
                    avatarUrl: effectiveAvatar,
                    bio: body.bio !== undefined ? body.bio : existingProfile?.bio ?? null,
                    customStatus: body.customStatus ?? existingProfile?.customStatus ?? 'JUST_CHATTING',
                    updatedAt: now,
                },
            });
            if (body.gameProfiles && body.gameProfiles.length > 0) {
                for (const gp of body.gameProfiles) {
                    const [game] = await tx
                        .select()
                        .from(schema.games)
                        .where((0, drizzle_orm_1.eq)(schema.games.id, gp.gameId));
                    if (!game || game.title !== gp.gameTitle) {
                        throw new common_1.UnprocessableEntityException({
                            code: contracts_1.ErrorCode.INVALID_INPUT,
                            message: `Game catalog mismatch for gameId: ${gp.gameId}`,
                        });
                    }
                    await tx
                        .insert(schema.gameProfiles)
                        .values({
                        id: (0, node_crypto_1.randomUUID)(),
                        userId,
                        gameId: gp.gameId,
                        inGameName: gp.inGameName ?? null,
                        rank: gp.rank ?? null,
                        role: gp.role ?? null,
                        playHours: gp.playHours ?? null,
                        playStyle: gp.playStyle ?? null,
                        createdAt: now,
                        updatedAt: now,
                    })
                        .onConflictDoUpdate({
                        target: [schema.gameProfiles.userId, schema.gameProfiles.gameId],
                        set: {
                            inGameName: gp.inGameName ?? null,
                            rank: gp.rank ?? null,
                            role: gp.role ?? null,
                            playHours: gp.playHours ?? null,
                            playStyle: gp.playStyle ?? null,
                            updatedAt: now,
                        },
                    });
                }
            }
        });
        return this.getPrivateProfile(userId);
    }
    async onboarding(userId, body, userImage) {
        this.checkReservedName(userId, body.displayName);
        const [dbUser] = await this.db
            .select()
            .from(schema.user)
            .where((0, drizzle_orm_1.eq)(schema.user.id, userId));
        if (!dbUser) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `User not found: ${userId}`,
            });
        }
        if (typeof body.avatarUrl === 'string') {
            if (!userImage || body.avatarUrl !== userImage) {
                throw new common_1.UnprocessableEntityException({
                    code: contracts_1.ErrorCode.INVALID_INPUT,
                    message: 'Arbitrary avatar URL is not permitted before T14',
                });
            }
        }
        await this.db.transaction(async (tx) => {
            await tx
                .select({ id: schema.user.id })
                .from(schema.user)
                .where((0, drizzle_orm_1.eq)(schema.user.id, userId))
                .for('update');
            const catalogGames = await tx
                .select()
                .from(schema.games)
                .where((0, drizzle_orm_1.inArray)(schema.games.title, body.interestedGames));
            if (catalogGames.length !== body.interestedGames.length) {
                throw new common_1.UnprocessableEntityException({
                    code: contracts_1.ErrorCode.INVALID_INPUT,
                    message: 'One or more interested games do not exist in catalog',
                });
            }
            const now = new Date();
            const effectiveAvatar = userImage || body.avatarUrl || null;
            await tx
                .insert(schema.profiles)
                .values({
                userId,
                displayName: body.displayName,
                avatarUrl: effectiveAvatar,
                bio: body.bio ?? null,
                customStatus: 'JUST_CHATTING',
                createdAt: now,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [schema.profiles.userId],
                set: {
                    displayName: body.displayName,
                    avatarUrl: effectiveAvatar,
                    bio: body.bio ?? null,
                    updatedAt: now,
                },
            });
            await tx
                .delete(schema.gameInterests)
                .where((0, drizzle_orm_1.eq)(schema.gameInterests.userId, userId));
            for (const g of catalogGames) {
                await tx.insert(schema.gameInterests).values({
                    id: (0, node_crypto_1.randomUUID)(),
                    userId,
                    gameId: g.id,
                    createdAt: now,
                });
            }
        });
        return this.getPrivateProfile(userId);
    }
    async updateInterests(userId, body) {
        const [dbUser] = await this.db
            .select()
            .from(schema.user)
            .where((0, drizzle_orm_1.eq)(schema.user.id, userId));
        if (!dbUser) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `User not found: ${userId}`,
            });
        }
        await this.db.transaction(async (tx) => {
            await tx
                .select({ id: schema.user.id })
                .from(schema.user)
                .where((0, drizzle_orm_1.eq)(schema.user.id, userId))
                .for('update');
            const catalogGames = await tx
                .select()
                .from(schema.games)
                .where((0, drizzle_orm_1.inArray)(schema.games.title, body.interestedGames));
            if (catalogGames.length !== body.interestedGames.length) {
                throw new common_1.UnprocessableEntityException({
                    code: contracts_1.ErrorCode.INVALID_INPUT,
                    message: 'One or more interested games do not exist in catalog',
                });
            }
            const now = new Date();
            await tx
                .delete(schema.gameInterests)
                .where((0, drizzle_orm_1.eq)(schema.gameInterests.userId, userId));
            for (const g of catalogGames) {
                await tx.insert(schema.gameInterests).values({
                    id: (0, node_crypto_1.randomUUID)(),
                    userId,
                    gameId: g.id,
                    createdAt: now,
                });
            }
        });
        return contracts_1.InterestsResponseSchema.parse({ interestedGames: body.interestedGames });
    }
    async updateGameProfile(userId, gameId, body) {
        const [game] = await this.db
            .select()
            .from(schema.games)
            .where((0, drizzle_orm_1.eq)(schema.games.id, gameId));
        if (!game) {
            throw new common_1.NotFoundException({
                code: contracts_1.ErrorCode.NOT_FOUND,
                message: `Game not found: ${gameId}`,
            });
        }
        const now = new Date();
        await this.db.transaction(async (tx) => {
            await tx
                .select({ id: schema.user.id })
                .from(schema.user)
                .where((0, drizzle_orm_1.eq)(schema.user.id, userId))
                .for('update');
            await tx
                .insert(schema.gameProfiles)
                .values({
                id: (0, node_crypto_1.randomUUID)(),
                userId,
                gameId,
                inGameName: body.inGameName ?? null,
                rank: body.rank ?? null,
                role: body.role ?? null,
                playHours: body.playHours ?? null,
                playStyle: body.playStyle ?? null,
                createdAt: now,
                updatedAt: now,
            })
                .onConflictDoUpdate({
                target: [schema.gameProfiles.userId, schema.gameProfiles.gameId],
                set: {
                    inGameName: body.inGameName ?? null,
                    rank: body.rank ?? null,
                    role: body.role ?? null,
                    playHours: body.playHours ?? null,
                    playStyle: body.playStyle ?? null,
                    updatedAt: now,
                },
            });
        });
        return contracts_1.GameProfileSchema.parse({
            gameId,
            gameTitle: contracts_1.GameTitleSchema.parse(game.title),
            inGameName: body.inGameName ?? undefined,
            rank: body.rank ?? undefined,
            role: body.role ?? undefined,
            playHours: body.playHours ?? undefined,
            playStyle: body.playStyle ?? undefined,
        });
    }
};
exports.ProfilesService = ProfilesService;
exports.ProfilesService = ProfilesService = __decorate([
    (0, common_1.Injectable)()
], ProfilesService);
//# sourceMappingURL=profiles.service.js.map