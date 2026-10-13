import type {Plugin} from 'vite';
export function createFgSecurityHeaders(html:string,connectOrigins?:readonly string[]):Record<string,string>;
export function fgSecurityHeadersPlugin(connectOrigins?:readonly string[]):Plugin;
