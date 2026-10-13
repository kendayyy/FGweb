"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureFgHttpBodyParsers = configureFgHttpBodyParsers;
const express_1 = require("express");
function configureFgHttpBodyParsers(app) {
    app.use('/api/media/webhook', (0, express_1.raw)({ type: () => true, limit: '64kb' }));
    const recovery = (0, express_1.json)({ limit: '17mb' });
    app.use('/api/v1/crypto', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    app.use('/api/v1/crypto/recovery', (req, res, next) => req.method === 'PUT' ? recovery(req, res, next) : next());
    app.use(/^\/api\/v1\/crypto\/conversations\/[^/]+\/messages\/?$/, (0, express_1.json)({ limit: '192kb' }));
    app.use('/api/v1/crypto', (0, express_1.json)({ limit: '256kb' }));
    app.use((0, express_1.json)({ limit: '100kb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '100kb' }));
}
//# sourceMappingURL=http-body-parsers.js.map