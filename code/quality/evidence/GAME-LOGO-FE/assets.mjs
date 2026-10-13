import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'file:///C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs';
const out='apps/web/public',dir='quality/evidence/GAME-LOGO-FE';
const digest=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(`${out}/game-logos`,{recursive:true});fs.mkdirSync(`${out}/brand`,{recursive:true});
const files=['league-of-legends.png','valorant.png','tft-light.png','tft-dark.png','roblox-black.png','roblox-white.png','lien-quan-mobile.png'];
const provenance=[];
for(const file of files){
 const source=`../.doc/game-logos/${file}`,input=fs.readFileSync(source);
 const encoded=await sharp(input).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
 const output=encoded.length<input.length?encoded:input;
 const original=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const optimized=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.deepEqual(optimized.info,original.info);assert.equal(digest(optimized.data),digest(original.data),'Lossless encoding must preserve every pixel');
 fs.writeFileSync(`${out}/game-logos/${file}`,output);
 provenance.push({source,target:`${out}/game-logos/${file}`,sourceSha256:digest(input),targetSha256:digest(output),sourceBytes:input.length,targetBytes:output.length,pixelsUnchanged:true});
}
const originalSvg=fs.readFileSync('../.doc/game-logos/free-fire.svg','utf8');
assert(!/<(?:script|foreignObject|image|use)\b|\son\w+\s*=|(?:href|url\()|<!ENTITY/i.test(originalSvg),'Only local vector paths may ship');
const paths=[...originalSvg.matchAll(/<path\s+d="([^"]+)"/g)].map(match=>match[1]);assert.equal(paths.length,2);
const ff=fill=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 571.54 485.99" fill="${fill}">${paths.map(d=>`<path d="${d}"/>`).join('')}</svg>\n`;
fs.writeFileSync(`${out}/game-logos/free-fire.svg`,ff('#000000'));fs.writeFileSync(`${out}/game-logos/free-fire-dark.svg`,ff('#ffffff'));
provenance.push({source:'../.doc/game-logos/free-fire.svg',sourceSha256:digest(originalSvg),targets:['free-fire.svg','free-fire-dark.svg'],sanitization:'Only original viewBox and two original path d values; explicit black/white contrasting variants'});
const component=fs.readFileSync('apps/web/src/components/ui/FGLogo.tsx','utf8');
const brandPaths=[...component.matchAll(/<path className="fg-brand-([fg])" d="([^"]+)"/g)];assert.equal(brandPaths.length,2);
const glyph=light=>brandPaths.map(match=>`<path fill="${match[1]==='g'?'#3b7cfa':light?'#29323b':'#e2e7ed'}" d="${match[2]}"/>`).join('');
const svg=(light=false,padding=.1,background=false)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${background?'<rect width="128" height="128" rx="20" fill="#1f252c"/>':''}<g transform="translate(${128*padding} ${128*padding}) scale(${1-2*padding})">${glyph(light)}</g></svg>\n`;
fs.writeFileSync(`${out}/brand/fg-dark.svg`,svg());fs.writeFileSync(`${out}/brand/fg-light.svg`,svg(true));
fs.writeFileSync(`${out}/favicon.svg`,svg(false,.08,true));
for(const size of [192,512]){
 await sharp(Buffer.from(svg(false,.1,true))).resize(size,size).png().toFile(`${out}/brand/icon-${size}.png`);
 // 56% glyph square: maximum radius is 39.6%, inside the mandated 40% circle.
 const maskable=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#1f252c"/><g transform="translate(28.16 28.16) scale(.56)">${glyph(false)}</g></svg>`;
 await sharp(Buffer.from(maskable)).resize(size,size).png().toFile(`${out}/brand/maskable-${size}.png`);
}
await sharp(Buffer.from(svg(false,.12,true))).resize(180,180).png().toFile(`${out}/apple-touch-icon.png`);
const icoImages=[];for(const size of [16,32,48])icoImages.push({size,data:await sharp(Buffer.from(svg(false,.05,true))).resize(size,size).png().toBuffer()});
const header=Buffer.alloc(6+16*icoImages.length);header.writeUInt16LE(1,2);header.writeUInt16LE(icoImages.length,4);let offset=header.length;
for(const [i,item]of icoImages.entries()){const pos=6+i*16;header[pos]=item.size;header[pos+1]=item.size;header.writeUInt16LE(1,pos+4);header.writeUInt16LE(32,pos+6);header.writeUInt32LE(item.data.length,pos+8);header.writeUInt32LE(offset,pos+12);offset+=item.data.length;}
fs.writeFileSync(`${out}/favicon.ico`,Buffer.concat([header,...icoImages.map(i=>i.data)]));
fs.writeFileSync(`${out}/manifest.webmanifest`,JSON.stringify({id:'/',name:'FG',short_name:'FG',lang:'vi',start_url:'/',scope:'/',display:'standalone',background_color:'#1f252c',theme_color:'#1f252c',icons:[...['any','maskable'].flatMap(purpose=>[192,512].map(size=>({src:`/brand/${purpose==='any'?'icon':'maskable'}-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose})))]},null,2)+'\n');
const reviewSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 960 240"><rect width="480" height="240" fill="#d8dce0"/><rect x="480" width="480" height="240" fill="#1f252c"/>${[true,false].flatMap((light,index)=>[16,24,32,40].map((size,i)=>`<g transform="translate(${40+index*480+i*105} 80) scale(${size/128})">${glyph(light)}</g><text x="${40+index*480+i*105}" y="170" font-family="Arial" font-size="16" fill="${light?'#29323b':'#e2e7ed'}">${size}px</text>`)).join('')}</svg>`;
await sharp(Buffer.from(reviewSvg)).png().toFile(`${dir}/brand-sizes.png`);
fs.writeFileSync(`${dir}/asset-provenance.json`,JSON.stringify({recordedAt:new Date().toISOString(),provenance,fgApproval:'../.doc/mockups/fg-logo-concepts/01-monogram.png',fgPathsSource:'apps/web/src/components/ui/FGLogo.tsx',maskableGlyphExtent:.56,missing:['Dota 2 transparent asset'],status:'PARTIAL'},null,2)+'\n');
console.log(JSON.stringify({localGameTitles:6,rasterPixelsPreserved:true,fgIconsExported:9,missing:'Dota 2'}));
