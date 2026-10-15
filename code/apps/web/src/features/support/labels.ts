import type {SupportKind,SupportStatus,SupportUserRequest,SupportAdminRequest} from '@fg/contracts';
export const statusLabel:Record<SupportStatus,string>={NEW:'Mới',IN_PROGRESS:'Đang xử lý',RESOLVED:'Đã giải quyết'};
export const kindLabel:Record<SupportKind,string>={CHAT:'Chat hỗ trợ',FEEDBACK:'Góp ý',BUG:'Báo lỗi'};
export type SupportRequest=SupportUserRequest|SupportAdminRequest;
export function supportTime(value:string){return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(value));}
