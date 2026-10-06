// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, {useState} from 'react';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ALLOWED_GAMES,GameDTO,MeDTOSchema,PublicRecruitmentDTO,RoomDTO} from '@fg/contracts';
import type {AuthContextType} from '../src/features/auth/AuthProvider.js';
import {RecruitmentPanel} from '../src/features/recruitments/RecruitmentPanel.tsx';
import {AppShell} from '../src/layouts/AppShell.tsx';

const auth=vi.hoisted(()=>({value:{} as AuthContextType}));
vi.mock('../src/features/auth/index.js',()=>({useAuth:()=>auth.value}));
const now='2026-10-06T12:00:00.000Z';
const games:GameDTO[]=ALLOWED_GAMES.map((title,i)=>({id:`17e6cab4-a5eb-47cc-b69f-22158aa2273${i}`,title,lobbyRoomId:`lobby-${i}`}));
const owner=MeDTOSchema.parse({id:'actor',displayName:'Nam',email:'actor@example.test',emailVerified:true,discordId:'123',onboardingComplete:true,interestedGames:[ALLOWED_GAMES[0]],createdAt:now,updatedAt:now});
let rooms:RoomDTO[],cards:PublicRecruitmentDTO[],posts:Array<Record<string,unknown>>,failure:number,privateOnRead:boolean;
let page2:RoomDTO[];let suggestionsFailure:boolean;let lastCreateSignal:AbortSignal|null|undefined;
let malformed:boolean;let memberRole:'MEMBER'|'HELPER';let permissions:string[];
const room=(id:string,visibility:'PUBLIC'|'PRIVATE'='PUBLIC'):RoomDTO=>({id,conversationId:`conv-${id}`,name:id,gameId:games[0].id,gameTitle:games[0].title,ownerId:owner.id,memberCount:1,settings:{visibility,invitePolicy:'OWNER_APPROVAL',playerCapacity:5},createdAt:now,updatedAt:now});
const card=(game=games[0]):PublicRecruitmentDTO=>({id:'recruitment',roomId:'public',gameId:game.id,gameTitle:game.title,title:'Cần một bạn cùng chơi',mode:'flex',playerCapacity:5,currentPlayers:4,timingType:'now',state:'OPEN',visibility:'PUBLIC',requirementText:'Kim cương tham khảo',createdAt:now,updatedAt:now});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let client:QueryClient;
const bodyMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(String(input),'http://localhost'),method=init?.method??'GET';
 if(method==='POST'&&url.pathname==='/api/v1/recruitments') {
  const data=JSON.parse(String(init?.body)) as Record<string,unknown>;posts.push(data);lastCreateSignal=init?.signal;
  if(failure)return json({code:'ACTIVE_PLAY_CONFLICT',message:'occupied'},failure);
  return json({...card(games.find(g=>g.id===data.gameId)),...data,id:'created',roomId:data.roomId??'new-room',currentPlayers:1,createdAt:now,updatedAt:now,state:'OPEN'},201);
 }
 if(url.pathname.includes('/recruitments/suggestions'))return suggestionsFailure?json({message:'unavailable'},503):json({items:cards.filter(c=>c.currentPlayers<c.playerCapacity),hasMore:false});
 if(url.pathname.includes('/recruitments'))return json({items:malformed?[{...card(),visibility:'PRIVATE'}]:cards.filter(c=>c.gameId===url.pathname.split('/')[4] || url.pathname==='/api/v1/recruitments'),hasMore:false});
 if(url.pathname==='/api/v1/rooms/own')return json({items:url.searchParams.get('cursor')?page2:rooms,hasMore:!url.searchParams.has('cursor')&&page2.length>0,...(!url.searchParams.has('cursor')&&page2.length>0?{nextCursor:'next'}:{})});
 const id=url.pathname.split('/')[4];
 if(url.pathname.endsWith('/members'))return json([{roomId:id,userId:owner.id,role:memberRole,permissions,joinedAt:now}]);
 if(url.pathname.startsWith('/api/v1/rooms/')) {const r=[...rooms,...page2].find(r=>r.id===id);return r?json(privateOnRead?{...r,settings:{...r.settings,visibility:'PRIVATE'}}:r):json({},404);}
 throw new Error(`Unexpected test transport: ${method} ${url.pathname}`);
});
const originalTransport=bodyMock.getMockImplementation()!;
function mount(game=games[0],node?:React.ReactNode) {
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false}}});
 return render(<QueryClientProvider client={client}><MemoryRouter>{node??<RecruitmentPanel key={`${game.id}:${auth.value.user?.id}`} game={game}/>}</MemoryRouter></QueryClientProvider>);
}
async function open(){fireEvent.click(await screen.findByRole('button',{name:'Tạo đội'}));await screen.findByLabelText('Tiêu đề đội');}
async function fill(){fireEvent.change(screen.getByLabelText('Tiêu đề đội'),{target:{value:'Đội cuối tuần'}});fireEvent.change(screen.getByLabelText('Chế độ chơi'),{target:{value:'flex'}});}
async function submit(){fireEvent.click(screen.getByRole('button',{name:'Đăng thẻ tuyển'}));}
beforeEach(()=>{
 auth.value={user:owner,isLoading:false,isError:false,error:null,isSigningOut:false,signIn:vi.fn(async()=>{}),signOut:vi.fn(async()=>{}),refetchUser:vi.fn(async()=>{})};
 rooms=[room('public'),room('private','PRIVATE')];page2=[];cards=[card()];posts=[];failure=0;privateOnRead=false;suggestionsFailure=false;lastCreateSignal=null;malformed=false;memberRole='MEMBER';permissions=[];bodyMock.mockReset().mockImplementation(originalTransport);vi.stubGlobal('fetch',bodyMock);
});
afterEach(()=>{client?.clear();vi.unstubAllGlobals();});

