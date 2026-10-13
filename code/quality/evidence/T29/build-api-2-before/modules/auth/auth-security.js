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
exports.createAuthSecurity = createAuthSecurity;
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const api_1 = require("better-auth/api");
const auth_password_js_1 = require("./auth-password.js");
const schema = __importStar(require("@fg/database"));
const contracts_1 = require("@fg/contracts");
const auth_mail_js_1 = require("./auth-mail.js");
const auth_admin_js_1 = require("./auth-admin.js");
const digest = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
const invalid = () => new api_1.APIError('BAD_REQUEST', { code: 'INVALID_TOKEN', message: 'Liên kết không hợp lệ hoặc đã hết hạn.' });
const genericReset = { status: true, message: 'If this email exists in our system, check your email for the reset link' };
function createAuthSecurity(db, mail, from, baseURL) {
    const banned = async (userId, queryDb = db) => {
        const [latest] = await queryDb.select().from(schema.adminActions).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.adminActions.targetUserId, userId), (0, drizzle_orm_1.inArray)(schema.adminActions.action, ['BAN', 'UNBAN']))).orderBy((0, drizzle_orm_1.desc)(schema.adminActions.createdAt), (0, drizzle_orm_1.desc)(schema.adminActions.id)).limit(1);
        return latest?.action === 'BAN';
    };
    const requireCurrent = async (session, queryDb = db) => {
        if (!session)
            throw new api_1.APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ.' });
        const [current] = await queryDb.select().from(schema.session).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.session.id, session.session.id), (0, drizzle_orm_1.eq)(schema.session.userId, session.user.id), (0, drizzle_orm_1.gt)(schema.session.expiresAt, (0, drizzle_orm_1.sql) `clock_timestamp() AT TIME ZONE 'UTC'`))).limit(1);
        if (!current)
            throw new api_1.APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ.' });
        if (await banned(session.user.id, queryDb))
            throw new api_1.APIError('FORBIDDEN', { code: 'ACCOUNT_BANNED', message: 'Tài khoản đã bị khóa.' });
        const [user] = await queryDb.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.id, session.user.id)).limit(1);
        if (!user)
            throw new api_1.APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ.' });
        return user;
    };
    const hasPassword = async (userId, queryDb = db) => Boolean((await queryDb.select({ id: schema.account.id }).from(schema.account).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.account.userId, userId), (0, drizzle_orm_1.eq)(schema.account.providerId, 'credential'), (0, drizzle_orm_1.eq)(schema.account.accountId, userId))).limit(1))[0]);
    const recordEmailToken = async (userId, token) => {
        const identifier = `fg-email:${digest(token)}`, now = new Date();
        await db.transaction(async (tx) => { await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext(${identifier}))`); await tx.delete(schema.verification).where((0, drizzle_orm_1.eq)(schema.verification.identifier, identifier)); await tx.insert(schema.verification).values({ id: (0, node_crypto_1.randomUUID)(), identifier, value: userId, expiresAt: new Date(now.getTime() + 86400000), createdAt: now, updatedAt: now }); });
    };
    const consumeEmailToken = async (token) => {
        const consumed = await db.delete(schema.verification).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.verification.identifier, `fg-email:${digest(token)}`), (0, drizzle_orm_1.gt)(schema.verification.expiresAt, (0, drizzle_orm_1.sql) `clock_timestamp() AT TIME ZONE 'UTC'`))).returning({ value: schema.verification.value });
        if (consumed.length !== 1)
            throw invalid();
    };
    const plugin = { id: 'fg-password-ownership', init: () => ({ context: {
                runInBackgroundOrAwait: async (task) => { await task; },
            } }), endpoints: {
            fgSignInAdmin: (0, api_1.createAuthEndpoint)('/fg/sign-in/admin', { method: 'POST', body: contracts_1.SignInAdminRequestSchema, metadata: { noStore: true } }, async (ctx) => {
                const userId = (0, auth_admin_js_1.soleAdminUserId)();
                const [user] = userId ? await db.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.id, userId)).limit(1) : [];
                if (!user || user.name !== 'kingame' || !await hasPassword(user.id)) {
                    await (0, auth_password_js_1.hashFgPassword)(ctx.body.password);
                    throw new api_1.APIError('UNAUTHORIZED', { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Thông tin đăng nhập không đúng.' });
                }
                return (0, api_1.signInEmail)()({ ...ctx, asResponse: true, body: { email: user.email, password: ctx.body.password, rememberMe: ctx.body.rememberMe, callbackURL: ctx.body.callbackURL } });
            }),
            fgPasswordStatus: (0, api_1.createAuthEndpoint)('/fg/password-status', { method: 'GET', use: [api_1.sessionMiddleware], metadata: { noStore: true } }, async (ctx) => { await requireCurrent(ctx.context.session); return ctx.json({ hasPassword: await hasPassword(ctx.context.session.user.id) }); }),
            fgPasswordChallenge: (0, api_1.createAuthEndpoint)('/fg/password-challenge', { method: 'POST', body: contracts_1.PasswordChallengeRequestSchema, use: [api_1.sessionMiddleware], metadata: { noStore: true } }, async (ctx) => {
                const session = ctx.context.session, token = (0, node_crypto_1.randomBytes)(32).toString('base64url'), now = new Date();
                const user = await db.transaction(async (tx) => { await tx.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.id, session.user.id)).for('update'); const user = await requireCurrent(session, tx); if (await hasPassword(user.id, tx))
                    throw new api_1.APIError('CONFLICT', { code: 'PASSWORD_ALREADY_SET', message: 'Tài khoản đã có mật khẩu.' }); await tx.insert(schema.verification).values({ id: (0, node_crypto_1.randomUUID)(), identifier: `fg-password:${digest(token)}`, value: JSON.stringify({ userId: user.id, sessionId: session.session.id, email: user.email }), expiresAt: new Date(now.getTime() + 86400000), createdAt: now, updatedAt: now }); return user; });
                try {
                    await (0, auth_mail_js_1.sendAuthMail)(mail, from, user.email, 'ATTACH', `${baseURL}/auth/add-password?token=${encodeURIComponent(token)}`);
                }
                catch (error) {
                    await db.delete(schema.verification).where((0, drizzle_orm_1.eq)(schema.verification.identifier, `fg-password:${digest(token)}`));
                    throw error;
                }
                return ctx.json({ status: true });
            }),
            fgPasswordAttach: (0, api_1.createAuthEndpoint)('/fg/password-attach', { method: 'POST', body: contracts_1.AttachPasswordRequestSchema, use: [api_1.sessionMiddleware], metadata: { noStore: true } }, async (ctx) => {
                const session = ctx.context.session, hashed = await (0, auth_password_js_1.hashFgPassword)(ctx.body.newPassword);
                await db.transaction(async (tx) => {
                    await tx.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.id, session.user.id)).for('update');
                    const user = await requireCurrent(session, tx);
                    const [challenge] = await tx.select().from(schema.verification).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.verification.identifier, `fg-password:${digest(ctx.body.token)}`), (0, drizzle_orm_1.gt)(schema.verification.expiresAt, (0, drizzle_orm_1.sql) `clock_timestamp() AT TIME ZONE 'UTC'`))).for('update');
                    if (!challenge)
                        throw invalid();
                    let metadata;
                    try {
                        metadata = JSON.parse(challenge.value);
                    }
                    catch {
                        throw invalid();
                    }
                    if (metadata.userId !== user.id || metadata.sessionId !== session.session.id || metadata.email !== user.email)
                        throw new api_1.APIError('FORBIDDEN', { code: 'EMAIL_OWNERSHIP_MISMATCH', message: 'Liên kết thuộc phiên đăng nhập khác.' });
                    if (await hasPassword(user.id, tx))
                        throw new api_1.APIError('CONFLICT', { code: 'PASSWORD_ALREADY_SET', message: 'Tài khoản đã có mật khẩu.' });
                    await tx.delete(schema.verification).where((0, drizzle_orm_1.eq)(schema.verification.id, challenge.id));
                    const now = new Date();
                    await tx.insert(schema.account).values({ id: (0, node_crypto_1.randomUUID)(), accountId: user.id, providerId: 'credential', userId: user.id, password: hashed, createdAt: now, updatedAt: now });
                    await tx.update(schema.user).set({ emailVerified: true, updatedAt: now }).where((0, drizzle_orm_1.eq)(schema.user.id, user.id));
                });
                return ctx.json({ status: true });
            }),
        } };
    const before = (0, api_1.createAuthMiddleware)(async (ctx) => {
        if (ctx.path === '/sign-up/email' && typeof ctx.body?.name === 'string' && (0, auth_admin_js_1.isReservedAdminName)(ctx.body.name))
            throw new api_1.APIError('BAD_REQUEST', { code: 'RESERVED_USERNAME', message: 'Tên này được dành riêng cho quản trị.' });
        if (ctx.path === '/update-user' && typeof ctx.body?.name === 'string') {
            const user = await requireCurrent(await (0, api_1.getSessionFromCtx)(ctx));
            if (((0, auth_admin_js_1.isReservedAdminName)(ctx.body.name) && user.id !== (0, auth_admin_js_1.soleAdminUserId)()) || (user.id === (0, auth_admin_js_1.soleAdminUserId)() && ctx.body.name !== 'kingame'))
                throw new api_1.APIError('BAD_REQUEST', { code: 'RESERVED_USERNAME', message: 'Tên này được dành riêng cho quản trị.' });
        }
        const endpoint = contracts_1.ApiEndpointRegistry.find(e => e.path === `/api/auth${ctx.path}`), isQuery = ctx.path === '/verify-email';
        const parsed = endpoint?.requestSchema?.safeParse(isQuery ? ctx.query : ctx.body);
        if (parsed && !parsed.success)
            throw new api_1.APIError('BAD_REQUEST', { code: 'INVALID_AUTH_REQUEST', message: 'Thông tin xác thực không hợp lệ.' });
        if (ctx.path === '/verify-email')
            await consumeEmailToken(contracts_1.VerifyEmailQuerySchema.parse(ctx.query).token);
        if (ctx.path === '/change-password')
            await requireCurrent(await (0, api_1.getSessionFromCtx)(ctx));
        if (ctx.path === '/request-password-reset') {
            const request = contracts_1.RequestPasswordResetSchema.parse(ctx.body);
            const [user] = await db.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.email, request.email.toLowerCase())).limit(1);
            if (!user || !user.emailVerified || !await hasPassword(user.id) || await banned(user.id))
                return ctx.json(genericReset);
        }
        if (ctx.path === '/reset-password') {
            const request = contracts_1.ResetPasswordRequestSchema.parse(ctx.body);
            const [verification] = await db.select().from(schema.verification).where((0, drizzle_orm_1.eq)(schema.verification.identifier, `reset-password:${request.token}`)).limit(1);
            if (!verification || !await hasPassword(verification.value) || await banned(verification.value))
                throw invalid();
        }
        if (parsed?.success)
            return { context: isQuery ? { query: parsed.data } : { body: parsed.data } };
    });
    return { plugin, before, banned, recordEmailToken };
}
//# sourceMappingURL=auth-security.js.map