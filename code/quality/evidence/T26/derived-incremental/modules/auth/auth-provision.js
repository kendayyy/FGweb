"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionAdminAccount = provisionAdminAccount;
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const schema = require("@fg/database");
const contracts_1 = require("@fg/contracts");
const auth_password_js_1 = require("./auth-password.js");
const ownerIdentifier = 'fg-admin-provision:v1';
async function provisionAdminAccount(db, input) {
    const userId = contracts_1.IdSchema.parse(input.userId), email = contracts_1.AuthEmailSchema.parse(input.email).toLowerCase(), password = contracts_1.AuthPasswordSchema.parse(input.password);
    if (/[\s,]/.test(userId))
        throw new Error('Invalid fixed admin identity');
    const binding = (0, node_crypto_1.createHash)('sha256').update(`${userId}\0${email}`).digest('hex');
    return db.transaction(async (tx) => {
        await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext(${ownerIdentifier}))`);
        const [marker] = await tx.select().from(schema.verification).where((0, drizzle_orm_1.eq)(schema.verification.identifier, ownerIdentifier)).limit(1);
        if (marker) {
            if (marker.value !== binding)
                throw new Error('Admin owner binding conflicts; no identity was changed');
            const [user] = await tx.select().from(schema.user).where((0, drizzle_orm_1.eq)(schema.user.id, userId)).limit(1);
            const [credential] = await tx.select().from(schema.account).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.account.userId, userId), (0, drizzle_orm_1.eq)(schema.account.accountId, userId), (0, drizzle_orm_1.eq)(schema.account.providerId, 'credential'))).limit(1);
            if (!user || user.name !== 'kingame' || user.email !== email || !credential?.password?.startsWith('fgscrypt-v1:'))
                throw new Error('Provisioned owner is inconsistent; no repair or password reset performed');
            return { created: false, verified: user.emailVerified };
        }
        const collisions = await tx.select({ id: schema.user.id }).from(schema.user).where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.user.id, userId), (0, drizzle_orm_1.sql) `lower(${schema.user.email})=${email}`, (0, drizzle_orm_1.sql) `lower(btrim(normalize(${schema.user.name},NFKC)))='kingame'`)).limit(1);
        const profileCollisions = await tx.select({ id: schema.profiles.userId }).from(schema.profiles).where((0, drizzle_orm_1.sql) `lower(btrim(normalize(${schema.profiles.displayName},NFKC)))='kingame'`).limit(1);
        if (collisions.length || profileCollisions.length)
            throw new Error('Admin identity is occupied; refusing takeover or automatic account linking');
        const now = new Date(), hash = await (0, auth_password_js_1.hashFgPassword)(password);
        await tx.insert(schema.user).values({ id: userId, name: 'kingame', email, emailVerified: false, createdAt: now, updatedAt: now });
        await tx.insert(schema.account).values({ id: (0, node_crypto_1.randomUUID)(), accountId: userId, providerId: 'credential', userId, password: hash, createdAt: now, updatedAt: now });
        await tx.insert(schema.verification).values({ id: (0, node_crypto_1.randomUUID)(), identifier: ownerIdentifier, value: binding, expiresAt: new Date('2099-12-31T00:00:00.000Z'), createdAt: now, updatedAt: now });
        return { created: true, verified: false };
    });
}
//# sourceMappingURL=auth-provision.js.map