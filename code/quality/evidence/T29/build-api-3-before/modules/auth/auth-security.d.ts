import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transporter } from 'nodemailer';
import * as schema from '@fg/database';
type Db = NodePgDatabase<typeof schema>;
export declare function createAuthSecurity(db: Db, mail: Transporter, from: string, baseURL: string): {
    plugin: {
        id: string;
        init: () => {
            context: {
                runInBackgroundOrAwait: (task: Promise<unknown> | unknown) => Promise<void>;
            };
        };
        endpoints: {
            fgSignInAdmin: import("better-call").StrictEndpoint<"/fg/sign-in/admin", {
                method: "POST";
                body: import("zod").ZodObject<{
                    username: import("zod").ZodLiteral<"kingame">;
                    password: import("zod").ZodString;
                    rememberMe: import("zod").ZodOptional<import("zod").ZodBoolean>;
                    callbackURL: import("zod").ZodOptional<import("zod").ZodString>;
                }, import("zod/v4/core").$strict>;
                metadata: {
                    noStore: boolean;
                };
            }, Response>;
            fgPasswordStatus: import("better-call").StrictEndpoint<"/fg/password-status", {
                method: "GET";
                use: import("better-call").Middleware<import("better-call").MiddlewareOptions, (inputContext: import("better-call").MiddlewareInputContext<import("better-call").MiddlewareOptions>) => Promise<{
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
            fgPasswordChallenge: import("better-call").StrictEndpoint<"/fg/password-challenge", {
                method: "POST";
                body: import("zod").ZodDefault<import("zod").ZodObject<{}, import("zod/v4/core").$strict>>;
                use: import("better-call").Middleware<import("better-call").MiddlewareOptions, (inputContext: import("better-call").MiddlewareInputContext<import("better-call").MiddlewareOptions>) => Promise<{
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
            fgPasswordAttach: import("better-call").StrictEndpoint<"/fg/password-attach", {
                method: "POST";
                body: import("zod").ZodObject<{
                    token: import("zod").ZodString;
                    newPassword: import("zod").ZodString;
                }, import("zod/v4/core").$strict>;
                use: import("better-call").Middleware<import("better-call").MiddlewareOptions, (inputContext: import("better-call").MiddlewareInputContext<import("better-call").MiddlewareOptions>) => Promise<{
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
    };
    before: import("better-call").Middleware<import("better-call").MiddlewareOptions, (inputContext: import("better-call").MiddlewareInputContext<import("better-call").MiddlewareOptions>) => Promise<{
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
    banned: (userId: string, queryDb?: Db) => Promise<boolean>;
    recordEmailToken: (userId: string, token: string) => Promise<void>;
};
export {};
