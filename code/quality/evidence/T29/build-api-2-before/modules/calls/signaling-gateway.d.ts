import { type IncomingMessage, type ServerResponse } from 'node:http';
export type GatewayOptions = {
    databaseURL: string;
    upstreamURL: string;
    key: string;
    secret: string;
    origin: string;
};
export declare function createSignalingGateway(options: GatewayOptions): {
    server: import("http").Server<typeof IncomingMessage, typeof ServerResponse>;
    close: () => Promise<void>;
};
