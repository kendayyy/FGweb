import fs from 'node:fs';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
const {chromium}=await import('@playwright/test');
const browser=await chromium.launch({headless:false});
try{
 const page=await browser.newPage({viewport:{width:1000,height:580}});
 const source='C:/Users/PC/Downloads/[CITYPNG.COM]HD Dota 2 Official Logo PNG - 4000x4000.png';
 const image=fs.readFileSync(source).toString('base64');
 await page.setContent(`<html lang="vi"><title>FG — Kiểm tra nguồn Dota</title><style>body{margin:0;display:flex;font:18px Arial}section{width:50%;height:580px;display:grid;place-content:center;text-align:center;background:#cfd3d6;color:#29323b}section+section{background:#1f252c;color:#e2e7ed}img{width:360px;height:360px;object-fit:contain}</style><section><h1>Nền sáng</h1><img alt="Dota PNG trên nền sáng" src="data:image/png;base64,${image}"></section><section><h1>Nền tối</h1><img alt="Dota PNG trên nền tối" src="data:image/png;base64,${image}"></section></html>`);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:'quality/evidence/GAME-LOGO-FE/dota-input-browser.png'});
 console.log(JSON.stringify({headed:true,actualSourceDecoded:true,sourceUnmodified:true,screenshot:'quality/evidence/GAME-LOGO-FE/dota-input-browser.png'}));
}finally{await browser.close();}
