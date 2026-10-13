"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
let ChatExceptionFilter = class ChatExceptionFilter {
    catch(error, host) {
        const response = host.switchToHttp().getResponse();
        if (error instanceof common_1.HttpException) {
            const status = error.getStatus();
            const body = error.getResponse();
            const code = status === 401 ? contracts_1.ErrorCode.LOGIN_REQUIRED : status === 404 ? contracts_1.ErrorCode.NOT_FOUND : status === 422 || status === 413 ? contracts_1.ErrorCode.INVALID_INPUT : contracts_1.ErrorCode.FORBIDDEN;
            response.status(status).json({ code, message: 'Request denied', requestId: (0, node_crypto_1.randomUUID)(), ...(typeof body === 'object' ? body : {}) });
        }
        else
            response.status(500).json({ message: 'Internal server error', requestId: (0, node_crypto_1.randomUUID)() });
    }
};
exports.ChatExceptionFilter = ChatExceptionFilter;
exports.ChatExceptionFilter = ChatExceptionFilter = __decorate([
    (0, common_1.Catch)()
], ChatExceptionFilter);
//# sourceMappingURL=chat.exception-filter.js.map