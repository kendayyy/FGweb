import fs from 'node:fs';
const dir='quality/evidence/T16-FE';
const source=fs.readFileSync(dir+'/reviewer-presence.test.tsx','utf8');
const cases=`
  it('Codex review v2: reconnect snapshot is current even when offline event and request share one millisecond', async () => {
    vi.spyOn(Date,'now').mockReturnValue(1791220000000);
    onlineResponses.set('game-lol',async()=>new Response(JSON.stringify({items:[makeProfile('same-ms','Same millisecond user')],hasMore:false}),{status:200}));
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Same millisecond user')).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'same-ms',customStatus:'JUST_CHATTING',isOnline:false}));
    expect(screen.queryByText('Same millisecond user')).not.toBeInTheDocument();
    await act(async()=>{socket.fire('disconnect');socket.fire('connect');});
    await waitFor(()=>expect(screen.getByText('Same millisecond user')).toBeInTheDocument());
  });

  it('Codex review v2: delayed profile hydration cannot revert a newer online status', async () => {
    const resolvers=[];
    profileFetchHandler=async()=>new Promise(resolve=>resolvers.push(resolve));
    renderComponent();
    await waitFor(()=>expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'status-race',customStatus:'PLAYING',isOnline:true}));
    await waitFor(()=>expect(resolvers).toHaveLength(1));
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'status-race',customStatus:'LOOKING_FOR_TEAM',isOnline:true}));
    await waitFor(()=>expect(resolvers).toHaveLength(2));
    await act(async()=>resolvers[1](new Response(JSON.stringify(makeProfile('status-race','Ordered status user')),{status:200})));
    await waitFor(()=>expect(screen.getByText('Ordered status user')).toBeInTheDocument());
    await act(async()=>resolvers[0](new Response(JSON.stringify(makeProfile('status-race','Ordered status user')),{status:200})));
    expect(screen.getByText('Đang tìm đội')).toBeInTheDocument();
    expect(screen.queryByText('Đang chơi')).not.toBeInTheDocument();
  });
`;
const end=source.lastIndexOf('});');
fs.writeFileSync(dir+'/reviewer-presence-v2.test.tsx',source.slice(0,end)+cases+source.slice(end));
fs.writeFileSync(dir+'/reviewer-vitest-v2.config.mts',`import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,setupFiles:['E:/FGweb/code/apps/web/test/setup.ts'],include:['E:/FGweb/code/quality/evidence/T16-FE/reviewer-presence-v2.test.tsx']}});
`);
console.log('Additional reviewer ordering probes prepared; existing evidence preserved.');
