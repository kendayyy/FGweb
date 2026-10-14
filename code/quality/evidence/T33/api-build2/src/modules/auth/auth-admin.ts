// Configuration is server-only. Multiple IDs fail closed; the Discord
// identity allowlist is deliberately not a source of website admin grants.
export function soleAdminUserId():string|null{
 const value=(process.env.ADMIN_USER_IDS??'').trim();
 return value&&!value.includes(',')&&!/\s/.test(value)?value:null;
}
export function isReservedAdminName(name:string):boolean{
 return name.normalize('NFKC').trim().toLowerCase()==='kingame';
}
