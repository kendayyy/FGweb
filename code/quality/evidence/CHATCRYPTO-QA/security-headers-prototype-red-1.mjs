import {createHash} from 'node:crypto';

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
  const install=server=>{server.middlewares.use((_request,response,next)=>{
    const end=response.end;
    response.end=function(chunk,encoding,callback){
      const type=String(this.getHeader('Content-Type')??'');
      if(type.toLowerCase().startsWith('text/html')){
        if(this.headersSent)throw new Error('HTML CSP headers must precede body');
        const html=Buffer.isBuffer(chunk)?chunk.toString('utf8'):typeof chunk==='string'?chunk:'';
        if(!html)throw new Error('HTML security boundary requires final body');
        for(const [key,value]of Object.entries(createFgSecurityHeaders(html,connectOrigins)))this.setHeader(key,value);
      }
      return end.call(this,chunk,encoding,callback);
    };
    next();
  });};
  return {name:'fg-security-headers',configureServer:install,configurePreviewServer:install};
}
