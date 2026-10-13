import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@fg/database';
import { MeDTO } from '@fg/contracts';
import type { Transporter } from 'nodemailer';
import { hashFgPassword, verifyFgPassword } from './auth-password.js';
export interface FgAuthOptions {
    baseURL: string;
    secret: string;
    discordClientId: string;
    discordClientSecret: string;
    mailTransport?: Transporter;
    mailFrom?: string;
    onSessionDeleting?: (sessionId: string) => Promise<void>;
    onSessionDeleted?: (userId: string) => Promise<void>;
}
export declare function createFgAuth(db: NodePgDatabase<typeof schema>, options: FgAuthOptions): import("better-auth").Auth<{
    database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("better-auth").BetterAuthOptions>;
    baseURL: string;
    secret: string;
    disabledPaths: string[];
    logger: {
        disabled: true;
    };
    plugins: [{
        id: string;
        init: () => {
            context: {
                runInBackgroundOrAwait: (task: Promise<unknown> | unknown) => Promise<void>;
            };
        };
        endpoints: {
            fgSignInAdmin: import("better-auth").StrictEndpoint<"/fg/sign-in/admin", {
                method: "POST";
                body: import("better-auth").ZodObject<{
                    username: import("better-auth").ZodLiteral<"kingame">;
                    password: import("better-auth").ZodString;
                    rememberMe: import("better-auth").ZodOptional<import("better-auth").ZodBoolean>;
                    callbackURL: import("better-auth").ZodOptional<import("better-auth").ZodString>;
                }, import("zod/v4/core").$strict>;
                metadata: {
                    noStore: boolean;
                };
            }, Response>;
            fgPasswordStatus: import("better-auth").StrictEndpoint<"/fg/password-status", {
                method: "GET";
                use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            userId: string;
                            expiresAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        };
                    };
                }>>[];
                metadata: {
                    noStore: boolean;
                };
            }, {
                hasPassword: boolean;
            }>;
            fgPasswordChallenge: import("better-auth").StrictEndpoint<"/fg/password-challenge", {
                method: "POST";
                body: import("better-auth").ZodDefault<import("better-auth").ZodObject<{}, import("zod/v4/core").$strict>>;
                use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            userId: string;
                            expiresAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        };
                    };
                }>>[];
                metadata: {
                    noStore: boolean;
                };
            }, {
                status: boolean;
            }>;
            fgPasswordAttach: import("better-auth").StrictEndpoint<"/fg/password-attach", {
                method: "POST";
                body: import("better-auth").ZodObject<{
                    token: import("better-auth").ZodString;
                    newPassword: import("better-auth").ZodString;
                }, import("zod/v4/core").$strict>;
                use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            userId: string;
                            expiresAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            createdAt: Date;
                            updatedAt: Date;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            image?: string | null | undefined;
                        };
                    };
                }>>[];
                metadata: {
                    noStore: boolean;
                };
            }, {
                status: boolean;
            }>;
        };
    }];
    hooks: {
        before: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
            status: boolean;
            message: string;
        } | {
            context: {
                query: unknown;
                body?: undefined;
            } | {
                body: unknown;
                query?: undefined;
            };
        } | undefined>>;
    };
    rateLimit: {
        enabled: true;
        window: number;
        max: number;
        customRules: {
            '/fg/sign-in/admin': {
                window: number;
                max: number;
            };
            '/sign-in/email': {
                window: number;
                max: number;
            };
            '/sign-up/email': {
                window: number;
                max: number;
            };
            '/send-verification-email': {
                window: number;
                max: number;
            };
            '/request-password-reset': {
                window: number;
                max: number;
            };
            '/fg/password-challenge': {
                window: number;
                max: number;
            };
        };
    };
    databaseHooks: {
        user: {
            create: {
                before: (user: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    email: string;
                    emailVerified: boolean;
                    name: string;
                    image?: string | null | undefined;
                } & Record<string, unknown>) => Promise<void>;
            };
        };
        session: {
            create: {
                before: (session: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    expiresAt: Date;
                    token: string;
                    ipAddress?: string | null | undefined;
                    userAgent?: string | null | undefined;
                } & Record<string, unknown>) => Promise<void>;
            };
            delete: {
                before: (session: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    expiresAt: Date;
                    token: string;
                    ipAddress?: string | null | undefined;
                    userAgent?: string | null | undefined;
                } & Record<string, unknown>) => Promise<void>;
                after: (session: {
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    expiresAt: Date;
                    token: string;
                    ipAddress?: string | null | undefined;
                    userAgent?: string | null | undefined;
                } & Record<string, unknown>) => Promise<void>;
            };
        };
    };
    emailAndPassword: {
        enabled: true;
        requireEmailVerification: true;
        autoSignIn: false;
        minPasswordLength: number;
        maxPasswordLength: number;
        resetPasswordTokenExpiresIn: number;
        revokeSessionsOnPasswordReset: true;
        password: {
            hash: typeof hashFgPassword;
            verify: typeof verifyFgPassword;
        };
        sendResetPassword: ({ user, url }: {
            user: import("better-auth").User;
            url: string;
            token: string;
        }) => Promise<void>;
    };
    emailVerification: {
        expiresIn: number;
        sendOnSignUp: true;
        sendOnSignIn: false;
        autoSignInAfterVerification: false;
        sendVerificationEmail: ({ user }: {
            user: import("better-auth").User;
            url: string;
            token: string;
        }) => Promise<void>;
    };
    socialProviders: {
        discord: {
            clientId: string;
            clientSecret: string;
            redirectURI: string;
        };
    };
    account: {
        accountLinking: {
            enabled: false;
        };
    };
    advanced: {
        useSecureCookies: boolean;
        disableOriginCheck: false;
        disableCSRFCheck: false;
    };
}>;
export type FgAuthInstance = ReturnType<typeof createFgAuth>;
export declare class AuthService implements OnModuleInit, OnModuleDestroy {
    private db;
    private pool?;
    private authInstance;
    private callHooks?;
    setCallHooks(hooks: typeof this.callHooks): void;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    setDb(db: NodePgDatabase<typeof schema>): void;
    private initDatabaseAndAuth;
    private initAuth;
    getAuthInstance(): import("better-auth").Auth<{
        database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("better-auth").BetterAuthOptions>;
        baseURL: string;
        secret: string;
        disabledPaths: string[];
        logger: {
            disabled: true;
        };
        plugins: [{
            id: string;
            init: () => {
                context: {
                    runInBackgroundOrAwait: (task: Promise<unknown> | unknown) => Promise<void>;
                };
            };
            endpoints: {
                fgSignInAdmin: import("better-auth").StrictEndpoint<"/fg/sign-in/admin", {
                    method: "POST";
                    body: import("better-auth").ZodObject<{
                        username: import("better-auth").ZodLiteral<"kingame">;
                        password: import("better-auth").ZodString;
                        rememberMe: import("better-auth").ZodOptional<import("better-auth").ZodBoolean>;
                        callbackURL: import("better-auth").ZodOptional<import("better-auth").ZodString>;
                    }, import("zod/v4/core").$strict>;
                    metadata: {
                        noStore: boolean;
                    };
                }, Response>;
                fgPasswordStatus: import("better-auth").StrictEndpoint<"/fg/password-status", {
                    method: "GET";
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    hasPassword: boolean;
                }>;
                fgPasswordChallenge: import("better-auth").StrictEndpoint<"/fg/password-challenge", {
                    method: "POST";
                    body: import("better-auth").ZodDefault<import("better-auth").ZodObject<{}, import("zod/v4/core").$strict>>;
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    status: boolean;
                }>;
                fgPasswordAttach: import("better-auth").StrictEndpoint<"/fg/password-attach", {
                    method: "POST";
                    body: import("better-auth").ZodObject<{
                        token: import("better-auth").ZodString;
                        newPassword: import("better-auth").ZodString;
                    }, import("zod/v4/core").$strict>;
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    status: boolean;
                }>;
            };
        }];
        hooks: {
            before: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                status: boolean;
                message: string;
            } | {
                context: {
                    query: unknown;
                    body?: undefined;
                } | {
                    body: unknown;
                    query?: undefined;
                };
            } | undefined>>;
        };
        rateLimit: {
            enabled: true;
            window: number;
            max: number;
            customRules: {
                '/fg/sign-in/admin': {
                    window: number;
                    max: number;
                };
                '/sign-in/email': {
                    window: number;
                    max: number;
                };
                '/sign-up/email': {
                    window: number;
                    max: number;
                };
                '/send-verification-email': {
                    window: number;
                    max: number;
                };
                '/request-password-reset': {
                    window: number;
                    max: number;
                };
                '/fg/password-challenge': {
                    window: number;
                    max: number;
                };
            };
        };
        databaseHooks: {
            user: {
                create: {
                    before: (user: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        email: string;
                        emailVerified: boolean;
                        name: string;
                        image?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
            };
            session: {
                create: {
                    before: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
                delete: {
                    before: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                    after: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
            };
        };
        emailAndPassword: {
            enabled: true;
            requireEmailVerification: true;
            autoSignIn: false;
            minPasswordLength: number;
            maxPasswordLength: number;
            resetPasswordTokenExpiresIn: number;
            revokeSessionsOnPasswordReset: true;
            password: {
                hash: typeof hashFgPassword;
                verify: typeof verifyFgPassword;
            };
            sendResetPassword: ({ user, url }: {
                user: import("better-auth").User;
                url: string;
                token: string;
            }) => Promise<void>;
        };
        emailVerification: {
            expiresIn: number;
            sendOnSignUp: true;
            sendOnSignIn: false;
            autoSignInAfterVerification: false;
            sendVerificationEmail: ({ user }: {
                user: import("better-auth").User;
                url: string;
                token: string;
            }) => Promise<void>;
        };
        socialProviders: {
            discord: {
                clientId: string;
                clientSecret: string;
                redirectURI: string;
            };
        };
        account: {
            accountLinking: {
                enabled: false;
            };
        };
        advanced: {
            useSecureCookies: boolean;
            disableOriginCheck: false;
            disableCSRFCheck: false;
        };
    }>;
    getAuthHandler(): (req: import("http").IncomingMessage, res: import("http").ServerResponse) => Promise<void>;
    getAuthConfig(): {
        database: (options: import("better-auth").BetterAuthOptions) => import("better-auth").DBAdapter<import("better-auth").BetterAuthOptions>;
        baseURL: string;
        secret: string;
        disabledPaths: string[];
        logger: {
            disabled: true;
        };
        plugins: [{
            id: string;
            init: () => {
                context: {
                    runInBackgroundOrAwait: (task: Promise<unknown> | unknown) => Promise<void>;
                };
            };
            endpoints: {
                fgSignInAdmin: import("better-auth").StrictEndpoint<"/fg/sign-in/admin", {
                    method: "POST";
                    body: import("better-auth").ZodObject<{
                        username: import("better-auth").ZodLiteral<"kingame">;
                        password: import("better-auth").ZodString;
                        rememberMe: import("better-auth").ZodOptional<import("better-auth").ZodBoolean>;
                        callbackURL: import("better-auth").ZodOptional<import("better-auth").ZodString>;
                    }, import("zod/v4/core").$strict>;
                    metadata: {
                        noStore: boolean;
                    };
                }, Response>;
                fgPasswordStatus: import("better-auth").StrictEndpoint<"/fg/password-status", {
                    method: "GET";
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    hasPassword: boolean;
                }>;
                fgPasswordChallenge: import("better-auth").StrictEndpoint<"/fg/password-challenge", {
                    method: "POST";
                    body: import("better-auth").ZodDefault<import("better-auth").ZodObject<{}, import("zod/v4/core").$strict>>;
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    status: boolean;
                }>;
                fgPasswordAttach: import("better-auth").StrictEndpoint<"/fg/password-attach", {
                    method: "POST";
                    body: import("better-auth").ZodObject<{
                        token: import("better-auth").ZodString;
                        newPassword: import("better-auth").ZodString;
                    }, import("zod/v4/core").$strict>;
                    use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                        session: {
                            session: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                userId: string;
                                expiresAt: Date;
                                token: string;
                                ipAddress?: string | null | undefined;
                                userAgent?: string | null | undefined;
                            };
                            user: Record<string, any> & {
                                id: string;
                                createdAt: Date;
                                updatedAt: Date;
                                email: string;
                                emailVerified: boolean;
                                name: string;
                                image?: string | null | undefined;
                            };
                        };
                    }>>[];
                    metadata: {
                        noStore: boolean;
                    };
                }, {
                    status: boolean;
                }>;
            };
        }];
        hooks: {
            before: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                status: boolean;
                message: string;
            } | {
                context: {
                    query: unknown;
                    body?: undefined;
                } | {
                    body: unknown;
                    query?: undefined;
                };
            } | undefined>>;
        };
        rateLimit: {
            enabled: true;
            window: number;
            max: number;
            customRules: {
                '/fg/sign-in/admin': {
                    window: number;
                    max: number;
                };
                '/sign-in/email': {
                    window: number;
                    max: number;
                };
                '/sign-up/email': {
                    window: number;
                    max: number;
                };
                '/send-verification-email': {
                    window: number;
                    max: number;
                };
                '/request-password-reset': {
                    window: number;
                    max: number;
                };
                '/fg/password-challenge': {
                    window: number;
                    max: number;
                };
            };
        };
        databaseHooks: {
            user: {
                create: {
                    before: (user: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        email: string;
                        emailVerified: boolean;
                        name: string;
                        image?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
            };
            session: {
                create: {
                    before: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
                delete: {
                    before: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                    after: (session: {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    } & Record<string, unknown>) => Promise<void>;
                };
            };
        };
        emailAndPassword: {
            enabled: true;
            requireEmailVerification: true;
            autoSignIn: false;
            minPasswordLength: number;
            maxPasswordLength: number;
            resetPasswordTokenExpiresIn: number;
            revokeSessionsOnPasswordReset: true;
            password: {
                hash: typeof hashFgPassword;
                verify: typeof verifyFgPassword;
            };
            sendResetPassword: ({ user, url }: {
                user: import("better-auth").User;
                url: string;
                token: string;
            }) => Promise<void>;
        };
        emailVerification: {
            expiresIn: number;
            sendOnSignUp: true;
            sendOnSignIn: false;
            autoSignInAfterVerification: false;
            sendVerificationEmail: ({ user }: {
                user: import("better-auth").User;
                url: string;
                token: string;
            }) => Promise<void>;
        };
        socialProviders: {
            discord: {
                clientId: string;
                clientSecret: string;
                redirectURI: string;
            };
        };
        account: {
            accountLinking: {
                enabled: false;
            };
        };
        advanced: {
            useSecureCookies: boolean;
            disableOriginCheck: false;
            disableCSRFCheck: false;
        };
    };
    isUserBanned(userId: string): Promise<boolean>;
    isUserOnboarded(userId: string): Promise<boolean>;
    isUserAdmin(userId: string): Promise<boolean>;
    getUserMe(userId: string): Promise<MeDTO>;
}
