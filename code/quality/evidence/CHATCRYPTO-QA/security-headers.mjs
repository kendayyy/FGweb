import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function createFgSecurityHeaders(html, connectOrigins=[]) {
  if(typeof html!=='string'||Buffer.byteLength(html)>128*1024)throw new Error('Invalid HTML security boundary');
  const hashes=[];
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/\bsrc\s*=/i.test(match[1]))continue;
    if(match[2].trim())hashes.push("'sha256-"+createHash('sha256').update(match[2].replaceAll('\r\n','\n').replaceAll('\r','\n')).digest('base64')+"'");
  }
  const origins=[...new Set(connectOrigins.map(value=>{
    const url=new URL(value);if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Invalid public connection origin');return url.origin;
  }))];
  return {'Content-Security-Policy':[
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval' "+hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:","font-src 'self'",
    "connect-src 'self' "+origins.join(' '),
    "media-src 'self' blob:","worker-src 'self' blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv",
    "object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'",
  ].join('; '),'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin'};
}

/** Hash the final trusted server HTML, including Vite's own development preamble. */
export function fgSecurityHeadersPlugin(connectOrigins=[]) {
  const install=(server,development)=>{server.middlewares.use(async(request,response,next)=>{
    try{
      const pathname=new URL(request.url??'/','http://fg.invalid').pathname;
      if(!['GET','HEAD'].includes(request.method)||pathname.startsWith('/api/')||pathname.startsWith('/socket.io')||!(pathname==='/'||pathname==='/index.html'||String(request.headers.accept??'').includes('text/html')))return next();
      const root=development?server.config.root:path.resolve(server.config.root,server.config.build.outDir);
      let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
      if(development)html=await server.transformIndexHtml(request.url??'/',html);
      const connections=development?[...connectOrigins,'ws://127.0.0.1:'+server.config.server.port,'ws://localhost:'+server.config.server.port]:connectOrigins;
      response.setHeader('Content-Type','text/html; charset=utf-8');
      for(const [key,value]of Object.entries(createFgSecurityHeaders(html,connections)))response.setHeader(key,value);
      response.statusCode=200;response.end(request.method==='HEAD'?undefined:html);
    }catch(error){next(error);}
  });};
  return {name:'fg-security-headers',configureServer:server=>install(server,true),configurePreviewServer:server=>install(server,false)};
}
