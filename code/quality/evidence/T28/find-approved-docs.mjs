import fs from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),sha=value=>createHash('sha256').update(value).digest('hex');
const names=['specSha256','taskSha256'],found={};
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);
for(const path of [...walk('quality/evidence'),...walk('.cache')].filter(path=>/\.md$/.test(path)&&/(spec|task)/i.test(path))){
 const raw=fs.readFileSync(path),text=raw.toString('utf8');
 for(const [transform,content]of Object.entries({raw,lf:Buffer.from(text.replaceAll('\r\n','\n')),crlf:Buffer.from(text.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),date04:Buffer.from(text.replace('Ngày cập nhật: 07/10/2026.','Ngày cập nhật: 04/10/2026.')),date04lf:Buffer.from(text.replace('Ngày cập nhật: 07/10/2026.','Ngày cập nhật: 04/10/2026.').replaceAll('\r\n','\n'))})){
  const digest=sha(content);for(const name of names)if(digest===baseline.hashes[name]&&!found[name]){const destination=`quality/evidence/T28/approved-${name}.md`;fs.writeFileSync(destination,content,{flag:'wx'});found[name]={source:path,transform,destination,sha256:digest};}
 }
 if(names.every(name=>found[name]))break;
}
fs.writeFileSync('quality/evidence/T28/approved-docs-search.json',JSON.stringify({recordedAt:new Date().toISOString(),found},null,2)+'\n');console.log(JSON.stringify({found:Object.keys(found)}));
