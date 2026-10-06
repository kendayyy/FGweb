import fs from 'node:fs';
const dir='quality/evidence/T16-FE';
let source=fs.readFileSync('apps/web/test/presence.test.tsx','utf8').replaceAll("'../src/", "'../../../apps/web/src/");
const cases=`
  it('Codex review: an older initial response cannot overwrite the newer subscription refresh', async () => {
    let resolveOld;
    let requests = 0;
    onlineResponses.set('game-lol', async () => {
      requests++;
      if (requests === 1) return new Promise(resolve => { resolveOld = resolve; });
      return new Response(JSON.stringify({items:[makeProfile('fresh-user','Fresh authoritative user')],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText('Fresh authoritative user')).toBeInTheDocument());
    await act(async () => resolveOld(new Response(JSON.stringify({items:[makeProfile('old-user','Old stale user')],hasMore:false}),{status:200})));
    expect(screen.getByText('Fresh authoritative user')).toBeInTheDocument();
    expect(screen.queryByText('Old stale user')).not.toBeInTheDocument();
  });

  it('Codex review: successful status save remains usable when auth refetch confirms a changed value', async () => {
    authUser={id:'status-real-user',displayName:'Status user',customStatus:'JUST_CHATTING'};
    statusPatchHandler=async body => {
      authUser.customStatus=body.customStatus;
      return new Response(JSON.stringify({customStatus:body.customStatus,isOnline:true}),{status:200});
    };
    renderComponent();
    const select=await screen.findByRole('combobox',{name:/Trạng thái/i});
    await act(async () => fireEvent.change(select,{target:{value:'PLAYING'}}));
    await waitFor(() => expect(select).toHaveValue('PLAYING'));
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.queryByText('Đang lưu…')).not.toBeInTheDocument();
  });

  it('Codex review: authoritative reconnect list restores a user after an offline event was followed by missed online event', async () => {
    onlineResponses.set('game-lol',async()=>new Response(JSON.stringify({items:[makeProfile('recovered-user','Recovered user')],hasMore:false}),{status:200}));
    renderComponent();
    await waitFor(() => expect(screen.getByText('Recovered user')).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async () => socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'recovered-user',customStatus:'JUST_CHATTING',isOnline:false}));
    expect(screen.queryByText('Recovered user')).not.toBeInTheDocument();
    await act(async () => {socket.fire('disconnect');socket.fire('connect');});
    await waitFor(() => expect(screen.getByText('Recovered user')).toBeInTheDocument());
  });
`;
const end=source.lastIndexOf('});');
if(end<0)throw new Error('Test describe not found');
fs.writeFileSync(dir+'/reviewer-presence.test.tsx',source.slice(0,end)+cases+source.slice(end));
fs.writeFileSync(dir+'/reviewer-vitest.config.mts',`import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,setupFiles:['E:/FGweb/code/apps/web/test/setup.ts'],include:['E:/FGweb/code/quality/evidence/T16-FE/reviewer-presence.test.tsx']}});
`);
console.log('Prepared three independent reviewer behavior probes, production and task tests unchanged.');
