import {useQueries} from '@tanstack/react-query';
import {fetchPublicProfile} from '../profiles/api.js';
export function useTeamProfiles(actorId:string,userIds:string[],enabled:boolean){
 const ids=[...new Set(userIds)].sort();
 const queries=useQueries({queries:ids.map(id=>({queryKey:['t25',actorId,'public-profile',id],queryFn:({signal}:{signal:AbortSignal})=>fetchPublicProfile(id,signal),enabled,retry:false,staleTime:30000}))});
 return (id:string)=>{const query=queries[ids.indexOf(id)];return {profile:query&&!query.isError?query.data:undefined,failed:Boolean(query?.isError)};};
}
