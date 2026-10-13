"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.soleAdminUserId = soleAdminUserId;
exports.isReservedAdminName = isReservedAdminName;
function soleAdminUserId() {
    const value = (process.env.ADMIN_USER_IDS ?? '').trim();
    return value && !value.includes(',') && !/\s/.test(value) ? value : null;
}
function isReservedAdminName(name) {
    return name.normalize('NFKC').trim().toLowerCase() === 'kingame';
}
//# sourceMappingURL=auth-admin.js.map