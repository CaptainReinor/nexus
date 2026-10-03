import { askConfirm } from '../confirm';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBoard } from '../components/life-board';
import { TodayCapture, TodayHabits, TodayTasks, type TodayHabit } from '../components/today';
import '../components/life.css';
import { displayDay, localDay } from '../../shared/domain';
import type { HabitLog } from '../../shared/models';
import { useData } from '../ui';
import { JournalPanel } from './journal';
import { dashboardWidgetRegistry } from './dashboard-widgets';
import { WeeklySummaryDialog } from './weekly-summary';

export function DashboardPage(){
  const navigate=useNavigate(),[view,setView]=useState<'day'|'journal'>('day'),[journalLoaded,setJournalLoaded]=useState(false),[summaryOpen,setSummaryOpen]=useState(false);
  const [today,setToday]=useState(localDay),[lifeDay,setLifeDay]=useState(localDay);
  const life=useData(window.nexus.life.list),{data,error,loading,reload}=useData(window.nexus.dashboard.get),settings=useData(window.nexus.settings.get);
  const journalRef=useRef<HTMLDivElement>(null),detailsRef=useRef<HTMLDetailsElement>(null),previousDay=useRef(today);
  useEffect(()=>{const timer=setInterval(()=>setToday(localDay()),30_000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(previousDay.current!==today){previousDay.current=today;void reload();}},[today,reload]);
  useEffect(()=>{if(view==='journal')journalRef.current?.querySelector('textarea')?.focus({preventScroll:true});},[view,journalLoaded]);
  function openJournal(){setJournalLoaded(true);setView('journal');}
  function openDetails(){const details=detailsRef.current;if(details){details.open=true;details.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
  async function markHabit(habit:TodayHabit,value:number,status:HabitLog['status']){
    if(habit.period==='weekly'&&status==='done'&&!(await askConfirm(`Отметить «${habit.name}» выполненной ${displayDay(today)}?`)))return false;
    await window.nexus.health.saveHabitLog({day:today,habit_id:habit.id,value,status,comment:''});await reload();
  }
  async function reviewDay(date:string,overrideBudget=false):Promise<void>{try{await window.nexus.life.review({kind:'day',start:date,end:date,overrideBudget});await life.reload();}catch(error){if(error instanceof Error&&error.message.includes('AI_BUDGET_CONFIRM')&&(await askConfirm('Продолжить разбор дня, несмотря на лимит AI или неизвестную стоимость прошлых запросов?')))return reviewDay(date,true);throw error;}}
  return <>
    <div className="page-title today-page-head"><div><div className="eyebrow">{new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${today}T12:00:00`))}</div><h1>Сегодня</h1></div><button className="button ghost small" onClick={()=>setSummaryOpen(true)}>Итоги недели →</button></div>
    <nav className="today-views" aria-label="Режим сегодня"><button aria-pressed={view==='day'} onClick={()=>setView('day')}>Мой день</button><button aria-pressed={view==='journal'} onClick={openJournal}>Журнал</button></nav>
    {error&&<div className="error-banner">{error}</div>}
    <div className="today-view" hidden={view!=='day'}>
      <TodayCapture onOpen={openJournal}/>
      {loading&&!data?<div className="loading">Загрузка дня…</div>:data&&<><div className="today-metrics">{dashboardWidgetRegistry.map(({id,component:Widget})=><Widget key={id} data={data} currency={settings.data?.currency??'RUB'}/>)}</div><div className="today-layout"><TodayHabits habits={data.health.habits??[]} onMark={markHabit} onManage={()=>navigate('/health')}/>{life.data&&<TodayTasks onRemove={async id=>{await window.nexus.life.remove({table:'day_tasks',id});await life.reload();}} data={life.data} day={today} onMore={openDetails} onTask={async input=>{await window.nexus.life.task(input);await life.reload();}}/>}</div></>}
      {life.error&&<div className="error-banner">{life.error}</div>}
      <details className="today-secondary" ref={detailsRef}><summary>Дополнительные отметки <small>Самочувствие, заметки и воспоминания</small></summary>{life.data&&<LifeBoard data={life.data} day={lifeDay} onDay={setLifeDay} onPatch={async(day,patch)=>{await window.nexus.life.patch({day,patch});await life.reload();}} onMarkers={async fields=>{await window.nexus.life.markers(fields);await life.reload();}} onTask={async input=>{await window.nexus.life.task(input);await life.reload();}} onMemory={async input=>{await window.nexus.life.memory(input);await life.reload();}} onRemove={async(table,id)=>{await window.nexus.life.remove({table,id});await life.reload();}} onReview={reviewDay}/>}</details>
    </div>
    {journalLoaded&&<div ref={journalRef} className="today-view today-journal" hidden={view!=='journal'}><JournalPanel onApplied={()=>{void reload();void life.reload();}}/></div>}
    {summaryOpen&&<WeeklySummaryDialog currency={settings.data?.currency??'RUB'} onClose={()=>setSummaryOpen(false)}/>}</>;
}
