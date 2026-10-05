import fs from 'node:fs';
const file='apps/api/src/modules/presence/presence.service.ts';let s=fs.readFileSync(file,'utf8');
s=s.replace("'-inf', now);","'-inf', String(now));"); // ioredis v6 score overload accepts string/Buffer.
const start=s.indexOf('  async getOnlineUsersAll('),end=s.indexOf('  async getCustomStatus(',start);
let legacy=s.slice(start,end);
legacy=legacy.replace('    const cursor = query.cursor;\n','');
legacy=legacy.replace("    if (cursor) {\n      sql += ` AND p.user_id > $2`;\n      params.push(cursor);\n    }\n",'');
s=s.slice(0,start)+legacy+s.slice(end);
fs.writeFileSync(file,s);
fs.writeFileSync('quality/evidence/T16/contract-alignment.md','# Shared contract alignment\n\nNative source build exposed an Antigravity test/producer mismatch: legacy ListOnlineUsersQuery supports limit/gameTitle, not cursor; the new ListGameOnlineUsersQuery expressly supports cursor. Removed unsupported legacy cursor transport and moved the page-two request to the canonical game endpoint. Kept all page size/hasMore/nextCursor/nonduplicate/no-provider-data assertions; legacy bounded endpoint remains tested. No contract/spec edits or weaker pagination assertion. This corrects an invalid test assumption rather than broadening frozen contracts.\n');
