import {removeTask} from '../../NEXUS/src/shared/growth';
import {WeekComparison} from '../../NEXUS/src/renderer/components/insights-ui';
import { displayDay } from '../../NEXUS/src/shared/domain';
import { useRef,useState } from 'react';
import { LifeBoard,CoachCard } from '../../NEXUS/src/renderer/components/life-board';
import '../../NEXUS/src/renderer/components/life.css';
import { lifeData,patchDay,updateTask,saveMemory,saveReview } from '../../NEXUS/src/shared/life';
import { weekRange } from '../../NEXUS/src/shared/weekly';
import { aiEnabled,needsBudgetConfirmation,reviewLife,recordUsage } from './ai';
import { today,rows,type Snapshot } from './sync';
type Props={snapshot:Snapshot;commitLatest:(fn:(s:Snapshot)=>void)=>Promise<boolean>};
export function MobileLifeBoard({snapshot,commitLatest}:Props){
  const [day,setDay]=useState(today()),[period,setPeriod]=useState<'previous'|'current'>('current'),[weekly,setWeekly]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const latest=useRef(snapshot);latest.current=snapshot;
  const data=lifeData(snapshot),range=weekRange(period);
  async function change(fn:(s:Snapshot)=>void){if(!await commitLatest(s=>{fn(s);latest.current=structuredClone(s);}))throw new Error('Не удалось сохранить на телефоне. Повторите.');}
  async function review(kind:'day'|'week',start:string,end:string){
    if(!aiEnabled(latest.current))throw new Error('Включите ИИ в настройках.');
    if(needsBudgetConfirmation(latest.current)&&!confirm('Продолжить разбор, несмотря на лимит AI или неизвестную стоимость прошлых запросов?'))return;
    const result=await reviewLife(latest.current,start,end);await change(s=>{saveReview(s,kind,start,end,result.review);recordUsage(s,result.reply,'personal-review',result.model);});
  }
  return <><LifeBoard data={data} day={day} onDay={setDay} onPatch={(date,patch)=>change(s=>patchDay(s,date,patch))} onMarkers={fields=>change(s=>{const list=rows(s,'settings'),row=list.find(x=>x.key==='dailyMarkers');if(row)row.value=JSON.stringify(fields);else list.push({key:'dailyMarkers',value:JSON.stringify(fields)});})} onTask={input=>change(s=>updateTask(s,input))} onMemory={input=>change(s=>{if(!input.id)saveMemory(s,input.text,input.day);else{const row=rows(s,'day_memories').find(x=>x.id===input.id);if(!row)throw new Error('Воспоминание не найдено.');Object.assign(row,{...input,updated_at:new Date().toISOString()});}})} onRemove={(table,id)=>change(s=>{if(table==='day_tasks')removeTask(s,id);else s.tables[table]=rows(s,table).filter(x=>x.id!==id);})} onReview={date=>review('day',date,date)}/>
  <section className="card"><div className="life-subhead"><h2>Неделя с наставником</h2><button className="ghost" onClick={()=>setWeekly(!weekly)}>{weekly?'Свернуть':'Открыть'}</button></div>{weekly&&<><div className="segmented"><button className={period==='previous'?'selected':''} onClick={()=>setPeriod('previous')}>Прошлая</button><button className={period==='current'?'selected':''} onClick={()=>setPeriod('current')}>Текущая</button></div><p className="muted">{displayDay(range.start)} — {displayDay(range.end)}</p><WeekComparison start={range.start} end={range.end}/><button disabled={busy} onClick={()=>{setBusy(true);void review('week',range.start,range.end).then(()=>setMessage('')).catch(error=>setMessage(error instanceof Error?error.message:'Не удалось разобрать неделю.')).finally(()=>setBusy(false));}}>{busy?'Разбираю неделю…':'Разбор недели с ИИ'}</button>{message&&<p role="status">{message}</p>}<CoachCard saved={data.reviews.find(x=>x.kind==='week'&&x.start===range.start&&x.end===range.end)}/></>}</section></>;
}
