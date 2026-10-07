import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const original=execFileSync('git',['show','HEAD:code/apps/web/src/features/auth/LoginForm.tsx'],{encoding:'utf8'}),index=original.indexOf('const DiscordIcon:');assert(index>0);
fs.writeFileSync('apps/web/src/features/auth/DiscordIcon.tsx',"import React from 'react';\n"+original.slice(index).replace('const DiscordIcon:','export const DiscordIcon:').replace('<svg width=', '<svg aria-hidden="true" width='));
const file='apps/web/src/features/auth/LoginForm.tsx',source=fs.readFileSync(file,'utf8');assert(source.includes('onClick={discord}>Tiếp tục với Discord'));fs.writeFileSync(file,"import {DiscordIcon} from './DiscordIcon.js';\n"+source.replace('onClick={discord}>Tiếp tục với Discord','onClick={discord} leftIcon={<DiscordIcon/>}>Tiếp tục với Discord'));
