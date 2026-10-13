import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'file:///C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs';
const source='C:/Users/PC/Downloads/[CITYPNG.COM]HD Dota 2 Official Logo PNG - 4000x4000.png';
const input=fs.readFileSync(source),metadata=await sharp(input).metadata();
const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let transparent=0,partial=0,opaque=0,left=info.width,top=info.height,right=-1,bottom=-1;
const colors=new Map();
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const i=(y*info.width+x)*4,a=data[i+3];
 if(!a)transparent++;else {if(a===255)opaque++;else partial++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(x%100===0&&y%100===0){const c=[...data.subarray(i,i+4)].join(',');colors.set(c,(colors.get(c)??0)+1);}
}
const result={recordedAt:new Date().toISOString(),source,sha256:createHash('sha256').update(input).digest('hex'),metadata,alpha:{transparent,partial,opaque,bounds:{left,top,right,bottom}},sampledColors:[...colors.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12)};
fs.writeFileSync('quality/evidence/GAME-LOGO-FE/dota-input-inspection.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
