import fs from 'node:fs';
const dir='quality/evidence/T16-FE',source=fs.readFileSync(dir+'/reviewer-presence-v2.test.tsx','utf8');
const cases=`
  it('Codex review v3: failed older request must not turn a successful newer list into an error', async()=>{
    let rejectOld,requests=0;
    onlineResponses.set('game-lol',async()=>{
      if(++requests===1)return new Promise((_resolve,reject)=>{rejectOld=reject;});
      return new Response(JSON.stringify({items:[makeProfile('good-list','Confirmed list user')],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Confirmed list user')).toBeInTheDocument());
    await act(async()=>rejectOld(new Error('Old request failed after newer success')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed list user')).toBeInTheDocument();
  });

  it('Codex review v3: a snapshot cannot erase an online event received after the request started', async()=>{
    let resolveRefresh,requests=0;
    onlineResponses.set('game-lol',async()=>{
      if(++requests===3)return new Promise(resolve=>{resolveRefresh=resolve;});
      return new Response(JSON.stringify({items:[],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(()=>expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('connect'));
    await waitFor(()=>expect(requests).toBe(3));
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'new-event-user',customStatus:'PLAYING',isOnline:true}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/users/new-event-user/profile'))).toBe(true));
    await act(async()=>{await Promise.resolve();await Promise.resolve();});
    await act(async()=>resolveRefresh(new Response(JSON.stringify({items:[],hasMore:false}),{status:200})));
    await waitFor(()=>expect(screen.getByText('Profile new-event-user')).toBeInTheDocument());
  });
`;
const end=source.lastIndexOf('});');
fs.writeFileSync(dir+'/reviewer-presence-v3.test.tsx',source.slice(0,end)+cases+source.slice(end));
fs.writeFileSync(dir+'/reviewer-vitest-v3.config.mts',`import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,setupFiles:['E:/FGweb/code/apps/web/test/setup.ts'],include:['E:/FGweb/code/quality/evidence/T16-FE/reviewer-presence-v3.test.tsx']}});
`);
console.log('Reviewer v3 adds stale failure and snapshot-versus-online event checks.');
