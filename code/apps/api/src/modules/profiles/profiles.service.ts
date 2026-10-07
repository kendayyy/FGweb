import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '@fg/database';
import {
  ProfileDTO,
  PrivateProfileDTO,
  PublicProfileSchema,
  PrivateProfileSchema,
  GameDTO,
  GameSchema,
  InterestsResponse,
  InterestsResponseSchema,
  GameProfileDTO,
  GameProfileSchema,
  GameTitleSchema,
  UpdateProfileRequest,
  OnboardingRequest,
  UpdateInterestsRequest,
  UpdateGameProfileRequest,
  ErrorCode,
} from '@fg/contracts';
import { z } from 'zod';

@Injectable()
export class ProfilesService implements OnModuleInit, OnModuleDestroy {
  private db!: NodePgDatabase<typeof schema>;
  private pool?: Pool;

  onModuleInit() {
    this.initDatabase();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  public setDb(db: NodePgDatabase<typeof schema>) {
    this.db = db;
  }

  private initDatabase() {
    if (this.db) return;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    this.pool = new Pool({
      connectionString,
      max: 5,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async getPublicProfile(userId: string): Promise<ProfileDTO> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `User profile not found: ${userId}`,
      });
    }

    const [profile] = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));

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
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .where(eq(schema.gameProfiles.userId, userId));

    const gameProfiles = rawGameProfiles.map((gp) => ({
      gameId: gp.gameId,
      gameTitle: GameTitleSchema.parse(gp.gameTitle),
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
      customStatus: (profile?.customStatus as 'LOOKING_FOR_TEAM' | 'PLAYING' | 'JUST_CHATTING') || 'JUST_CHATTING',
      gameProfiles,
      createdAt: dbUser.createdAt.toISOString(),
    };

    return PublicProfileSchema.parse(publicProfile);
  }

  async getPrivateProfile(userId: string): Promise<PrivateProfileDTO> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `User not found: ${userId}`,
      });
    }

    const [discordAccount] = await this.db
      .select()
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, userId),
          eq(schema.account.providerId, 'discord')
        )
      );

    const [profile] = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));

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
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .where(eq(schema.gameProfiles.userId, userId));

    const gameProfiles = rawGameProfiles.map((gp) => ({
      gameId: gp.gameId,
      gameTitle: GameTitleSchema.parse(gp.gameTitle),
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
      customStatus: (profile?.customStatus as 'LOOKING_FOR_TEAM' | 'PLAYING' | 'JUST_CHATTING') || 'JUST_CHATTING',
      gameProfiles,
      createdAt: dbUser.createdAt.toISOString(),
      email: dbUser.email,
      discordId: discordAccount?.accountId??null,
      emailVerified: dbUser.emailVerified,
    };

    return PrivateProfileSchema.parse(privateProfile);
  }

  async getGames(search?: string): Promise<GameDTO[]> {
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
      .innerJoin(schema.lobbies, eq(schema.lobbies.gameId, schema.games.id));

    let filtered = rows;
    if (search && search.trim().length > 0) {
      const s = search.trim().toLowerCase();
      filtered = rows.filter((r) => r.title.toLowerCase().includes(s));
    }

    const dtos = filtered.map((g) => ({
      id: g.id,
      title: GameTitleSchema.parse(g.title),
      lobbyRoomId: g.lobbyRoomId,
      description: g.description ?? undefined,
      iconUrl: g.iconUrl ?? undefined,
      bannerUrl: g.bannerUrl ?? undefined,
    }));

    return z.array(GameSchema).parse(dtos);
  }

  async updateProfile(
    userId: string,
    body: UpdateProfileRequest,
    userImage?: string | null
  ): Promise<PrivateProfileDTO> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `User not found: ${userId}`,
      });
    }

    // Avatar validation before T14:
    // Reject arbitrary avatar URL if provided and doesn't match provider image
    if (typeof body.avatarUrl === 'string') {
      if (!userImage || body.avatarUrl !== userImage) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_INPUT,
          message: 'Arbitrary avatar URL is not permitted before T14',
        });
      }
    }

    await this.db.transaction(async (tx) => {
      // Lock user row to prevent concurrency race
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .for('update');

      const [existingProfile] = await tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId));

      const now = new Date();
      let effectiveAvatar: string | null = existingProfile ? existingProfile.avatarUrl : (userImage ?? null);
      if (body.avatarUrl === null) {
        effectiveAvatar = null;
      } else if (body.avatarUrl !== undefined) {
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
            .where(eq(schema.games.id, gp.gameId));

          if (!game || game.title !== gp.gameTitle) {
            throw new UnprocessableEntityException({
              code: ErrorCode.INVALID_INPUT,
              message: `Game catalog mismatch for gameId: ${gp.gameId}`,
            });
          }

          await tx
            .insert(schema.gameProfiles)
            .values({
              id: randomUUID(),
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

  async onboarding(
    userId: string,
    body: OnboardingRequest,
    userImage?: string | null
  ): Promise<PrivateProfileDTO> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `User not found: ${userId}`,
      });
    }

    // Avatar validation before T14:
    // Reject arbitrary avatar URL if provided and doesn't match provider image
    if (typeof body.avatarUrl === 'string') {
      if (!userImage || body.avatarUrl !== userImage) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_INPUT,
          message: 'Arbitrary avatar URL is not permitted before T14',
        });
      }
    }

    await this.db.transaction(async (tx) => {
      // Lock user row to prevent concurrency race
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .for('update');

      const catalogGames = await tx
        .select()
        .from(schema.games)
        .where(inArray(schema.games.title, body.interestedGames));

      if (catalogGames.length !== body.interestedGames.length) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_INPUT,
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
        .where(eq(schema.gameInterests.userId, userId));

      for (const g of catalogGames) {
        await tx.insert(schema.gameInterests).values({
          id: randomUUID(),
          userId,
          gameId: g.id,
          createdAt: now,
        });
      }
    });

    return this.getPrivateProfile(userId);
  }

  async updateInterests(
    userId: string,
    body: UpdateInterestsRequest
  ): Promise<InterestsResponse> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `User not found: ${userId}`,
      });
    }

    await this.db.transaction(async (tx) => {
      // Lock user row to prevent concurrency race between simultaneous interest replacements
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .for('update');

      const catalogGames = await tx
        .select()
        .from(schema.games)
        .where(inArray(schema.games.title, body.interestedGames));

      if (catalogGames.length !== body.interestedGames.length) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_INPUT,
          message: 'One or more interested games do not exist in catalog',
        });
      }

      const now = new Date();

      await tx
        .delete(schema.gameInterests)
        .where(eq(schema.gameInterests.userId, userId));

      for (const g of catalogGames) {
        await tx.insert(schema.gameInterests).values({
          id: randomUUID(),
          userId,
          gameId: g.id,
          createdAt: now,
        });
      }
    });

    return InterestsResponseSchema.parse({ interestedGames: body.interestedGames });
  }

  async updateGameProfile(
    userId: string,
    gameId: string,
    body: UpdateGameProfileRequest
  ): Promise<GameProfileDTO> {
    const [game] = await this.db
      .select()
      .from(schema.games)
      .where(eq(schema.games.id, gameId));

    if (!game) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `Game not found: ${gameId}`,
      });
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      // Lock user row to prevent concurrency race
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .for('update');

      await tx
        .insert(schema.gameProfiles)
        .values({
          id: randomUUID(),
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

    return GameProfileSchema.parse({
      gameId,
      gameTitle: GameTitleSchema.parse(game.title),
      inGameName: body.inGameName ?? undefined,
      rank: body.rank ?? undefined,
      role: body.role ?? undefined,
      playHours: body.playHours ?? undefined,
      playStyle: body.playStyle ?? undefined,
    });
  }
}
