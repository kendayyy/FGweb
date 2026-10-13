"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const signaling_gateway_js_1 = require("./signaling-gateway.js");
const input = JSON.parse((0, node_fs_1.readFileSync)(process.argv[2], 'utf8'));
if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)
    throw Error('Gateway port required');
const gateway = (0, signaling_gateway_js_1.createSignalingGateway)(input);
gateway.server.listen(input.port, '0.0.0.0', () => console.log('Private media admission gateway ready'));
for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => { void gateway.close().then(() => process.exit(0)); });
//# sourceMappingURL=gateway-main.js.map