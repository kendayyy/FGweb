import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',out=d+'/regressions',h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');fs.mkdirSync(out);const copies=[];
for(const name of ['call-admission','call-gateway','call-controls','publishing','publishing-gateway']){
 const source='apps/api/test/'+name+'.integration.spec.ts',target=out+'/'+name+'.integration.spec.ts';let text=fs.readFileSync(source,'utf8');
 const roots=text.match(/'\.\.\/\.\.\/\.\.\.'/g);assert.equal(roots?.length,1);
 text=text.replace("'../../..'","'../../../..'").replaceAll("from '../src/","from '../../../../apps/api/src/").replaceAll("from './test-cookie-helper.js'","from '../../../../apps/api/test/test-cookie-helper.js'");
 for(const prior of ['T27','T26-FIX1','T29'])text=text.replaceAll('quality/evidence/'+prior+'/private-gateway-fixture.mjs',d+'/private-gateway-fixture.mjs');
 for(const [from,to]of [['t26_admission','t30_reg_admission'],['t26_gateway','t30_reg_gateway'],['t26_controls','t30_reg_controls'],['t29_publishing','t30_reg_publishing'],['t29_gateway','t30_reg_publishing_gateway']])text=text.replaceAll(from,to);
 text=text.replaceAll('__t29_','__t30_reg_').replaceAll('t29-webhook-','t30-reg-webhook-').replaceAll("task:'T29'","task:'T30'");
 fs.writeFileSync(target,text,{flag:'wx'});copies.push({source,sourceSha256:h(source),target,targetSha256:h(target)});
}
fs.writeFileSync(d+'/frozen-regression-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),copies,reason:'Preserve original66 admission/gateway/control/publishing/lifecycle assertions/timeouts. T30-owned copies change only source/root/helper paths, unique disposable schema and UI reporting labels; actual native compiled gateway. Original tests/frozen evidence unchanged. Publishing-gateway includes headed native SDK synthetic canvas regression; does not replace final real getDisplayMedia E2E.',acceptancePending:true},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(d+'/regression-jest.config.cjs',"const path=require('node:path');const root=path.resolve(__dirname,'../../..');const base=require(path.join(root,'apps/api/jest.config.js'));module.exports={...base,rootDir:root,roots:[path.join(__dirname,'regressions')],moduleNameMapper:{...base.moduleNameMapper,'^@fg/database$':'<rootDir>/packages/database/dist/index.js','^@fg/contracts$':'<rootDir>/packages/contracts/dist/index.js'},cacheDirectory:path.join(root,'.cache/t30/jest-regression'),coverageDirectory:path.join(root,'.cache/t30/coverage')};\n",{flag:'wx'});
console.log('Prepared five owned unchanged-assertion regression copies.');
