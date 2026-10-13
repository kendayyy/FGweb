import React from 'react';
import {ClassicIcon} from '../../components/ui/classic.js';
import {useTheme} from './ThemeProvider.js';
import './theme.css';

export function ThemeSwitcher(){
 const {effective,select}=useTheme();
 const next=effective==='dark'?'light':'dark';
 const label=next==='light'?'Chuyển sang Sáng':'Chuyển sang Tối';
 return <div className="fg-theme">
  <button type="button" className="fg-theme-trigger" aria-label={label} title={label} onClick={()=>select(next)}>
   <ClassicIcon toggled={effective==='dark'}/>
  </button>
 </div>;
}
