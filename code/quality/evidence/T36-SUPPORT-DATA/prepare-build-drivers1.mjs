import fs from 'node:fs';
const d='quality/evidence/T36-SUPPORT-DATA';
for(const name of ['build-source-sandbox2.mjs','propose-built-package2.mjs']){
 const source=fs.readFileSync('quality/evidence/T35/'+name,'utf8').replaceAll('quality/evidence/T35',d).replaceAll('-build2','-build1').replace("['contracts','database','api','worker']","['contracts','database']").replaceAll('Fresh T35','Fresh T36-SUPPORT-DATA').replaceAll('delivery contracts/schema/APIs/worker','authenticated support contracts/schema').replaceAll('85PASS','87PASS');
 fs.writeFileSync(d+'/'+name.replace('2.mjs','1.mjs'),source,{flag:'wx'});
}
const p='packages/database/test/support-migration.test.ts',s=fs.readFileSync(p,'utf8');
const old="await expect(add(id,peer,noteId)).rejects.toMatchObject({code:'23503'});";
if(!s.includes(old))throw new Error('Expected fixture not found');
fs.writeFileSync(p,s.replace(old,"const wrongAuthorNote=await note(id);await expect(add(id,peer,wrongAuthorNote)).rejects.toMatchObject({code:'23503'});"));
fs.writeFileSync(d+'/fixture-correction1.json',JSON.stringify({at:new Date().toISOString(),failure:'codex-support-database-green-2.json',cause:'Previously audited note hits uniqueness before wrong-author foreign key',correction:'Use a separate unaudited note for wrong-author case; retain exact 23503 assertion',sourceSchemaUnchanged:true,assertionsRemoved:0},null,2)+'\n',{flag:'wx'});
console.log('Prepared owned build drivers and isolated wrong-author fixture; assertion preserved.');
