"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilesExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
let ProfilesExceptionFilter = class ProfilesExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const requestId = request.headers['x-request-id'] ||
            `req_${Math.random().toString(36).substring(2, 10)}`;
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
        }
        if (status >= 500) {
            response.status(500).json({
                statusCode: 500,
                message: 'Internal server error',
                requestId,
            });
            return;
        }
        let code = this.getErrorCodeForStatus(status);
        let message = 'Request failed';
        let details = undefined;
        if (exception instanceof common_1.HttpException) {
            const resBody = exception.getResponse();
            if (typeof resBody === 'object' && resBody !== null) {
                const bodyObj = resBody;
                if (bodyObj.code && typeof bodyObj.code === 'string' && Object.values(contracts_1.ErrorCode).includes(bodyObj.code)) {
                    code = bodyObj.code;
                }
                if (bodyObj.message) {
                    message = Array.isArray(bodyObj.message)
                        ? bodyObj.message.join('; ')
                        : String(bodyObj.message);
                }
                else {
                    message = exception.message;
                }
                if (bodyObj.details && typeof bodyObj.details === 'object') {
                    details = bodyObj.details;
                }
            }
            else if (typeof resBody === 'string') {
                message = resBody;
            }
            else {
                message = exception.message;
            }
        }
        response.status(status).json({
            code,
            message,
            requestId,
            ...(details ? { details } : {}),
        });
    }
    getErrorCodeForStatus(status) {
        switch (status) {
            case 401:
                return contracts_1.ErrorCode.LOGIN_REQUIRED;
            case 403:
                return contracts_1.ErrorCode.FORBIDDEN;
            case 404:
                return contracts_1.ErrorCode.NOT_FOUND;
            case 422:
                return contracts_1.ErrorCode.INVALID_INPUT;
            case 409:
                return contracts_1.ErrorCode.CAPACITY_FULL;
            case 429:
                return contracts_1.ErrorCode.RATE_LIMITED;
            default:
                return contracts_1.ErrorCode.INVALID_INPUT;
        }
    }
};
exports.ProfilesExceptionFilter = ProfilesExceptionFilter;
exports.ProfilesExceptionFilter = ProfilesExceptionFilter = __decorate([
    (0, common_1.Catch)()
], ProfilesExceptionFilter);
//# sourceMappingURL=profiles.exception-filter.js.map