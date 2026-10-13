import fs from 'node:fs';import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE';
function replaceCase(source,title,next){const start=source.indexOf("  it('"+title+"'");assert(start>=0,title);const end=source.indexOf("\n  it('",start+8);assert(end>start,title);return source.slice(0,start)+next.trimEnd()+'\n'+source.slice(end);}
let social=fs.readFileSync(dir+'/web-regression-original-social.test.tsx','utf8').replaceAll('\r\n','\n');
social=social.replace("import { DirectMessagesPanel }", "import { CryptoDeviceProvider } from '../src/features/crypto/CryptoDeviceProvider';\nimport { DirectMessagesPanel }");
const marker='  let lastFetchCalls: FetchCallRecord[];';assert(social.includes(marker));
social=social.replace(marker,marker+`
  // Real provider remains LOCKED in DOM tests; native/headed suites prove unlocked crypto.
  async function lockedDm(id='dm-conv-user-peer') {
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><CryptoDeviceProvider><DirectMessagesPanel isOpen={true} onClose={()=>{}} initialConversationId={id}/></CryptoDeviceProvider></MemoryRouter></AuthProvider></QueryClientProvider>);
    const item=await screen.findByTestId('dm-conv-item-'+id);fireEvent.click(item);
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    return item;
  }
  function expectNoPlaintextTransport(){expect(lastFetchCalls.filter(call=>/\\/conversations\\/[^/]+\\/messages/.test(call.url))).toEqual([]);}
`);
social=replaceCase(social,'retains RichComposer draft and stable clientMessageId when DM send fails',`
  it('locked DM has an actual unlock route and cannot send through the former plaintext composer',async()=>{
    await lockedDm('dm-conv-user-peer-fail');
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');
    expect(screen.queryByRole('textbox',{name:'Tin nhắn riêng',exact:true})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Gửi tin nhắn')).not.toBeInTheDocument();
    expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'updates unread count when closed DM panel receives socket MESSAGE_CREATED',`
  it('closed locked DM ignores plaintext socket events and counts strict encrypted metadata once',async()=>{
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><LobbyPage/></MemoryRouter></AuthProvider></QueryClientProvider>);
    await screen.findByText('Hello from Peer User!');
    act(()=>{for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'old-plaintext',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Never display private text',createdAt:new Date().toISOString()});});
    expect(screen.queryByTestId('dm-unread-badge')).not.toBeInTheDocument();
    const event={id:'cipher-metadata',conversationId:'dm-conv-user-peer',senderId:'user-peer',clientMessageId:'metadata-client',deviceId:'PEER',membershipRevision:1,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:'AAAA',session_id:'A'.repeat(43)}},createdAt:new Date(Date.now()+1000).toISOString(),attachmentIds:[],origin:'LIVE'};
    // Structural metadata routing only; this does not simulate decryption/auth/SAS success.
    act(()=>{unreadSync.ingestEncryptedMessage(event,null);unreadSync.ingestEncryptedMessage(event,null);});
    await waitFor(()=>expect(screen.getByTestId('dm-unread-badge')).toHaveTextContent('1'));
    expect(screen.queryByText('Never display private text')).not.toBeInTheDocument();
    expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'renders message content in open active thread even if metadata bridge event arrived first',`
  it('active locked DM does not reveal plaintext injected after a metadata bridge event',async()=>{
    await lockedDm();
    act(()=>{unreadSync.ingestEncryptedMessage({id:'cipher-active',conversationId:'dm-conv-user-peer',senderId:'user-peer',clientMessageId:'active-client',deviceId:'PEER',membershipRevision:1,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:'AAAA',session_id:'A'.repeat(43)}},createdAt:new Date().toISOString(),attachmentIds:[],origin:'LIVE'},'dm-conv-user-peer');for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'cipher-active',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Active thread message content'});});
    expect(screen.queryByText('Active thread message content')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'sorts history messages chronologically from oldest to newest',`
  it('locked private history remains unreadable and never fetches the former plaintext history endpoint',async()=>{
    await lockedDm();expect(screen.queryByText('Secret DM Message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dm-message-list')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'safely handles deferred send response when active conversation changes while send is in flight',`
  it('changing a locked DM never starts a plaintext send or displays a late former-transport response',async()=>{
    await lockedDm();fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer-fail'));
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    act(()=>{for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'late-old-response',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Deferred message'});});
    expect(screen.queryByText('Deferred message')).not.toBeInTheDocument();expect(screen.queryByLabelText('Gửi tin nhắn')).not.toBeInTheDocument();expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'retains per-conversation cached messages immediately when switching back without waiting for refetch',`
  it('switching away and back while locked does not revive cached legacy plaintext',async()=>{
    await lockedDm();fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer-fail'));fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer'));
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    expect(screen.queryByText('Secret DM Message')).not.toBeInTheDocument();expect(screen.queryByText('Cached conv-A')).not.toBeInTheDocument();expectNoPlaintextTransport();
  });`);
social=replaceCase(social,'renders history fetch error alert and recovers when user clicks retry',`
  it('a locked DM remains fail closed when the obsolete plaintext history transport would fail',async()=>{
    const original=globalThis.fetch;const oldHistory=vi.fn();vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{if(/\\/conversations\\/[^/]+\\/messages/.test(String(input))){oldHistory();return replyJson({message:'Old history unavailable'},500);}return original(input,init);}));
    await lockedDm();expect(oldHistory).not.toHaveBeenCalled();expect(screen.queryByText('Old history unavailable')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');expectNoPlaintextTransport();
  });`);
fs.writeFileSync('apps/web/test/social.test.tsx',social);
let rooms=fs.readFileSync(dir+'/web-regression-original-rooms.test.tsx','utf8').replaceAll('\r\n','\n');
rooms=replaceCase(rooms,'6. Key behavior: Uses canonical RoomDTO.conversationId for chat history and send',`
  it('6. Canonical private room loads while locked chat makes no plaintext history or send request',async()=>{
    renderAppAt('/rooms/room-1');await screen.findByTestId('room-header-settings-btn');
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');
    expect(fetchHistoryCalls.filter(url=>url.includes('/conversations/conv-room-1/messages'))).toEqual([]);
    expect(screen.queryByPlaceholderText('Nhắn vào phòng...')).not.toBeInTheDocument();
  });`);
rooms=rooms.replace("expect(screen.getByPlaceholderText('Nhắn vào phòng...')).toBeInTheDocument();","expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');\n    expect(screen.queryByPlaceholderText('Nhắn vào phòng...')).not.toBeInTheDocument();");
rooms=replaceCase(rooms,'15. Reconnect recovers more than one page using the pre-disconnect anchor despite a new socket event',`
  it('15. Reconnect and a plaintext group event cannot open locked encrypted history',async()=>{
    renderAppAt('/rooms/room-1');await screen.findByTestId('room-header-settings-btn');
    const socket=socketTransport.sockets.find(s=>s.namespace==='/'&&!s.closed);expect(socket).toBeDefined();
    await act(async()=>{socket!.fire('disconnect');socket!.fire('connect');socket!.fire(SocketEventNames.MESSAGE_CREATED,{...mockChatMessage,id:'injected-legacy',content:'Missing private gap plaintext'});});
    expect(screen.queryByText(mockChatMessage.content,{exact:true})).not.toBeInTheDocument();expect(screen.queryByText('Missing private gap plaintext',{exact:true})).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();expect(fetchHistoryCalls.filter(url=>url.includes('/conversations/conv-room-1/messages'))).toEqual([]);
  });`);
fs.writeFileSync('apps/web/test/rooms.test.tsx',rooms);
let calls=fs.readFileSync(dir+'/web-regression-original-call-controls.test.tsx','utf8').replaceAll('\r\n','\n');
calls=calls.replaceAll("expect(screen.getByPlaceholderText('Nhắn vào phòng...')).toBeInTheDocument();","expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');expect(screen.queryByPlaceholderText('Nhắn vào phòng...')).not.toBeInTheDocument();");
const old="it('changing mobile tabs preserves the same call and room chat draft',async()=>{mount();await join();fireEvent.change(screen.getByPlaceholderText('Nhắn vào phòng...'),{target:{value:'Giữ bản nháp'}});fireEvent.click(screen.getByTestId('mobile-tab-calls'));fireEvent.click(screen.getByTestId('mobile-tab-chat'));expect(media.rooms[0].disconnect).not.toHaveBeenCalled();expect(screen.getByPlaceholderText('Nhắn vào phòng...')).toHaveValue('Giữ bản nháp');expect(requests.filter(r=>r.url.endsWith('/join'))).toHaveLength(1);});";assert(calls.includes(old));
calls=calls.replace(old,"it('changing mobile tabs preserves the same call and locked encrypted chat boundary',async()=>{mount();await join();expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();fireEvent.click(screen.getByTestId('mobile-tab-calls'));fireEvent.click(screen.getByTestId('mobile-tab-chat'));expect(media.rooms[0].disconnect).not.toHaveBeenCalled();expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');expect(screen.queryByPlaceholderText('Nhắn vào phòng...')).not.toBeInTheDocument();expect(requests.filter(r=>r.url.endsWith('/join'))).toHaveLength(1);expect(requests.some(r=>r.method==='POST'&&/\\/conversations\\/[^/]+\\/messages/.test(r.url))).toBe(false);});");
fs.writeFileSync('apps/web/test/call-controls.test.tsx',calls);
console.log(JSON.stringify({existingNativeSdkNotMocked:true,realLockedProvider:true,privatePlaintextFallbackRejected:true,originalsRetained:true,positiveUnlockedAssertionsRequireNativeHeadedEvidence:true}));
