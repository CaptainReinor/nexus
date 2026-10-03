import {z} from './validation';
import {ensureDaily,records,put} from './daily-core';
import {localDay} from './domain';
import type {Snapshot} from './snapshot-sync';
export const focusSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('start'),title:z.string().trim().min(1).max(300),task_id:z.string().uuid().nullable(),mode:z.enum(['stopwatch','interval']),target_seconds:z.number().int().min(60).max(10800)}).strict(),
  z.object({action:z.enum(['pause','resume','finish','discard']),id:z.string().uuid()}).strict()
]);
export type FocusInput=z.infer<typeof focusSchema>;
export type FocusSession={id:string;title:string;task_id:string|null;mode:'stopwatch'|'interval';target_seconds:number;day:string;state:'running'|'paused'|'finished'|'discarded';elapsed_seconds:number;started_at:string;resumed_at:string|null;ended_at:string|null;updated_at:string};
export function focusSeconds(session:FocusSession,now=Date.now()):number{return session.elapsed_seconds+(session.state==='running'&&session.resumed_at?Math.max(0,Math.floor((now-Date.parse(session.resumed_at))/1000)):0);}
export function focusAction(s:Snapshot,input:FocusInput,now=new Date()){ensureDaily(s);const x=focusSchema.parse(input),at=now.toISOString(),list=records(s,'focus_sessions');if(x.action==='start'){if(list.some(r=>r.state==='running'||r.state==='paused'))throw new Error('Сначала заверши текущую сессию.');if(x.task_id&&!records(s,'day_tasks').some(t=>t.id===x.task_id))throw new Error('Дело не найдено.');put(s,'focus_sessions',{id:crypto.randomUUID(),title:x.title,task_id:x.task_id,mode:x.mode,target_seconds:x.target_seconds,day:localDay(now),state:'running',elapsed_seconds:0,started_at:at,resumed_at:at,ended_at:null,updated_at:at});return;}
  const session=list.find(r=>r.id===x.id) as unknown as FocusSession|undefined;if(!session||session.state==='finished'||session.state==='discarded')throw new Error('Сессия уже завершена.');const elapsed=focusSeconds(session,now.getTime());if(x.action==='resume'){if(session.state==='running')return;Object.assign(session,{state:'running',resumed_at:at,updated_at:at});}else if(x.action==='pause'){Object.assign(session,{state:'paused',elapsed_seconds:elapsed,resumed_at:null,updated_at:at});}else Object.assign(session,{state:x.action==='finish'?'finished':'discarded',elapsed_seconds:elapsed,resumed_at:null,ended_at:at,updated_at:at});
}