describe('T21 recruitment frontend contracts and interactions',()=>{
 it('guests discover real-shaped public cards but must log in before creating',async()=>{
  auth.value.user=null;mount();await screen.findByText('Cần một bạn cùng chơi');expect(screen.getByRole('link',{name:'Đăng nhập Discord'})).toHaveAttribute('href','/login');expect(screen.queryByRole('button',{name:'Tạo đội'})).not.toBeInTheDocument();expect(posts).toEqual([]);
 });
 it('creates with actual selected game ID/free-text mode and does not enforce rank',async()=>{
  mount();await open();await fill();expect(await within(screen.getByRole('region',{name:'Gợi ý đội'})).findByText('Kim cương tham khảo')).toBeInTheDocument();await submit();await waitFor(()=>expect(posts).toHaveLength(1));expect(posts[0]).toMatchObject({gameId:games[0].id,gameTitle:games[0].title,title:'Đội cuối tuần',mode:'flex',timingType:'now',playerCapacity:5});expect(screen.queryByLabelText('Rank bắt buộc')).not.toBeInTheDocument();await screen.findByText('Đã tạo đội.');
 });
 it('Roblox requires experience name and HTTPS Roblox URL, other games do not render these fields',async()=>{
  mount(games[4]);await open();await fill();await submit();expect(posts).toHaveLength(0);expect(screen.getByLabelText('Tên experience')).toHaveAttribute('aria-invalid','true');fireEvent.change(screen.getByLabelText('Tên experience'),{target:{value:'Blox Fruits'}});fireEvent.change(screen.getByLabelText('Link experience'),{target:{value:'http://example.test/game'}});await submit();expect(posts).toHaveLength(0);fireEvent.change(screen.getByLabelText('Link experience'),{target:{value:'https://www.roblox.com/games/2753915549/Blox-Fruits'}});await submit();await waitFor(()=>expect(posts).toHaveLength(1));expect(posts[0].experienceName).toBe('Blox Fruits');expect(posts[0].gameId).toBe(games[4].id);
 });
 it('converts a Bangkok date/time to UTC and formats the future schedule without host timezone assumptions',async()=>{
  mount();await open();await fill();fireEvent.click(screen.getByRole('radio',{name:'Hẹn giờ'}));fireEvent.change(screen.getByLabelText('Giờ hẹn (Asia/Bangkok)'),{target:{value:'2099-01-02T20:30'}});await submit();await waitFor(()=>expect(posts).toHaveLength(1));expect(posts[0]).toMatchObject({timingType:'scheduledAt',scheduledAt:'2099-01-02T13:30:00.000Z'});
 });
 it('rejects past scheduled time and focuses a linked error summary without losing form input',async()=>{
  mount();await open();await fill();fireEvent.click(screen.getByRole('radio',{name:'Hẹn giờ'}));fireEvent.change(screen.getByLabelText('Giờ hẹn (Asia/Bangkok)'),{target:{value:'2000-01-02T20:30'}});await submit();expect(posts).toHaveLength(0);expect(screen.getByLabelText('Tiêu đề đội')).toHaveValue('Đội cuối tuần');expect(screen.getByRole('alert')).toHaveFocus();expect(screen.getByRole('link',{name:/Giờ hẹn/})).toHaveAttribute('href',expect.stringContaining('#'));
 });
 it('shows private rooms as unavailable and validates a previously public selection again before POST',async()=>{
  mount();await open();await fill();const option=await screen.findByRole('option',{name:/private.*riêng tư/});expect(option).toBeDisabled();fireEvent.change(screen.getByLabelText('Phòng sử dụng'),{target:{value:'public'}});privateOnRead=true;await submit();await screen.findByText(/Phòng đã chuyển riêng tư/);expect(posts).toHaveLength(0);
 });
 it('loads all persistent room pages rather than silently truncating the selector',async()=>{
  rooms=[room('first')];page2=[room('last')];mount();await open();expect(await screen.findByRole('option',{name:'last'})).toBeInTheDocument();await fill();fireEvent.change(screen.getByLabelText('Phòng sử dụng'),{target:{value:'last'}});await submit();await waitFor(()=>expect(posts[0]?.roomId).toBe('last'));
 });
 it('a suggestions transport failure does not invent success or prevent an otherwise valid creation',async()=>{
  suggestionsFailure=true;mount();await open();await fill();await screen.findByText(/Không tải được gợi ý/);await submit();await waitFor(()=>expect(posts).toHaveLength(1));
 });
 it('occupied409 retains input and retries with the same idempotency key',async()=>{
  failure=409;mount();await open();await fill();await submit();await screen.findByText(/đội chơi ngay/);expect(screen.queryByText('Đã tạo đội.')).not.toBeInTheDocument();expect(screen.getByLabelText('Tiêu đề đội')).toHaveValue('Đội cuối tuần');failure=0;await submit();await waitFor(()=>expect(posts).toHaveLength(2));expect(posts[0].idempotencyKey).toBe(posts[1].idempotencyKey);
 });
 it('full cards show a truthful capacity state',async()=>{
  cards=[{...card(),currentPlayers:5}];mount();await screen.findByText('Đã đủ người');expect(screen.queryByText(/Còn 0/)).not.toBeInTheDocument();
 });
 it.each(games)('uses game-specific fields without inventing identifiers for $title',async(game)=>{
  mount(game);await open();await fill();expect(screen.getByRole('heading',{name:`Tạo đội · ${game.title}`})).toBeInTheDocument();
  if(game.title==='Roblox'){fireEvent.change(screen.getByLabelText('Tên experience'),{target:{value:'Blox Fruits'}});fireEvent.change(screen.getByLabelText('Link experience'),{target:{value:'https://www.roblox.com/games/2753915549/Blox-Fruits'}});}
  else expect(screen.queryByLabelText('Tên experience')).not.toBeInTheDocument();
  await submit();await waitFor(()=>expect(posts).toHaveLength(1));expect(posts[0].gameId).toBe(game.id);expect(posts[0].gameTitle).toBe(game.title);
 });
 it('sends exact mode and timing filters to the selected game endpoint',async()=>{
  mount(games[1]);await screen.findByLabelText('Lọc chế độ');fireEvent.change(screen.getByLabelText('Lọc chế độ'),{target:{value:'ranked'}});fireEvent.change(screen.getByLabelText('Thời gian'),{target:{value:'scheduledAt'}});
  await waitFor(()=>expect(bodyMock.mock.calls.some(([url])=>{const u=new URL(String(url),'http://localhost');return u.pathname===`/api/v1/games/${games[1].id}/recruitments`&&u.searchParams.get('mode')==='ranked'&&u.searchParams.get('timingType')==='scheduledAt';})).toBe(true));
 });
 it('empty responses show empty state rather than illustrative teams',async()=>{
  cards=[];mount();await screen.findByText(/Chưa có đội tuyển phù hợp/);expect(screen.queryByRole('article')).not.toBeInTheDocument();
 });
 it('malformed/private response data is rejected rather than rendered as public cards',async()=>{
  malformed=true;mount();await screen.findByText(/Không tải được thẻ tuyển/);expect(screen.queryByText('Cần một bạn cùng chơi')).not.toBeInTheDocument();
 });
 it('does not render unsafe links from unexpected Roblox response data',async()=>{
  cards=[{...card(games[4]),experienceName:'Example',experienceUrl:'https://untrusted.example.test/game'}];mount(games[4]);await screen.findByText(/Không tải được thẻ tuyển/);expect(screen.queryByText(/Experience: Example/)).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'Mở Roblox'})).not.toBeInTheDocument();
 });
 it('an ordinary member cannot create using a room owned by someone else',async()=>{
  rooms=[{...room('public'),ownerId:'another-owner'}];mount();await open();await fill();fireEvent.change(await screen.findByLabelText('Phòng sử dụng'),{target:{value:'public'}});await submit();await screen.findByText(/Bạn cần quyền tuyển đội/);expect(posts).toHaveLength(0);
 });
 it('a helper is permitted only after fresh MANAGE_RECRUITMENT membership validation',async()=>{
  rooms=[{...room('public'),ownerId:'another-owner'}];memberRole='HELPER';permissions=['MANAGE_RECRUITMENT'];mount();await open();await fill();fireEvent.change(await screen.findByLabelText('Phòng sử dụng'),{target:{value:'public'}});await submit();await waitFor(()=>expect(posts[0]?.roomId).toBe('public'));
  expect(bodyMock.mock.calls.some(([url])=>String(url).endsWith('/rooms/public/members'))).toBe(true);
 });
 it('phone panel switching preserves the mounted chat draft',async()=>{
  function Harness(){const [teams,setTeams]=useState(false);return <AppShell showTeams={teams} navigation={null} header={null} chat={<textarea aria-label="Chat draft" defaultValue=""/>} panel={<RecruitmentPanel game={games[0]}/>} mobileTabs={<button onClick={()=>setTeams(!teams)}>Đổi tab</button>} bottomNavigation={null}/>;}
  const view=mount(games[0],<Harness/>);await screen.findByText('Cần một bạn cùng chơi');const chat=screen.getByLabelText('Chat draft');fireEvent.change(chat,{target:{value:'Tin nhắn chưa gửi'}});fireEvent.click(screen.getByRole('button',{name:'Đổi tab'}));expect(view.container.querySelector('.fg-lobby-teams-active')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'Đổi tab'}));expect(screen.getByLabelText('Chat draft')).toBe(chat);expect(chat).toHaveValue('Tin nhắn chưa gửi');
 });
 it('aborts an in-flight POST when the game panel is removed',async()=>{
  bodyMock.mockImplementationOnce(async()=>json({items:cards,hasMore:false}));
  const view=mount();await open();await fill();
  const original=bodyMock.getMockImplementation()!;bodyMock.mockImplementation(async(input,init)=>{if(init?.method==='POST'){lastCreateSignal=init.signal;return new Promise<Response>((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}return original(input,init);});
  await submit();await waitFor(()=>expect(lastCreateSignal).not.toBeNull());view.unmount();expect(lastCreateSignal?.aborted).toBe(true);
 });
 it('game switching aborts the old creation and ignores a late response',async()=>{
  const view=mount();await open();await fill();let resolve!:(response:Response)=>void;
  bodyMock.mockImplementation(async(input,init)=>{if(init?.method==='POST'){lastCreateSignal=init.signal;return new Promise<Response>(done=>{resolve=done;});}return originalTransport(input,init);});
  await submit();await waitFor(()=>expect(lastCreateSignal).not.toBeNull());
  view.rerender(<QueryClientProvider client={client}><MemoryRouter><RecruitmentPanel game={games[1]}/></MemoryRouter></QueryClientProvider>);
  expect(lastCreateSignal?.aborted).toBe(true);resolve(json({...card(),id:'late'},201));
  await screen.findByRole('region',{name:`Tìm đội ${games[1].title}`});expect(screen.queryByText('Đã tạo đội.')).not.toBeInTheDocument();expect(screen.queryByLabelText('Tiêu đề đội')).not.toBeInTheDocument();
 });
});
