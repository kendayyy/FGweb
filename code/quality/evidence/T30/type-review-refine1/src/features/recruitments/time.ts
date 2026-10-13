/** HTML datetime-local is displayed in Bangkok regardless of the browser timezone. */
export function bangkokToUTC(local:string):string|undefined {
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);if(!match)return undefined;
 const [year,month,day,hour,minute]=match.slice(1).map(Number);
 if(year<100||month<1||month>12||hour>23||minute>59||day<1||day>31)return undefined;
 const utc=new Date(Date.UTC(year,month-1,day,hour-7,minute));
 const parts=new Date(utc.getTime()+7*3600000);
 if(parts.getUTCFullYear()!==year||parts.getUTCMonth()!==month-1||parts.getUTCDate()!==day)return undefined;
 return utc.toISOString();
}
export function displayBangkok(utc:string){return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(new Date(utc));}
