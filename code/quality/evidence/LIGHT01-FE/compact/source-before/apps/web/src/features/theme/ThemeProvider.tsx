import React, {createContext, useContext, useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {parseTheme, readTheme, resolveTheme, THEME_KEY, type ThemePreference} from './theme.js';

type ThemeContextValue = {preference: ThemePreference; effective: 'light'|'dark'; select: (value: ThemePreference)=>void};
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [preference, setPreference] = useState(readTheme);
  const [media] = useState(()=>typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null);
  const [dark, setDark] = useState(()=>media?.matches??false);
  const effective = resolveTheme(preference, dark);
  useLayoutEffect(()=>{
    document.documentElement.dataset.theme=effective;
    document.documentElement.style.colorScheme=effective;
  },[effective]);
  useEffect(()=>{
    if(!media) return;
    const changed=()=>setDark(media.matches);
    changed();
    if(media.addEventListener) media.addEventListener('change',changed);
    else media.addListener(changed);
    return ()=>{if(media.removeEventListener) media.removeEventListener('change',changed);else media.removeListener(changed);};
  },[media]);
  useEffect(()=>{
    const changed=(event: StorageEvent)=>{
      if(event.key!==THEME_KEY && event.key!==null) return;
      // Storage can be denied; comparing areas must not prevent session-only selection.
      try { if(event.storageArea && event.storageArea!==window.localStorage) return; } catch { return; }
      setPreference(parseTheme(event.key===null?null:event.newValue));
    };
    window.addEventListener('storage',changed);
    return ()=>window.removeEventListener('storage',changed);
  },[]);
  const value=useMemo<ThemeContextValue>(()=>({preference,effective,select:(next)=>{
    setPreference(next);
    try {window.localStorage.setItem(THEME_KEY,next);} catch { /* Keep the in-session choice. */ }
  }}),[preference,effective]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const value=useContext(ThemeContext);if(!value) throw new Error('ThemeProvider required');return value;}
