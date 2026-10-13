import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='quality/evidence/T32',digest=s=>createHash('sha256').update(s).digest('hex'),files=[];
function propose(path,edit){const original=fs.readFileSync(path,'utf8'),next=edit(original);assert.notEqual(original,next);const proposed=dir+'/proposals1/'+path;fs.mkdirSync(proposed.slice(0,proposed.lastIndexOf('/')),{recursive:true});fs.writeFileSync(proposed,next,{flag:'wx'});files.push({path,proposed,beforeSha256:digest(original),afterSha256:digest(next)});}
function replace(s,from,to){assert.equal(s.split(from).length,2,'Unique exact anchor required: '+from);return s.replace(from,()=>to);}
propose('apps/web/src/features/live/LiveViewer.tsx',s=>{
 s=replace(s,"import './live.css';","import {ExternalLivePanel} from './ExternalLivePanel.js';\nimport './live.css';");
 s=replace(s,'export function LiveViewer({ callId, session, participants, controlsTarget }: LiveViewerProps) {','export function LiveViewer({ callId, actorId, session, participants, controlsTarget }: LiveViewerProps) {\n  const [view, setView] = useState<\'screen\' | \'external\'>(\'screen\');\n  const viewRef = useRef<\'screen\' | \'external\'>(\'screen\');\n  const viewTabsRef = useRef<(HTMLButtonElement | null)[]>([]);');
 s=replace(s,'      session.selectScreen(firstSid);',"      if (viewRef.current === 'screen') session.selectScreen(firstSid);");
 s=replace(s,'      session.selectScreen(next);',"      if (viewRef.current === 'screen') session.selectScreen(next);");
 s=replace(s,'    session.selectScreen(sid);',"    if (viewRef.current === 'screen') session.selectScreen(sid);");
 s=replace(s,'  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {',`  const selectView = (next: 'screen' | 'external') => {
    viewRef.current = next;
    session.selectScreen(next === 'screen' ? selectedSidRef.current : null);
    setView(next);
  };
  const handleViewKey = (event: React.KeyboardEvent, index: number) => {
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : ['ArrowRight', 'ArrowLeft'].includes(event.key) ? 1 - index : -1;
    if (target < 0) return;
    event.preventDefault();
    selectView(target === 0 ? 'screen' : 'external');
    viewTabsRef.current[target]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {`);
 s=replace(s,'    <div className="fg-live-viewer">',`    <div className="fg-live-viewer">
      <div role="tablist" aria-label="Chế độ xem live" className="fg-live-selector">
        {(['screen', 'external'] as const).map((mode, index) => <button type="button" key={mode} ref={el => { viewTabsRef.current[index] = el; }} id={idPrefix + '-view-' + mode} className="fg-live-tab" role="tab" aria-selected={view === mode} aria-controls={idPrefix + '-panel-' + mode} tabIndex={view === mode ? 0 : -1} onClick={() => selectView(mode)} onKeyDown={event => handleViewKey(event, index)}>{mode === 'screen' ? 'Màn hình' : 'YouTube–Twitch'}</button>)}
      </div>
      <div hidden={view !== 'screen'} role="tabpanel" id={idPrefix + '-panel-screen'} aria-labelledby={idPrefix + '-view-screen'}>`);
 s=replace(s,'      {controlsTarget ? (',`      </div>
      <div hidden={view !== 'external'} role="tabpanel" id={idPrefix + '-panel-external'} aria-labelledby={idPrefix + '-view-external'}>
        <ExternalLivePanel callId={callId} actorId={actorId} active={view === 'external'} />
      </div>

      {controlsTarget ? (`);
 return s;
});
propose('apps/web/src/features/live/live.css',s=>s+`
/* T32: isolated provider embeds use the approved FG stage and semantic tokens. */
.fg-live-viewer [hidden] { display: none; }
.fg-external-panel, .fg-external-player, .fg-external-form { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.fg-external-stage iframe { width: 100%; height: 100%; border: 0; }
.fg-external-title { margin: 0; color: var(--text-main); font-weight: 500; overflow-wrap: anywhere; }
.fg-external-form label { display: flex; flex-direction: column; gap: 6px; color: var(--text-sub); font-size: 13px; }
.fg-external-form input, .fg-external-form select { width: 100%; min-height: 44px; padding: 8px 12px; background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font: inherit; }
.fg-external-form input:focus-visible, .fg-external-form select:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.fg-external-volume { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--text-sub); font-size: 13px; }
.fg-external-volume input { min-height: 44px; max-width: 160px; accent-color: var(--color-action); }
.fg-external-player .fg-live-tab { text-decoration: none; }
.fg-live-tab:disabled { opacity: .55; cursor: default; }
`);
fs.writeFileSync(dir+'/live-integration-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Approved T32 main view tabs preserve mounted native capture/session and remembered valid SID; source updates cannot resubscribe hidden screen video. Provider scripts remain isolated, root CSP unchanged; semantic styles append only.',files},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({proposed:files.map(f=>f.path),applied:false}));
