import fs from 'node:fs';
import assert from 'node:assert/strict';
function replace(file,from,to){let s=fs.readFileSync(file,'utf8');assert(s.includes(from),`${file}: anchor missing`);s=s.replace(from,to);fs.writeFileSync(file,s);}
const auth='apps/web/src/features/auth/AuthFields.tsx';
replace(auth,"import './auth.css';","import {FGLogo} from '../../components/ui/FGLogo.js';\nimport './auth.css';");
replace(auth,'className="fg-auth-logo">FG</Link>','className="fg-auth-logo fg-brand-link" aria-label="FG"><FGLogo size={40} decorative/></Link>');
for(const f of ['apps/web/src/features/onboarding/OnboardingForm.tsx','apps/web/src/features/profiles/ProfileEditor.tsx']){
  replace(f,"import React", "import {GameLogo} from '../../components/ui/GameLogo.js';\nimport React");
  replace(f,'<span>{game}</span>','<GameLogo game={game} decorative/><span>{game}</span>');
}
const css='apps/web/src/features/lobby/lobby.css';
replace(css,'grid-template-columns:208px minmax(0,1fr)','grid-template-columns:72px minmax(0,1fr)');
fs.appendFileSync(css,'\n/* SIDEBAR-COMPACT-APPROVED: fixed rail at every desktop/tablet width. */\n@media(min-width:1024px){.fg-game-sidebar{padding:12px 8px;gap:12px}.fg-game-sidebar .fg-game-name,.fg-game-sidebar .fg-sidebar-footer span{display:none}.fg-game-list{gap:6px}.fg-game-list button{height:46px;min-height:46px;justify-content:center;padding:0}.fg-sidebar-footer a,.fg-sidebar-friends-btn{justify-content:center;min-height:44px;padding:8px!important}.fg-game-sidebar .fg-brand-link{margin-bottom:4px}.fg-game-list button.is-active{background:var(--bg-hover)}.fg-game-sidebar .fg-brand-mark{width:40px;height:40px}}\n');
const html='apps/web/index.html';
replace(html,'    <title>FG</title>','    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n    <link rel="alternate icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />\n    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />\n    <link rel="manifest" href="/manifest.webmanifest" />\n    <meta name="theme-color" content="#1f252c" />\n    <title>FG</title>');
console.log('Owner scope UI integration written; Dota source still pending, no PASS.');
