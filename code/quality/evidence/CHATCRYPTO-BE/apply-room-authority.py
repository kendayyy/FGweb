from pathlib import Path
import datetime
p=Path('apps/api/src/modules/rooms/rooms.service.ts')
s=p.read_text(encoding='utf-8')
a=s.index('  async leaveOrRemoveMember(')
prefix,tail=s[:a],s[a:]
assert tail.count("await client.query('BEGIN');")==2
assert tail.count("await client.query('COMMIT');")==4
tail=tail.replace("await client.query('BEGIN');","await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');")
lines=tail.splitlines(keepends=True)
for i,line in enumerate(lines):
    if "await client.query('COMMIT');" in line:
        indent=line[:len(line)-len(line.lstrip())]
        lines[i]=indent+'await this.checkActorSessionAndBan(client, actorId, sessionId);\n'+line
p.write_text(prefix+''.join(lines),encoding='utf-8',newline='\n')
with Path('../.doc/history.md').open('a',encoding='utf-8',newline='\n') as f:
    f.write('\n- Coding and build 2 — CHATCRYPTO-BE — '+datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')+': roomauthority RED2 ended02:39:17 exit1 SHAaec1296d1ed74da2a3141b7d35f89774cb71078b93c3cc2ac83c09872e2b9a48; all12 genuine failures successfulcommit despiteactualPGepochwait andexpiredsession/latestexternalBAN. FirstPowerShell multilineedit rejectedparser beforeexecution/no mutation. MinimalRooms leave/remove+dissolve owningBEGINexplicitRC and4finalcheckActorSessionAndBan beforecommit via savedscript; othermethods/schema/API unchanged. GREEN1 next/exactnative rollback thenaffectedregression/build/lint/fullaudit. No main/PASS/end.\n')
