import fs from 'node:fs';
const source=fs.readFileSync('apps/api/test/invitations.integration.spec.ts','utf8');
let prefix=source.slice(0,source.indexOf(' const post='));
prefix=prefix.replaceAll('T23','T24').replaceAll('t23_','t24_').replaceAll('t23-','t24-');
prefix=prefix.replace('real invitation consent and delegated permissions','real play session lifecycle and roster approval');
prefix=prefix.replace('InvitationSchema,RecruitmentSchema,RoomSchema,RoomSettingsSchema,RoomMemberSchema','RecruitmentSchema,PlaySessionSchema,TeamSnapshotSchema');
fs.writeFileSync('apps/api/test/play-sessions.integration.spec.ts',prefix+fs.readFileSync('quality/evidence/T24/behavior-cases.txt','utf8'));
