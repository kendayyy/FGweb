import fs from 'node:fs';import assert from 'node:assert/strict';const dir='quality/evidence/LOADING3D-FE';let source=fs.readFileSync(dir+'/headed-visibility-diagnostic.mjs','utf8');
source="import {launchNaturalChromium} from './natural-chromium.mjs';\n"+source;
source=source.replace('let app, browser, apiBase, uiPage, uiError;','let app, browser, apiBase, uiPage, uiError, naturalBrowser;');
source=source.replace(/browser = await chromium\.launch\([^\n]+\);/, 'naturalBrowser=await launchNaturalChromium(chromium,owned);browser=naturalBrowser.browser;');
source=source.replace("const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });",'const context=naturalBrowser.context;');
source=source.replaceAll('visibility-diagnostic-','natural-visibility-');
source=source.replace('await browser?.close();fs.writeFileSync','await naturalBrowser?.close();await browser?.close();fs.writeFileSync');
source=source.replace("console.log(JSON.stringify({diagnosticOnly:true,observations}));", "assert(observations.some(x=>x.state.hidden),'Natural browser must deliver actual hidden state');console.log(JSON.stringify({diagnosticOnly:true,noDefaults:true,observations}));");
assert(source.includes('naturalBrowser=await'));fs.writeFileSync(dir+'/headed-natural-visibility.mjs',source,{flag:'wx'});console.log('Prepared default-context noDefaults natural headed Chromium diagnostic; dedicated disposable profile and loopback debug port only.');
