import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'file:///C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs';
const root='apps/web/public',checks=[];
for(const size of [192,512])for(const kind of ['icon','maskable']){
 const path=`${root}/brand/${kind}-${size}.png`,meta=await sharp(path).metadata();
 assert.equal(meta.width,size);assert.equal(meta.height,size);
 if(kind==='maskable'){
  const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*info.channels;assert.equal(data[i+3],255);if(Math.hypot(x+.5-size/2,y+.5-size/2)>.4*size)assert.deepEqual([...data.subarray(i,i+3)],[31,37,44],`Glyph escapes safe mask circle: ${size}/${x}/${y}`);}
 }
 checks.push(path);
}
const apple=await sharp(`${root}/apple-touch-icon.png`).metadata();assert.equal(apple.width,180);assert.equal(apple.height,180);
const ico=fs.readFileSync(`${root}/favicon.ico`);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
for(const [index,size]of [16,32,48].entries()){const entry=6+16*index;assert.equal(ico[entry],size);assert.equal(ico[entry+1],size);const length=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);const png=await sharp(ico.subarray(offset,offset+length)).metadata();assert.equal(png.width,size);assert.equal(png.height,size);}
const manifest=JSON.parse(fs.readFileSync(`${root}/manifest.webmanifest`));assert.equal(manifest.name,'FG');assert.equal(manifest.icons.length,4);for(const icon of manifest.icons)assert(fs.existsSync(root+icon.src));
for(const file of ['favicon.svg','brand/fg-light.svg','brand/fg-dark.svg','game-logos/free-fire.svg','game-logos/free-fire-dark.svg']){const source=fs.readFileSync(`${root}/${file}`,'utf8');assert(!/<(?:script|foreignObject|image|use)\b|\son\w+\s*=|(?:href|url\()|<!ENTITY/i.test(source));assert(source.includes('<path'));}
const component=fs.readFileSync('apps/web/src/components/ui/FGLogo.tsx','utf8');const glyphs=[...component.matchAll(/d="([^"]+)"/g)].map(m=>m[1]);for(const file of ['brand/fg-light.svg','brand/fg-dark.svg','favicon.svg'])for(const path of glyphs)assert(fs.readFileSync(root+'/'+file,'utf8').includes(`d="${path}"`));
const games=fs.readFileSync('apps/web/src/components/ui/GameLogo.tsx','utf8');assert(!/light:null|dark:null/.test(games),'Incomplete game mapping');
for(const match of games.matchAll(/(?:light|dark):'(\/game-logos\/[^']+)'/g))assert(fs.existsSync(root+match[1]));
const dota=await sharp(`${root}/game-logos/dota-2.png`).metadata(),dotaStats=await sharp(`${root}/game-logos/dota-2.png`).stats();assert(dota.hasAlpha&&!dotaStats.isOpaque,'Dota must have real transparency');
console.log(JSON.stringify({pngSizes:'PASS',opaqueMaskableAnd40PercentSafeCircle:'PASS',ico16_32_48:'PASS',svgSanitization:'PASS',sameFGPaths:'PASS',manifestFiles:'PASS',gameCompleteness:'PASS',dotaRealTransparency:'PASS'}));
