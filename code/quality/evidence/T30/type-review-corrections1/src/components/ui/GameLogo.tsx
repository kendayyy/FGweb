import React, {useId, useState} from 'react';
import {createPortal} from 'react-dom';
import type {GameTitle} from '@fg/contracts';
import './brand.css';

// GameTitle is the contract catalogue; assets never determine API IDs or routes.
export const GAME_LOGOS: Record<GameTitle, {light: string | null; dark: string | null; fallback: string}> = {
  'Liên Minh Huyền Thoại': {light:'/game-logos/league-of-legends.png',dark:'/game-logos/league-of-legends.png',fallback:'LM'},
  Valorant: {light:'/game-logos/valorant.png',dark:'/game-logos/valorant.png',fallback:'V'},
  'Teamfight Tactics (TFT)': {light:'/game-logos/tft-light.png',dark:'/game-logos/tft-dark.png',fallback:'TFT'},
  'Dota 2': {light:'/game-logos/dota-2.png',dark:'/game-logos/dota-2.png',fallback:'D2'},
  Roblox: {light:'/game-logos/roblox-black.png',dark:'/game-logos/roblox-white.png',fallback:'R'},
  'Liên Quân Mobile': {light:'/game-logos/lien-quan-mobile.png',dark:'/game-logos/lien-quan-mobile.png',fallback:'LQ'},
  'Free Fire': {light:'/game-logos/free-fire.svg',dark:'/game-logos/free-fire-dark.svg',fallback:'FF'},
};

// Transparent whitespace is framed in CSS; original raster pixels remain unchanged.
const DISPLAY_FRAMES: Record<string, React.CSSProperties> = {
  "/game-logos/dota-2.png": {"width":31.599736668861095,"height":31.599736668861095,"left":-3.720868992758395,"top":-3.8472679394338383},
  "/game-logos/league-of-legends.png": {
    "width": 24.95131086142322,
    "height": 16.179775280898877,
    "left": -0.11235955056179775,
    "top": 4.187265917602996
  },
  "/game-logos/lien-quan-mobile.png": {
    "width": 24,
    "height": 9.090909090909092,
    "left": 0,
    "top": 7.454545454545454
  },
  "/game-logos/roblox-black.png": {
    "width": 24,
    "height": 24,
    "left": 0,
    "top": 0
  },
  "/game-logos/roblox-white.png": {
    "width": 24,
    "height": 24,
    "left": 0,
    "top": 0
  },
  "/game-logos/tft-dark.png": {
    "width": 94.61494796594134,
    "height": 53.22232734153264,
    "left": -35.30747398297067,
    "top": -14.61116367076632
  },
  "/game-logos/tft-light.png": {
    "width": 94.61494796594134,
    "height": 53.22232734153264,
    "left": -35.30747398297067,
    "top": -14.61116367076632
  },
  "/game-logos/valorant.png": {
    "width": 58.394160583941606,
    "height": 32.86131386861314,
    "left": -17.197080291970803,
    "top": -4.430656934306568
  }
};

export function GameLogo({game,decorative=false}: {game:GameTitle;decorative?:boolean}) {
  const asset=GAME_LOGOS[game];
  const [failed,setFailed]=useState<string[]>([]);
  const image=(src:string|null,className:string)=>src&&!failed.includes(src)
    ? <img className={className} src={src} style={DISPLAY_FRAMES[src]} alt="" aria-hidden="true" width={24} height={24} draggable={false} onError={()=>setFailed(previous=>previous.includes(src)?previous:[...previous,src])}/>
    : <span className={`${className} fg-game-logo-fallback`} aria-hidden="true">{asset.fallback}</span>;
  return <span className={`fg-game-logo${game==='Liên Quân Mobile'?' fg-game-logo-plate':''}`} role={decorative?undefined:'img'} aria-label={decorative?undefined:game} aria-hidden={decorative||undefined}>
    {asset.light===asset.dark?image(asset.light,'fg-game-logo-single'):<>{image(asset.light,'fg-game-logo-light')}{image(asset.dark,'fg-game-logo-dark')}</>}
  </span>;
}

export function GameNavButton({game,active,onClick}: {game:GameTitle;active:boolean;onClick:()=>void}) {
  const id=useId();
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[top,setTop]=useState(0);
  const position=(button:HTMLButtonElement)=>setTop(Math.min(button.getBoundingClientRect().top,window.innerHeight-48));
  const shown=hovered||focused;
  return <>
    <button type="button" className={active?'is-active':''} aria-label={game} aria-current={active?'page':undefined} title={game} onClick={onClick}
      onMouseEnter={event=>{position(event.currentTarget);setHovered(true);}} onMouseLeave={()=>setHovered(false)}
      onFocus={event=>{position(event.currentTarget);setFocused(true);}} onBlur={()=>setFocused(false)} onKeyDown={event=>{if(event.key==='Escape'){setHovered(false);setFocused(false);}}} aria-describedby={shown?id:undefined}>
      <GameLogo game={game} decorative/><span className="fg-game-name" aria-hidden="true">{game}</span>
    </button>
    {shown&&createPortal(<span id={id} role="tooltip" className={`fg-game-tooltip ${focused?'is-focused':'is-hover-only'}`} style={{top}}>{game}</span>,document.body)}
  </>;
}
