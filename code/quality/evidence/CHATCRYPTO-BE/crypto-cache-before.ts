import type {INestApplication} from '@nestjs/common';
import {json,raw,urlencoded} from 'express';
/** Call before init/listen on an app created with bodyParser:false. */
export function configureFgHttpBodyParsers(app:INestApplication):void{
 app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));
 const recovery=json({limit:'17mb'});
 app.use('/api/v1/crypto/recovery',(req:Parameters<typeof recovery>[0],res:Parameters<typeof recovery>[1],next:Parameters<typeof recovery>[2])=>req.method==='PUT'?recovery(req,res,next):next());
 app.use(/^\/api\/v1\/crypto\/conversations\/[^/]+\/messages\/?$/,json({limit:'192kb'}));
 app.use('/api/v1/crypto',json({limit:'256kb'}));
 app.use(json({limit:'100kb'}));
 app.use(urlencoded({extended:true,limit:'100kb'}));
}
