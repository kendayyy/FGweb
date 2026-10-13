const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
http.createServer((req,res)=>{
  if(req.url !== '/' && req.url !== '/index.html'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fs.readFileSync(path.join(__dirname,'index.html')));
}).listen(4187,'127.0.0.1',()=>console.log('FG 3D preview http://127.0.0.1:4187'));
