import React, {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown, Monitor, Moon, Sun} from 'lucide-react';
import {ClassicIcon} from '../../components/ui/classic.js';
import {useTheme} from './ThemeProvider.js';
import type {ThemePreference} from './theme.js';
import './theme.css';

const choices=[{value:'light',label:'Sáng',icon:Sun},{value:'dark',label:'Tối',icon:Moon},{value:'system',label:'Hệ thống',icon:Monitor}] satisfies {value:ThemePreference;label:string;icon:typeof Sun}[];
export function ThemeSwitcher(){
 const {preference,effective,select}=useTheme();
 const [open,setOpen]=useState(false),[active,setActive]=useState(0);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),items=useRef<(HTMLButtonElement|null)[]>([]),id=useId();
 const label=choices.find(choice=>choice.value===preference)!.label;
 const show=()=>{setActive(choices.findIndex(choice=>choice.value===preference));setOpen(true);};
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
 useEffect(()=>{if(open)items.current[active]?.focus();},[open,active]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 return <div className="fg-theme" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button type="button" className="fg-theme-trigger" ref={trigger} aria-label={`Chế độ màu: ${label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?close():show()} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();show();}if(event.key==='Escape')close(true);}}>
   <ClassicIcon toggled={effective==='dark'}/><span>{label}</span><ChevronDown className="fg-theme-chevron" size={16} aria-hidden="true"/>
  </button>
  {open&&<div id={id} className="fg-theme-menu" role="menu" aria-label="Chế độ màu" onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();setActive(index=>event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowDown'?1:2))%3);}
  }}>{choices.map((choice,index)=><button key={choice.value} type="button" role="menuitemradio" aria-checked={preference===choice.value} tabIndex={active===index?0:-1} ref={node=>{items.current[index]=node;}} onFocus={()=>setActive(index)} onClick={()=>{select(choice.value);close(true);}}><choice.icon size={18} aria-hidden="true"/><span>{choice.label}</span>{preference===choice.value&&<Check className="fg-theme-check" size={18} aria-hidden="true"/>}</button>)}</div>}
 </div>;
}
