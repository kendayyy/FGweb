import React from 'react';
import {describe,it,expect,afterEach,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {GameTitleSchema} from '@fg/contracts';
import {GameLogo,GameNavButton,GAME_LOGOS} from '../src/components/ui/GameLogo.js';
import {FGLogo} from '../src/components/ui/FGLogo.js';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {AuthProvider} from '../src/features/auth/AuthProvider.js';
import {ProfilePage} from '../src/features/profiles/ProfilePage.js';

afterEach(()=>{cleanup();vi.unstubAllGlobals();delete document.documentElement.dataset.theme;});
describe('GAME-LOGO-FE visual identity behavior',()=>{
 it('covers the contract catalogue and never uses remote images',()=>{
  expect(Object.keys(GAME_LOGOS)).toEqual(GameTitleSchema.options);
  for(const asset of Object.values(GAME_LOGOS))for(const src of [asset.light,asset.dark])if(src)expect(src).toMatch(/^\/game-logos\//);
 });
 it('requires a complete approved seven-game asset set before task PASS',()=>{
  expect(Object.entries(GAME_LOGOS).filter(([,asset])=>!asset.light||!asset.dark).map(([name])=>name)).toEqual([]);
 });
 it('keeps a single full accessible name when an image fails',()=>{
  const {container}=render(<GameLogo game="Valorant"/>);
  fireEvent.error(container.querySelector('img')!);
  expect(screen.getByRole('img',{name:'Valorant'})).toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('V')).toBeInTheDocument();
 });
 it('uses light/dark assets tied to application CSS, retaining the component on game updates',()=>{
  const {container,rerender}=render(<GameLogo game="Roblox"/>);
  const original=screen.getByRole('img',{name:'Roblox'});
  expect(container.querySelector('.fg-game-logo-light')).toHaveAttribute('src','/game-logos/roblox-black.png');
  expect(container.querySelector('.fg-game-logo-dark')).toHaveAttribute('src','/game-logos/roblox-white.png');
  rerender(<GameLogo game="Teamfight Tactics (TFT)"/>);
  expect(screen.getByRole('img',{name:'Teamfight Tactics (TFT)'})).toBe(original);
  expect(container.querySelector('.fg-game-logo-light')).toHaveAttribute('src','/game-logos/tft-light.png');
 });
 it('shows the full game tooltip on keyboard focus, Escape dismisses and blur removes it',()=>{
  render(<GameNavButton game="Liên Minh Huyền Thoại" active onClick={()=>{}}/>);
  const button=screen.getByRole('button',{name:'Liên Minh Huyền Thoại'});
  expect(button).toHaveAttribute('aria-current','page');
  fireEvent.focus(button);expect(screen.getByRole('tooltip')).toHaveTextContent('Liên Minh Huyền Thoại');
  expect(button).toHaveAttribute('aria-describedby',screen.getByRole('tooltip').id);
  fireEvent.keyDown(button,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.blur(button);expect(button).not.toHaveAttribute('aria-describedby');
 });
 it('renders approved FG paths once with an accessible name or decorative usage',()=>{
  const {container,rerender}=render(<FGLogo size={40}/>);
  expect(screen.getByRole('img',{name:'FG'})).toHaveAttribute('viewBox','0 0 128 128');
  expect(container.querySelectorAll('path')).toHaveLength(2);
  expect(container.querySelector('text')).toBeNull();
  rerender(<FGLogo decorative/>);expect(screen.queryByRole('img')).toBeNull();
 });
 it('shows the shared game logo in an existing public game profile without altering its name',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
   const path=new URL(String(input),'http://localhost').pathname;
   if(path==='/api/v1/me')return new Response('{}',{status:401});
   if(path==='/api/v1/games')return Response.json([{id:'valorant-id',title:'Valorant',lobbyRoomId:'lobby-id'}]);
   if(path==='/api/v1/users/public-id/profile')return Response.json({id:'public-id',displayName:'Bạn chơi',avatarUrl:null,customStatus:'JUST_CHATTING',createdAt:'2026-10-01T00:00:00Z',gameProfiles:[{gameId:'valorant-id',gameTitle:'Valorant',inGameName:'Bạn#123'}]});
   throw new Error(`Unexpected profile test request: ${path}`);
  });
  try{render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={['/users/public-id']}><Routes><Route path="/users/:id" element={<ProfilePage/>}/></Routes></MemoryRouter></AuthProvider></QueryClientProvider>);
   const heading=await screen.findByRole('heading',{name:'Valorant'});
   expect(heading.querySelector('img')).toHaveAttribute('src','/game-logos/valorant.png');
   expect(await screen.findByText('Bạn#123')).toBeInTheDocument();
  }finally{client.clear();}
 });
});
