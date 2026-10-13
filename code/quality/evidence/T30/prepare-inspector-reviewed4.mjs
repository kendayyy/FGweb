import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import ts from 'typescript';
const d='quality/evidence/T30',h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');
assert.equal(JSON.parse(read(d+'/antigravity-inspector-client-reservation-timer-completion.json')).exitCode,0);
for(const p of JSON.parse(read(d+'/inspector-client-reservation-entry-baseline-1.json')).pins)assert.equal(h(p.path),p.sha256);
const printer=ts.createPrinter(),parse=(p)=>ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const queryArgs=p=>{const tree=parse(p),list=[];function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='query')list.push(n.arguments.map(a=>printer.printNode(ts.EmitHint.Unspecified,a,tree)));ts.forEachChild(n,visit);}visit(tree);return list;};
const imports=p=>parse(p).statements.filter(ts.isImportDeclaration).map(n=>n.moduleSpecifier.text);
const between=(s,a,b)=>{const start=s.indexOf(a);assert(start>=0);const end=s.indexOf(b,start);assert(end>start);return s.slice(start,end);};
const findings=[],variants=[];
for(const [kind,name,base,target]of [['diagnostic','fixture-server-inspector-reserved.mjs','fixture-server-shaped.mjs','fixture-server-inspector-reserved-reviewed.mjs'],['canonical','fixture-server-built-inspector-reserved.mjs','fixture-server-built-runtime-reviewed.mjs','fixture-server-built-inspector-reserved-reviewed.mjs']]){
 const proposal=d+'/antigravity-inspector-client-reservation-timer-1/'+name,previous=d+'/antigravity-inspector-client-reservation-final-1/'+name,baseline=d+'/'+base;
 const source=read(proposal),old=read(previous),original=read(baseline);
 assert.deepEqual(imports(proposal),imports(baseline));assert.deepEqual(queryArgs(proposal),queryArgs(baseline));
 assert.equal(between(source," mark('redis');"," process.send?.({kind:'ready'"),between(original," mark('redis');"," process.send?.({kind:'ready'"));
 assert.equal(between(source,'   const state=','   process.send?.'),between(original,'   const state=','   process.send?.').replaceAll('pool.query','inspectorClient.query'));
 assert.equal((source.match(/new pg\.Pool\(/g)||[]).length,1);assert(source.includes('max:20,connectionTimeoutMillis:5000'));
 assert(source.includes('clearTimeout(endTimer)')||source.includes('clearTimeout(poolEndTimer)'));
 assert(!/pool\._(?:clients|idle)\s*=/.test(source));assert(!source.includes('inspectorClient._ended'));
 assert(source.includes("inspectorClient.on('error'")&&source.includes("inspectorClient.on('end'"));
 assert.equal((source.match(/actualSocketEnded=true/g)||[]).length,1);assert.equal((source.match(/inspectorClient\.query\(/g)||[]).length,3);
 assert(source.includes("from './private-gateway-shaped-fixture.mjs'"));assert(!source.includes('if(fixture.shaperControl)'));
 if(kind==='canonical')assert(!/instrumentOwnedApiPools|startOwnedPgWaitObservation|getOwnedObservationFailures/.test(source));
 const oldBlock=between(old,"  await attempt('poolEnd'"," await attempt('cleanupReport'"),newBlock=between(source,"  await attempt('poolEnd'"," await attempt('cleanupReport'");
 assert.equal(source.replace(newBlock,''),old.replace(oldBlock,''),'Timer proposal must change only poolEnd block');
 const reviewed=d+'/'+target;assert(!fs.existsSync(reviewed));fs.writeFileSync(reviewed,fs.readFileSync(proposal),{flag:'wx'});
 variants.push({kind,baseline:{path:baseline,sha256:h(baseline)},proposal:{path:proposal,sha256:h(proposal)},reviewed:{path:reviewed,sha256:h(reviewed)},exactQueryArgumentsAndOrder:true,apiWebMediaBootstrapBytesUnchanged:true,originalInspectionSqlNativeRpcBytesPreserved:true,singleActualClientNoHeldTransaction:true,onlyPoolEndTimerDeltaFromFinal:true});
}
const p=d+'/inspector-client-reservation-source-review-4.json',r={recordedAt:new Date().toISOString(),reviewer:'Codex',variants,unresolvedSourceFindings:[],syntaxPending:true,actualIdleStateFaultSmokePending:true,adopted:false,nativeAcceptance:false,currentSourceBuildFrozenPinsUnchanged:true};fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n',{flag:'wx'});fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — T30 — inspector source review ${r.recordedAt}: final timer proposal completed; Codex reviewed own client lifetime/end/release/finite diagnostics/driver fallback/independent cleanup and cleared poolEnd timer. AST query arguments/order and exact API/web/media bootstrap/native inspection fragments preserved. Both approved shaped gateway imports retained; canonical no observers. Root-reviewed immutable copies created for actual syntax/idle/state/fault smoke, not adoption/native acceptance yet. Evidence code/${p}; all current app/build9/frontend1/frozen pins/80priorPASS unchanged, IN_PROGRESS/no Anti2/no T31.\n`);console.log(JSON.stringify({variants,unresolvedSourceFindings:[],actualSmokePending:true}));
