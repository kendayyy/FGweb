import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { toNodeHandler } from 'better-auth/node';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, desc, and, inArray } from 'drizzle-orm';
import * as schema from '@fg/database';
import { MeDTO, MeDTOSchema } from '@fg/contracts';
import type {Transporter} from 'nodemailer';
import {authMailTransport,sendAuthMail} from './auth-mail.js';
import {createAuthSecurity} from './auth-security.js';
import {APIError,createEmailVerificationToken} from 'better-auth/api';
import {randomUUID} from 'node:crypto';

export interface FgAuthOptions {
  baseURL: string;
  secret: string;
  discordClientId: string;
  discordClientSecret: string;
  mailTransport?:Transporter;
  mailFrom?:string;
}

export function createFgAuth(db: NodePgDatabase<typeof schema>, options: FgAuthOptions) {
  const isHttps = options.baseURL.startsWith('https://');
  const mail=options.mailTransport??authMailTransport(),from=options.mailFrom??process.env.SMTP_FROM!;
  const security=createAuthSecurity(db,mail,from,options.baseURL);
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    baseURL: options.baseURL,
    secret: options.secret,
    disabledPaths: ['/get-access-token', '/refresh-token','/set-password'],
    logger:{disabled:true},
    plugins:[security.plugin],
    hooks:{before:security.before},
    rateLimit:{enabled:true,window:60,max:100,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:5},'/send-verification-email':{window:60,max:3},'/request-password-reset':{window:60,max:3},'/fg/password-challenge':{window:60,max:3}}},
    databaseHooks:{session:{create:{before:async session=>{if(await security.banned(session.userId))throw new APIError('FORBIDDEN',{code:'ACCOUNT_BANNED',message:'Tài khoản đã bị khóa.'});}}}},
    emailAndPassword: {
      enabled: true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:12,maxPasswordLength:128,resetPasswordTokenExpiresIn:3600,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,url})=>{await sendAuthMail(mail,from,user.email,'RESET',url);},
    },
    emailVerification:{expiresIn:86400,sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,sendVerificationEmail:async({user,url})=>{
      // Native JWTs without a nonce can repeat within a second on resend.
      // Keep Better Auth signing/validation while making each mailed link unique.
      const token=await createEmailVerificationToken(options.secret,user.email,undefined,86400,{jti:randomUUID()});
      const link=new URL(url);link.searchParams.set('token',token);
      await security.recordEmailToken(user.id,token);await sendAuthMail(mail,from,user.email,'VERIFY',link.toString());
    }},
    socialProviders: {
      discord: {
        clientId: options.discordClientId,
        clientSecret: options.discordClientSecret,
        redirectURI: `${options.baseURL}/api/auth/callback/discord`,
      },
    },
    account: {
      accountLinking: {
        enabled: false,
      },
    },
    advanced: {
      useSecureCookies: isHttps,
      disableOriginCheck:false,
      disableCSRFCheck:false,
    },
  });
}

export type FgAuthInstance = ReturnType<typeof createFgAuth>;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private db!: NodePgDatabase<typeof schema>;
  private pool?: Pool;
  private authInstance!: FgAuthInstance;

  onModuleInit() {
    this.initDatabaseAndAuth();
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  public setDb(db: NodePgDatabase<typeof schema>) {
    this.db = db;
    this.initAuth();
  }

  private initDatabaseAndAuth() {
    if (this.db) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
    this.initAuth();
  }

  private initAuth() {
    const baseURL = process.env.BETTER_AUTH_URL || process.env.PUBLIC_ORIGIN;
    if (!baseURL) {
      throw new Error('BETTER_AUTH_URL or PUBLIC_ORIGIN environment variable is required');
    }

    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
      throw new Error('BETTER_AUTH_SECRET environment variable is required');
    }

    const discordClientId = process.env.DISCORD_CLIENT_ID;
    const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!discordClientId || !discordClientSecret) {
      throw new Error('DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET environment variables are required');
    }

    this.authInstance = createFgAuth(this.db, {
      baseURL,
      secret,
      discordClientId,
      discordClientSecret,
    });
  }

  public getAuthInstance() {
    if (!this.authInstance) {
      this.initAuth();
    }
    return this.authInstance;
  }

  public getAuthHandler() {
    return toNodeHandler(this.getAuthInstance());
  }

  public getAuthConfig() {
    return this.getAuthInstance().options;
  }

  public async isUserBanned(userId: string): Promise<boolean> {
    const [latestAction] = await this.db
      .select()
      .from(schema.adminActions)
      .where(
        and(
          eq(schema.adminActions.targetUserId, userId),
          inArray(schema.adminActions.action, ['BAN', 'UNBAN'])
        )
      )
      .orderBy(desc(schema.adminActions.createdAt), desc(schema.adminActions.id))
      .limit(1);

    return latestAction?.action === 'BAN';
  }

  public async isUserOnboarded(userId: string): Promise<boolean> {
    const [profile] = await this.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));

    if (!profile) {
      return false;
    }

    const interests = await this.db
      .select()
      .from(schema.gameInterests)
      .where(eq(schema.gameInterests.userId, userId));

    return interests.length > 0;
  }

  public async isUserAdmin(userId: string): Promise<boolean> {
    if (!userId) return false;

    const adminUserIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (adminUserIds.includes(userId)) {
      return true;
    }

    const adminDiscordIds = (process.env.ADMIN_DISCORD_IDS || '')
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);

    if (adminDiscordIds.length > 0) {
      const [discordAccount] = await this.db
        .select()
        .from(schema.account)
        .where(
          and(
            eq(schema.account.userId, userId),
            eq(schema.account.providerId, 'discord')
          )
        );

      if (discordAccount && adminDiscordIds.includes(discordAccount.accountId)) {
        return true;
      }
    }

    return false;
  }

  public async getUserMe(userId: string): Promise<MeDTO> {
    const [dbUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    if (!dbUser) {
      throw new Error(`User not found: ${userId}`);
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

    const interests = await this.db
      .select({ title: schema.games.title })
      .from(schema.gameInterests)
      .innerJoin(schema.games, eq(schema.gameInterests.gameId, schema.games.id))
      .where(eq(schema.gameInterests.userId, userId))
      .orderBy(schema.games.title);

    const meData = {
      id: dbUser.id,
      displayName: profile?.displayName || dbUser.name,
      avatarUrl: profile ? profile.avatarUrl : (dbUser.image ?? null),
      email: dbUser.email,
      emailVerified: dbUser.emailVerified,
      discordId: discordAccount?.accountId??null,
      customStatus: profile?.customStatus || 'JUST_CHATTING',
      createdAt: dbUser.createdAt.toISOString(),
      updatedAt: dbUser.updatedAt.toISOString(),
      onboardingComplete: Boolean(profile) && interests.length > 0,
      interestedGames: interests.map(interest => interest.title),
    };

    return MeDTOSchema.parse(meData);
  }
}
