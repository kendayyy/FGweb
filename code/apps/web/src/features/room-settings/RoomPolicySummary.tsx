import type {RoomDTO} from '@fg/contracts';
import {Button} from '../../components/ui/Button.js';
export function RoomPolicySummary({room,onOpenSettings}:{room:RoomDTO;onOpenSettings?:()=>void}){
 return <div className="fg-team-policy"><p>{room.settings.invitePolicy==='OWNER_APPROVAL'?'Lời mời cần người nhận đồng ý và người quản lý xét duyệt.':'Thành viên có thể mời trực tiếp; người nhận vẫn cần đồng ý.'}</p>{onOpenSettings&&<Button variant="ghost" onClick={onOpenSettings}>Cài đặt quyền phòng</Button>}</div>;
}
