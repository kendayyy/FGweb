import fs from 'node:fs';
import sharp from 'file:///C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs';
const frames={};
for(const file of fs.readdirSync('apps/web/public/game-logos').filter(p=>p.endsWith('.png'))){
 const {data,info}=await sharp(`apps/web/public/game-logos/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 const width=right-left+1,height=bottom-top+1,scale=24/Math.max(width,height);
 frames[`/game-logos/${file}`]={width:info.width*scale,height:info.height*scale,left:(24-width*scale)/2-left*scale,top:(24-height*scale)/2-top*scale};
}
fs.writeFileSync('quality/evidence/GAME-LOGO-FE/display-frames.json',JSON.stringify(frames,null,2)+'\n');
console.log(JSON.stringify(frames));
