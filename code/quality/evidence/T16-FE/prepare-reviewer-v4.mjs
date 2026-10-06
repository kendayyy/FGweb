import fs from 'node:fs';
const dir='quality/evidence/T16-FE';
let source=fs.readFileSync(dir+'/reviewer-presence-v3.test.tsx','utf8').replace('import { AuthProvider }','import { AuthProvider, useAuth, HeaderAuthWidget }');
const cases=`
  it('Codex review v4: failed authentication lookup is not treated as an anonymous guest socket', async()=>{
    let resolveMe;
    const originalFetch=globalThis.fetch;
    vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
      const url=new URL(String(input),'http://localhost');
      if(url.pathname==='/api/v1/me')return new Promise(resolve=>{resolveMe=resolve;});
      return originalFetch(input,init);
    }));
    const Probe=()=>{const auth=useAuth();return <output>{auth.isLoading?'auth:loading':auth.isError?'auth:error':'auth:settled'}</output>;};
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><Probe/><OnlineUsers game={testGames[0]}/></MemoryRouter></AuthProvider></QueryClientProvider>);
    await waitFor(()=>expect(resolveMe).toBeTypeOf('function'));
    expect(screen.getByText('auth:loading')).toBeInTheDocument();
    expect(transport.sockets).toHaveLength(0);
    await act(async()=>resolveMe(new Response(JSON.stringify({message:'Auth lookup unavailable'}),{status:500})));
    await waitFor(()=>expect(screen.getByText('auth:error')).toBeInTheDocument());
    expect(transport.sockets).toHaveLength(0);
  });

  it('Codex review v4: real AuthProvider logout ignores a deferred status save and does not recreate previous actor', async()=>{
    authUser={id:'logout-user',displayName:'Logout User',customStatus:'JUST_CHATTING'};
    let resolveStatus,resolveLogout;
    statusPatchHandler=async()=>new Promise(resolve=>{resolveStatus=resolve;});
    const originalFetch=globalThis.fetch;
    vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
      const url=new URL(String(input),'http://localhost');
      if(url.pathname==='/api/auth/sign-out')return new Promise(resolve=>{resolveLogout=resolve;});
      return originalFetch(input,init);
    }));
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><HeaderAuthWidget/><OnlineUsers game={testGames[0]}/></MemoryRouter></AuthProvider></QueryClientProvider>);
    const select=await screen.findByRole('combobox',{name:/Trạng thái/i});
    await act(async()=>fireEvent.change(select,{target:{value:'PLAYING'}}));
    await waitFor(()=>expect(resolveStatus).toBeTypeOf('function'));
    const oldSockets=[...transport.sockets];
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Đăng xuất'})));
    await waitFor(()=>expect(resolveLogout).toBeTypeOf('function'));
    await waitFor(()=>expect(oldSockets.every(socket=>socket.closed)).toBe(true));
    expect(screen.queryByRole('combobox',{name:/Trạng thái/i})).not.toBeInTheDocument();
    authUser=null;
    await act(async()=>resolveLogout(new Response(JSON.stringify({success:true}),{status:200})));
    await waitFor(()=>expect(client.getQueryData(['auth','me'])).toBeNull());
    await act(async()=>resolveStatus(new Response(JSON.stringify({customStatus:'PLAYING',isOnline:true}),{status:200})));
    expect(client.getQueryData(['auth','me'])).toBeNull();
    expect(screen.queryByRole('combobox',{name:/Trạng thái/i})).not.toBeInTheDocument();
    expect(screen.queryByText('Logout User')).not.toBeInTheDocument();
  });
`;
const end=source.lastIndexOf('});');
fs.writeFileSync(dir+'/reviewer-presence-v4.test.tsx',source.slice(0,end)+cases+source.slice(end));
fs.writeFileSync(dir+'/reviewer-vitest-v4.config.mts',`import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,setupFiles:['E:/FGweb/code/apps/web/test/setup.ts'],include:['E:/FGweb/code/quality/evidence/T16-FE/reviewer-presence-v4.test.tsx']}});
`);
console.log('Two reviewer probes exercise actual AuthProvider error and signOut paths.');
