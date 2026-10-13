"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_js_1 = require("./app.module.js");
const http_body_parsers_js_1 = require("./modules/chat-crypto/http-body-parsers.js");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_js_1.AppModule, { bodyParser: false });
    (0, http_body_parsers_js_1.configureFgHttpBodyParsers)(app);
    app.enableCors({
        origin: process.env.PUBLIC_ORIGIN || 'http://localhost:5173',
        credentials: true,
    });
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`API Server running on port ${port}`);
}
if (process.env.NODE_ENV !== 'test') {
    bootstrap();
}
//# sourceMappingURL=main.js.map