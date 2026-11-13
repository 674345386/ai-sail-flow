import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { supabase } from '../../auth';
import type { RadarSpaceState } from '../../../shared/radar-space';
import type { AgentMessageImage } from '../../../shared/agent-message';
import type { RadarInput } from '../../../shared/radar';
export const SPACE_API='/api/studio/radar-space/sessions';
export type SpaceSession={id:string;title:string;status:string;updatedAt:string;count:number};
const activeKey='radar-space:active-session';
export function useRadarSpace(){
 const [agent,setAgent]=useState<RadarSpaceState|null>(null),[sessions,setSessions]=useState<SpaceSession[]>([]),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState('');
 const active=useRef(''),alive=useRef(true),lock=useRef(false);
 const receive=(value:RadarSpaceState)=>{if(alive.current&&value.id===active.current)setAgent(value);};
 const select=(value:RadarSpaceState)=>{active.current=value.id;setAgent(value);setConnected(false);setError('');try{localStorage.setItem(activeKey,value.id);}catch{}};
 const reloadSessions=async()=>{const value=await api<SpaceSession[]>(SPACE_API);if(alive.current)setSessions(value);return value;};
 const initialize=async()=>{setLoading(true);setError('');try{const list=await reloadSessions();if(!alive.current)return;let cached='';try{cached=localStorage.getItem(activeKey)||'';}catch{}const id=list.find(s=>s.id===cached)?.id||list[0]?.id;const value=id?await api<RadarSpaceState>(`${SPACE_API}/${id}`):await api<RadarSpaceState>(SPACE_API,{method:'POST'});if(alive.current)select(value);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'研究空间无法打开');}finally{if(alive.current)setLoading(false);}};
 useEffect(()=>{alive.current=true;void initialize();return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!agent?.id)return;const id=agent.id,controller=new AbortController();let closed=false,wake:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  void(async()=>{while(!closed){try{const session=supabase?(await supabase.auth.getSession()).data.session:null;const headers:Record<string,string>={Accept:'text/event-stream'};if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;const response=await fetch(`${SPACE_API}/${id}/events`,{headers,credentials:'same-origin',signal:controller.signal});if(!response.ok||!response.body){await response.body?.cancel();throw new Error('stream');}if(closed){await response.body.cancel();break;}setConnected(true);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';try{while(!closed){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let at;while((at=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);const line=frame.split('\n').find(l=>l.startsWith('data: '));if(line&&!closed){let state:RadarSpaceState;try{state=JSON.parse(line.slice(6));}catch{continue;}receive(state);}}}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}catch{}finally{if(!closed)setConnected(false);}if(!closed)await new Promise<void>(resolve=>{wake=resolve;timer=setTimeout(resolve,2000);});}})();
  return()=>{closed=true;controller.abort();clearTimeout(timer);wake?.();};
 },[agent?.id]);
 const send=async(prompt:string,scope:RadarInput,imageIds:string[]=[],action='research')=>{if(!agent||lock.current||agent.status==='running')return false;lock.current=true;setSending(true);setError('');const id=agent.id;try{const value=await api<RadarSpaceState>(`${SPACE_API}/${id}/turns`,{method:'POST',body:JSON.stringify({prompt,scope,imageIds,action})});receive(value);return true;}catch(e){if(active.current===id)setError(e instanceof Error?e.message:'研究未完成');return false;}finally{lock.current=false;if(alive.current)setSending(false);}};
 const stop=async()=>{if(!agent)return;try{receive(await api<RadarSpaceState>(`${SPACE_API}/${agent.id}/interrupt`,{method:'POST'}));}catch(e){setError(e instanceof Error?e.message:'停止未完成');}};
 const newSession=async()=>{if(lock.current)return;setError('');try{select(await api<RadarSpaceState>(SPACE_API,{method:'POST'}));await reloadSessions();}catch(e){setError(e instanceof Error?e.message:'新建研究失败');}};
 const openSession=async(id:string)=>{try{select(await api<RadarSpaceState>(`${SPACE_API}/${id}`));}catch(e){setError(e instanceof Error?e.message:'研究记录无法打开');}};
 const adoptRun=async(runId:string)=>{if(!agent)return;try{receive(await api<RadarSpaceState>(`${SPACE_API}/${agent.id}/adopt-run`,{method:'POST',body:JSON.stringify({runId})}));}catch(e){setError(e instanceof Error?e.message:'研究记录无法恢复');}};
 const update=async(body:{title?:string;scope?:RadarInput})=>{if(!agent)return;receive(await api<RadarSpaceState>(`${SPACE_API}/${agent.id}`,{method:'PATCH',body:JSON.stringify(body)}));};
 const upload=async(file:File)=>{if(!agent)throw new Error('请先打开研究空间');if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 8 MB 内的 JPG、PNG 或 WebP。');const form=new FormData();form.append('image',file);return api<AgentMessageImage>(`${SPACE_API}/${agent.id}/images`,{method:'POST',body:form});};
 return{agent,sessions,loading,sending,connected,error,setError,send,stop,newSession,openSession,reloadSessions,adoptRun,update,upload,retry:initialize,busy:sending||agent?.status==='running'};
}
