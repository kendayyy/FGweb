import {mkdir, readFile, writeFile, rename, realpath, readdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateDemo, loadDemo} from './demo.mjs';

const defaultRoot = fileURLToPath(new URL('../../', import.meta.url));
async function atomic(file, bytes) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes, {flag:'wx'});
  for (let attempt = 0; ; attempt++) {
    try { await rename(temp, file); return; }
    catch (error) {
      if (!['EPERM','EBUSY'].includes(error.code) || attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
// Call from the actual headed test after each meaningful assertion/action.
// The producer must use synthetic fixtures and explicitly confirm privacy.
export async function captureUiStep(page, options, root = defaultRoot) {
  const {task,runId,step,title,action,result,status = 'RUNNING',startedAt,headed,privacySafe} = options;
  if (headed !== true || privacySafe !== true || !/^[A-Z0-9-]+$/.test(task)
    || !/^[A-Za-z0-9_-]{1,65}$/.test(runId) || !Number.isInteger(step) || step < 1 || step > 99999) throw new Error('Headed/privacy/run metadata required');
  const maskSelectors = options.maskSelectors ?? [];
  if (!Array.isArray(maskSelectors) || maskSelectors.some(s => typeof s !== 'string' || !s || s.length > 500)) throw new Error('Invalid privacy masks');
  const ledger = JSON.parse(await readFile(path.join(root,'quality/tasks.json'),'utf8'));
  if (!ledger.tasks?.some(t => t.id === task && t.status === 'IN_PROGRESS')) throw new Error('UI test task is not active in ledger');
  const observed = new Date().toISOString(), id = `${runId}-step-${String(step).padStart(5,'0')}`;
  const relative = `${task}/demo/${runId}/${id}.png`;
  const template = {id,task,title,headed:true,status,startedAt,completedAt:observed,
    steps:[{action,result,screenshot:relative,sha256:'0'.repeat(64)}]};
  validateDemo(template);
  const evidence = await realpath(path.join(root,'quality/evidence'));
  const images = path.join(evidence,task,'demo',runId), stream = path.join(evidence,'TELEGRAM-BRIDGE-01/demo-stream');
  await mkdir(images,{recursive:true}); await mkdir(stream,{recursive:true});
  for (const dir of [images,stream]) if (!(await realpath(dir)).startsWith(evidence + path.sep)) throw new Error('Demo directory outside evidence');
  const shot = await page.screenshot({type:'png',fullPage:false,mask:[page.locator('input, textarea, [data-demo-private], [data-sensitive], [data-testid*="recovery-code"], [data-testid*="secret"]'),...maskSelectors.map(s => page.locator(s))],maskColor:'#202020'});
  template.steps[0].sha256 = createHash('sha256').update(shot).digest('hex');
  await writeFile(path.join(evidence,relative),shot,{flag:'wx'});
  // Immutable queue entries: never overwrite/relabel an older test observation.
  const event = `${String(Date.parse(observed))}-${id}.json`;
  const published = JSON.stringify({...template,streamEvent:event},null,2);
  await atomic(path.join(stream,event),published);
  await atomic(path.join(evidence,'TELEGRAM-BRIDGE-01/demo-latest.json'),published);
  return {manifest:`TELEGRAM-BRIDGE-01/demo-stream/${event}`,id};
}
export async function drainDemoStream(root, state, persist, deliver) {
  let names;
  try { names = await readdir(path.join(root,'quality/evidence/TELEGRAM-BRIDGE-01/demo-stream')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  state.demoStream ??= {};
  const pending = names.filter(n => /^[A-Za-z0-9_-]+\.json$/.test(n) && !state.demoStream[n]).sort().slice(0,10);
  for (const name of pending) {
    const manifest = `TELEGRAM-BRIDGE-01/demo-stream/${name}`;
    // Validation before journaling/send; malformed producer data never sends.
    try { await loadDemo(root,manifest); }
    catch { state.demoStream[name] = 'invalid'; await persist(); continue; }
    state.demoStream[name] = 'pending'; await persist();
    try { state.demoStream[name] = await deliver(manifest) === 'sent' ? 'sent' : 'uncertain'; }
    catch { state.demoStream[name] = 'uncertain'; }
    await persist();
  }
}
