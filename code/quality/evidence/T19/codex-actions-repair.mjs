import fs from 'node:fs';
import assert from 'node:assert/strict';
const f='apps/web/src/features/rooms/RoomsPage.tsx';
let s=fs.readFileSync(f,'utf8');
s=s.replace('useMemo }','useMemo, useRef }');
s=s.replace("import './rooms.css';", "import { registerAuthCleanup } from '../auth/lifecycle.js';\nimport './rooms.css';");
const anchor='  const handleSelectRoom = (id: string) => {';
assert(s.includes(anchor));
s=s.replace(anchor,`  const roomScope = actorUserId + ':' + selectedRoomId;
  const scopeRef = useRef(roomScope);
  scopeRef.current = roomScope;
  const mountedRef = useRef(true);
  const actionControllers = useRef(new Set<AbortController>());
  const isCurrentRoom = () => mountedRef.current && scopeRef.current === roomScope;
  useEffect(() => {
    mountedRef.current = true;
    const abort = () => { mountedRef.current = false; for (const c of actionControllers.current) c.abort(); actionControllers.current.clear(); };
    const unregister = registerAuthCleanup(abort);
    return () => { unregister(); abort(); };
  }, [roomScope]);
  const executeAction = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); actionControllers.current.add(controller);
    try { const result = await operation(controller.signal); if (!isCurrentRoom() || controller.signal.aborted) throw new Error('Đã đổi phòng hoặc phiên làm việc.'); return result; }
    finally { actionControllers.current.delete(controller); }
  };

`+anchor);
const replacements=[
['await createRoom(payload)', 'await executeAction(signal => createRoom(payload, signal))'],
['await updateRoomSettings(roomId, req)', 'await executeAction(signal => updateRoomSettings(roomId, req, signal))'],
['await updateHelperPermissions(roomId, targetUserId, perms)', 'await executeAction(signal => updateHelperPermissions(roomId, targetUserId, perms, signal))'],
['await removeRoomMember(roomId, targetUserId)', 'await executeAction(signal => removeRoomMember(roomId, targetUserId, signal))'],
['await transferRoomOwner(selectedRoomId!, newOwnerId)', 'await executeAction(signal => transferRoomOwner(selectedRoomId!, newOwnerId, signal))'],
['await dissolveRoom(selectedRoomId!)', 'await executeAction(signal => dissolveRoom(selectedRoomId!, signal))'],
['await removeRoomMember(selectedRoomId!, actorUserId)', 'await executeAction(signal => removeRoomMember(selectedRoomId!, actorUserId, signal))']
];
for(const [from,to]of replacements){assert(s.includes(from),from);s=s.replaceAll(from,to);}
s=s.replace(/(await queryClient\.invalidateQueries\([^\n]+\);)/g,'$1\n    if (!isCurrentRoom()) return;');
s=s.replaceAll('setModalError(err instanceof', 'if (isCurrentRoom()) setModalError(err instanceof');
s=s.replaceAll('setIsActionLoading(false);','if (isCurrentRoom()) setIsActionLoading(false);');
s=s.replace("const [modalError,", "const [actionError, setActionError] = useState<string | null>(null);\n  const [modalError,");
s=s.replace('onClick={() => void handleRemoveMember(activeRoom.id, m.userId)}', "onClick={() => { setActionError(null); void handleRemoveMember(activeRoom.id, m.userId).catch(err => { if (isCurrentRoom()) setActionError(err instanceof Error ? err.message : 'Không xóa được thành viên.'); }); }}");
s=s.replace('<main className="fg-rooms-main">', '<main className="fg-rooms-main">\n          {actionError && <Alert type="error" message={actionError} />}');
const old="await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, roomId] });\n    if (!isCurrentRoom()) return;\n  };\n\n  const handleRequestTransferOwner";
assert(s.includes(old));s=s.replace(old,"await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, roomId] });\n    if (!isCurrentRoom()) return;\n    await queryClient.invalidateQueries({ queryKey: ['roomDetail', actorUserId, roomId] });\n    if (!isCurrentRoom()) return;\n    await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });\n    if (!isCurrentRoom()) return;\n  };\n\n  const handleRequestTransferOwner");
s=s.replace("await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, selectedRoomId] });\n    if (!isCurrentRoom()) return;", "await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, selectedRoomId] });\n    if (!isCurrentRoom()) return;\n          await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });\n          if (!isCurrentRoom()) return;");
fs.writeFileSync(f,s);
console.log('T19 mutation lifecycle guarded and member failure surfaced.');
