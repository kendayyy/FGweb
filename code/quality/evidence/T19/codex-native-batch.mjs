import {spawnSync} from 'node:child_process';
for(const name of ['dialog','pagination','mobile-tabs','private','management','helper-inline','ended','create','reconnect','revoke-reconnect']) {
 const result=spawnSync(process.execPath,['quality/evidence/T19/record-check.mjs',`codex-native-${name}-final-3`,process.execPath,`quality/evidence/T19/native-${name}.mjs`],{stdio:'inherit'});
 if(result.status!==0) {process.exitCode=result.status??1;break;}
}
