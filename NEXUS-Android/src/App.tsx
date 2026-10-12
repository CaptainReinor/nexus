import {removeJob} from '../../NEXUS/src/shared/work-removal';
import {FocusPage,FocusSettings} from '../../NEXUS/src/renderer/focus-mode';
import {useFocusMode} from '../../NEXUS/src/renderer/focus-mode-state';
import {focusFacts,focusConfig,mentorInstructions,mentorResponseFormat,parseMentorReply,configureFocus,saveFocusTurn,type FocusAPI} from '../../NEXUS/src/shared/focus-mode';
import {aiEnabled,needsBudgetConfirmation,recordUsage,transcribeAudio} from './ai';
import {aiComplete} from './sync';
import {workStages,workStage,workStageLabels,workStatistics} from '../../NEXUS/src/shared/work-stages';
import type {Job,JobStatus,JobStatusEvent} from '../../NEXUS/src/shared/models';
import {SleepInput} from './sleep-input';
import {MetricDelta} from '../../NEXUS/src/renderer/metric-delta';
import {metricComparison} from '../../NEXUS/src/shared/metric-delta';
import {useTheme,useNavigationCopy} from '../../NEXUS/src/renderer/appearance';
import {useSystemCopy} from '../../NEXUS/src/renderer/appearance';
import {DailyDialog} from '../../NEXUS/src/renderer/components/daily-context';
import {DailyProvider,DailyLaunchpad,FocusDock,CareSettings,ExperimentsPanel} from '../../NEXUS/src/renderer/components/daily-ui';
import {dailyData,type DailyAPI} from '../../NEXUS/src/shared/daily';
import {saveCareConfig,saveCareRole,markCare} from '../../NEXUS/src/shared/care';
import {saveRoutine,recordRoutineEntry} from '../../NEXUS/src/shared/routines';
import {savePayment,paymentAction} from '../../NEXUS/src/shared/payments';
import {saveExperiment,markExperiment} from '../../NEXUS/src/shared/experiments';
import {focusAction} from '../../NEXUS/src/shared/focus';
import {saveReflection} from '../../NEXUS/src/shared/reflection';
import {RemindersPanel} from '../../NEXUS/src/renderer/components/reminders-ui';
import {reminders,updateReminders} from './reminders';
import {PatternsPanel} from '../../NEXUS/src/renderer/components/insights-ui';
import {useMemo} from 'react';
import {GrowthProvider,WeeklyPlans} from '../../NEXUS/src/renderer/components/growth-ui';
import {growthData,saveGoal,savePlan,saveRepeat,saveMetric,saveMetricEntry,removePlan,removeTask,type GrowthAPI} from '../../NEXUS/src/shared/growth';
import {insights} from '../../NEXUS/src/shared/insights';
import { TodayCapture,TodayHabits,TodayTasks,type TodayHabit } from '../../NEXUS/src/renderer/components/today';
import { lifeData,updateTask } from '../../NEXUS/src/shared/life';
import { displayDay } from '../../NEXUS/src/shared/domain';
import { MobileLifeBoard } from './life-page';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { GroupedNumberInput,groupNumber } from '../../NEXUS/src/shared/grouped-number';
import { remoteProfile } from './sync';
import { connection, mobileSync, money, nextId, rows, saveConnection, today, upsert, type Row, type Snapshot, type State } from './sync';
import type { OfflineSync, SyncStatus, Conflict } from './offline-sync';
import { JournalPage } from './journal-page';
import { MobileFinance } from './finance-page';
import { HabitStatistics } from './habit-stats';
import { MobileChart } from './charts';
import { AIStatus } from './ai-status';
import { askConfirm,ConfirmHost } from '../../NEXUS/src/renderer/confirm';

import { UpdatePanel } from '../../NEXUS/src/renderer/components/updates';
type Section='today'|'health'|'finance'|'work'|'journal'|'settings';
const nav:[Section,string][]=[['today','Сегодня'],['health','Здоровье'],['finance','Финансы'],['work','Работа'],['journal','Дневник'],['settings','Настройки']];
const str=(value:unknown)=>value==null?'':String(value);
const num=(value:unknown)=>Number(value)||0;
const records=(snapshot:Snapshot,name:string)=>rows(snapshot,name);
const stamp=()=>{const d=new Date(),part=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${part(d.getMonth()+1)}-${part(d.getDate())}T${part(d.getHours())}:${part(d.getMinutes())}:${part(d.getSeconds())}`;};
const current=(s:Snapshot,name:string)=>records(s,name);
const field=(s:Snapshot,key:string,fallback:unknown)=>{const row=current(s,'settings').find(x=>x.key===key);if(!row)return fallback;try{return JSON.parse(str(row.value)) as unknown;}catch{return fallback;}};
const currency=(s:Snapshot)=>str(field(s,'currency','RUB'))||'RUB';
const monday=(day:string)=>{const date=new Date(`${day}T12:00:00`);date.setDate(date.getDate()-(date.getDay()+6)%7);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
const habitDone=(habit:Row,log:Row)=>log.status==='done'&&(habit.kind==='avoid'?num(log.value)===0:num(log.value)>=num(habit.target));
const weeklyComplete=(habit:Row,logs:Row[],day:string)=>habit.period==='weekly'&&logs.some(log=>log.habit_id===habit.id&&str(log.day)>=monday(day)&&str(log.day)<=day&&habitDone(habit,log));

function SectionHeading({title,detail}:{eyebrow:string;title:string;detail?:string}){const navCopy=useNavigationCopy(),id=nav.find(([,label])=>label===title)?.[0];return <div className={`heading ${id==='today'?'today-page-head':''}`}><h1>{id?navCopy(id,title,true):title}</h1>{detail&&<p>{detail}</p>}</div>;}
function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="card dominion-frame">{title&&<h2>{title}</h2>}{children}</section>;}
function Empty({children}:{children:React.ReactNode}){return <p className="empty">{children}</p>;}

export function App(){
  const focusMode=useFocusMode();
  const theme=useTheme(),navCopy=useNavigationCopy();
  const [section,setSection]=useState<Section>('today');
  useEffect(()=>{if(theme!=='dominion')return;const active=document.querySelector<HTMLElement>('.bottom button.active'),bar=active?.parentElement;if(active&&bar){const left=active.offsetLeft,right=left+active.offsetWidth;if(left<bar.scrollLeft)bar.scrollLeft=left;else if(right>bar.scrollLeft+bar.clientWidth)bar.scrollLeft=right-bar.clientWidth;}},[section,theme]);
  const [visited,setVisited]=useState<Section[]>(['today']);
  const [state,setState]=useState<State|null>(null);
  const [status,setStatus]=useState<SyncStatus>('loading');
  const [conflicts,setConflicts]=useState<Conflict[]>([]);
  const [message,setMessage]=useState('');
  const [serverReady,setServerReady]=useState(Boolean(connection().token));
  const [connectionVersion,setConnectionVersion]=useState(0);
  const engine=useRef<OfflineSync|null>(null);
  const positions=useRef<Partial<Record<Section,number>>>({});
  const gesture=useRef<{x:number;y:number}|null>(null);
  const refresh=useCallback(async()=>{setMessage('');await engine.current?.refresh();await engine.current?.flush();},[]);
  const onConnected=useCallback(()=>{setServerReady(true);setConnectionVersion(value=>value+1);},[]);
  useEffect(()=>{
    if(!serverReady)return;
    let disposed=false,cleanup:undefined|(()=>void);
    setState(null);setStatus('loading');setMessage('');
    void mobileSync().then(async runtime=>{
      if(disposed){runtime.dispose();return;}
      engine.current=runtime.engine;
      const update=()=>{const next=runtime.engine.state;setState(previous=>previous?.snapshot===next.snapshot?previous:next);setStatus(runtime.engine.status);setConflicts(runtime.engine.conflicts);};
      const unsubscribe=runtime.engine.subscribe(update);
      cleanup=()=>{unsubscribe();runtime.dispose();engine.current=null;};
      update();await runtime.start();
    }).catch(error=>{if(!disposed)setMessage(error instanceof Error?error.message:'Не удалось открыть локальную базу.');});
    return()=>{disposed=true;cleanup?.();};
  },[serverReady,connectionVersion]);
  const commitLatest=useCallback(async(change:(snapshot:Snapshot)=>void):Promise<boolean>=>{
    try{if(!engine.current)throw new Error('Данные ещё загружаются.');await engine.current.change(change);setMessage('');return true;}
    catch(error){setMessage(error instanceof Error?error.message:'Не удалось сохранить изменение.');return false;}
  },[]);
  const commit=useCallback(async(change:(snapshot:Snapshot)=>void)=>{await commitLatest(change);},[commitLatest]);
  const navigate=(next:Section)=>{
    if(next===section)return;
    positions.current[section]=window.scrollY;
    setVisited(previous=>previous.includes(next)?previous:[...previous,next]);setSection(next);
    requestAnimationFrame(()=>window.scrollTo({top:positions.current[next]??0,behavior:'instant'}));
  };
  const growthAPI=useMemo<GrowthAPI>(()=>{const read=()=>{const s=engine.current?.state.snapshot;if(!s)throw new Error('Данные загружаются.');return s;};const change=async(fn:(s:Snapshot)=>void)=>{if(!await commitLatest(fn))throw new Error('Не удалось сохранить.');};return {list:async()=>growthData(read()),insights:async(start,end)=>insights(read(),start,end),goal:x=>change(s=>saveGoal(s,x)),plan:x=>change(s=>savePlan(s,x)),repeat:x=>change(s=>saveRepeat(s,x)),metric:x=>change(s=>saveMetric(s,x)),entry:x=>change(s=>saveMetricEntry(s,x)),removePlan:id=>change(s=>removePlan(s,id))};},[commitLatest]);
  const dailyAPI=useMemo<DailyAPI>(()=>{const read=()=>engine.current?.state.snapshot;const change=async(fn:(s:Snapshot)=>void)=>{if(!await commitLatest(fn))throw new Error('Не удалось сохранить.');};return {list:async()=>dailyData(read()??{format:'nexus-backup',version:11,exportedAt:'',tables:{}}),careConfig:x=>change(s=>saveCareConfig(s,x)),careRole:x=>change(s=>saveCareRole(s,x)),careMark:x=>change(s=>markCare(s,x)),routine:x=>change(s=>saveRoutine(s,x)),routineEntry:x=>change(s=>recordRoutineEntry(s,x)),payment:x=>change(s=>savePayment(s,x)),paymentAction:x=>change(s=>paymentAction(s,x)),experiment:x=>change(s=>saveExperiment(s,x)),experimentMark:x=>change(s=>markExperiment(s,x)),focus:x=>change(s=>focusAction(s,x)),reflection:x=>change(s=>saveReflection(s,x))};},[commitLatest]);
  const focusAPI=useMemo<FocusAPI>(()=>{
    const read=()=>{const s=engine.current?.state.snapshot;if(!s)throw Error('Данные ещё загружаются.');return s;};
    const change=async(fn:(s:Snapshot)=>void)=>{if(!await commitLatest(fn))throw Error('Не удалось сохранить изменения.');};
    const allowed=(override=false)=>{if(!aiEnabled(read()))throw Error('Включите ИИ в настройках.');if(!override&&needsBudgetConfirmation(read()))throw Error('AI_BUDGET_CONFIRM');};
    return {snapshot:async()=>read(),configure:(c,enableAI=false)=>change(s=>configureFocus(s,c,enableAI)),save:x=>change(s=>saveFocusTurn(s,x)),send:async input=>{
      allowed(input.overrideBudget);const s=read(),model=focusConfig(s).model;const reply=await aiComplete(model,mentorInstructions,JSON.stringify(focusFacts(s,input.day,input.text)),true,mentorResponseFormat);let result;
      try{result=parseMentorReply(reply.content,input.text);}catch{await change(s=>recordUsage(s,reply,'focus-mentor-error',model));throw Error('Не удалось проверить записи наставника. Данные не изменены.');}
      await change(s=>recordUsage(s,reply,'focus-mentor',model));return result;
    },transcribe:async input=>{allowed(input.overrideBudget);const result=await transcribeAudio(read(),input.base64,input.format);await change(s=>recordUsage(s,result.reply,'focus-transcription',result.model));return result.text;}};
  },[commitLatest]);
  const snapshot=state?.snapshot;
  useEffect(()=>{updateReminders(snapshot??null);const refresh=()=>updateReminders(engine.current?.state.snapshot??null);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[snapshot]);
  const statusLabel:Record<SyncStatus,string>={loading:'Загрузка',saved:'Сохранено',pending:'На телефоне',syncing:'Отправляется',offline:'Без связи',conflict:'Есть различия','storage-error':'Ошибка сохранения'};
  return <GrowthProvider api={growthAPI} revision={snapshot}><DailyProvider api={dailyAPI} revision={snapshot} reminders={reminders}><ConfirmHost/><div className={`app dominion-chassis ${focusMode?"focus-active":""}`}>
    <header className="top"><div className="brand"><span className="mark">N</span><div><strong>NEXUS</strong>{theme==='dominion'&&<small className="dominion-brand-label">ДОМИНИОН</small>}</div></div><div className={`status ${message||status==='storage-error'?'bad':status==='saved'?'good':''}`} role="status"><span className="dot"/>{message?'Есть ошибка':statusLabel[status]}</div></header>
    <main className={focusMode?"main focus-shell":"main"} onTouchStart={event=>{const touch=event.touches[0],target=event.target as HTMLElement;gesture.current=event.touches.length===1&&touch.clientX>24&&touch.clientX<window.innerWidth-24&&!target.closest('input,textarea,select,button,[data-no-swipe]')?{x:touch.clientX,y:touch.clientY}:null;}} onTouchEnd={event=>{const start=gesture.current;gesture.current=null;if(!start)return;const touch=event.changedTouches[0],dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.8&&Math.abs(dy)<60){const next=nav[nav.findIndex(([key])=>key===section)+(dx<0?1:-1)];if(next)navigate(next[0]);}}} onTouchCancel={()=>{gesture.current=null;}}>
      {message&&<div className="notice" role="alert">{message}<button onClick={()=>void refresh()}>Повторить</button></div>}
      {status==='storage-error'&&<div className="notice" role="alert">{engine.current?.error}</div>}
      {conflicts.length>0&&<ConflictReview conflicts={conflicts} resolve={choices=>engine.current!.resolve(choices)}/>}
      {!serverReady?<Connect onConnected={onConnected}/>:
       !snapshot?<div className="center"><SectionHeading eyebrow="ПОДКЛЮЧЕНИЕ" title={status==='offline'?'Нет связи с сервером':'Ждём данные с компьютера'} detail={status==='offline'?engine.current?.error:'После первого подключения данные сохранятся и на телефоне.'}/><button onClick={()=>void refresh()}>Проверить ещё раз</button><Connect onConnected={onConnected}/></div>:
       focusMode?<FocusPage api={focusAPI} revision={snapshot} mobile/>:visited.map(key=><div key={key} hidden={section!==key} className="page"><Page section={key} active={section===key} snapshot={snapshot} commit={commit} commitLatest={commitLatest} onConnected={onConnected} onNavigate={navigate} focusAPI={focusAPI}/></div>)}
    </main>
    {!focusMode&&<nav className="bottom" aria-label="Разделы" data-no-swipe>{nav.map(([key,label])=><button key={key} className={section===key?'active':''} aria-current={section===key?"page":undefined} onClick={()=>navigate(key)}><span>{navCopy(key,label)}</span></button>)}</nav>}
  </div>{!focusMode&&<FocusDock/>}</DailyProvider></GrowthProvider>;
}

const Page=memo(function Page(props:PanelProps&{section:Section;active:boolean;onConnected:()=>void;onNavigate:(section:Section)=>void;focusAPI:FocusAPI}){
  switch(props.section){case 'today':return <Today {...props}/>;case 'health':return <Health {...props}/>;case 'finance':return <Finance {...props}/>;case 'work':return <Work {...props}/>;case 'journal':return <JournalPage {...props}/>;case 'settings':return <Settings {...props}/>;}
},(before,after)=>!after.active||(before.snapshot===after.snapshot&&before.active===after.active));

function ConflictReview({conflicts,resolve}:{conflicts:Conflict[];resolve:(choices:Record<string,'local'|'remote'>)=>Promise<void>}){
  const [choices,setChoices]=useState<Record<string,'local'|'remote'>>({}),[error,setError]=useState('');
  const titles:Record<string,string>={weight_entries:'Вес',health_daily_entries:'Сон и самочувствие',habit_logs:'Привычка',habits:'Привычка',finance_transactions:'Финансовая операция',investment_entries:'Инвестиции',jobs:'Вакансия',settings:'Настройка'};
  const fields:Record<string,string>={weight_kg:'Вес',value:'Значение',status:'Отметка',sleep_start:'Лёг',sleep_end:'Проснулся',sleep_minutes:'Сон, мин.',amount_cents:'Сумма, коп.',comment:'Комментарий',name:'Название',notes:'Заметки'};
  const describe=(conflict:Conflict,row:Row|null)=>!row?'Удалено':conflict.fields.includes('запись')?JSON.stringify(row):conflict.fields.map(field=>`${fields[field]??field}: ${str(row[field])||'—'}`).join(' · ');
  return <Card title="Изменения на двух устройствах"><p className="muted">Выберите, какую запись оставить. До выбора изменения хранятся на телефоне.</p>{conflicts.map(conflict=>{const key=`${conflict.table}:${conflict.key}`;return <div className="conflict" key={key}><strong>{titles[conflict.table]??'Запись'} · {str(conflict.local?.day??conflict.remote?.day??conflict.local?.name??'')}</strong>{(['local','remote'] as const).map(choice=><button key={choice} className={`ghost ${choices[key]===choice?'chosen':''}`} onClick={()=>setChoices(previous=>({...previous,[key]:choice}))}>{choice==='local'?'Телефон':'Сервер'}<small>{describe(conflict,choice==='local'?conflict.local:conflict.remote)}</small></button>)}</div>;})}{error&&<p className="error">{error}</p>}<button disabled={conflicts.some(c=>!choices[`${c.table}:${c.key}`])} onClick={()=>void resolve(choices).catch(error=>setError(error instanceof Error?error.message:'Не удалось сохранить выбор.'))}>Применить выбор</button></Card>;
}

type PanelProps={snapshot:Snapshot;commit:(change:(snapshot:Snapshot)=>void)=>Promise<void>;commitLatest:(change:(snapshot:Snapshot)=>void)=>Promise<boolean>};
function Connect({onConnected}:{onConnected:()=>void}){
  const copy=useSystemCopy("App");

  const initial=connection();const [token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <Card title={copy("Вход в NEXUS")}><label>Код доступа<input autoFocus value={token} onChange={e=>setToken(e.target.value)} type="password" autoCapitalize="none" autoComplete="off"/></label>{error&&<p className="error">{error}</p>}<button disabled={busy||!token.trim()} onClick={()=>{void (async()=>{setBusy(true);try{await saveConnection(initial.endpoint,token);setError('');onConnected();}catch(e){setError(e instanceof Error?e.message:'Проверьте код.');}finally{setBusy(false);}})();}}>{busy?'Подключение…':'Войти'}</button></Card>;
}

function Today({snapshot,commit,commitLatest,onNavigate}:PanelProps&{onNavigate:(section:Section)=>void;focusAPI:FocusAPI}){
const theme=useTheme();
const weightCompare=metricComparison('weight',current(snapshot,'weight_entries').map(r=>({id:num(r.id),day:str(r.day),value:r.weight_kg==null?null:num(r.weight_kg)}))),sleepCompare=metricComparison('sleep',current(snapshot,'health_daily_entries').map(r=>({id:str(r.day),day:str(r.day),value:r.sleep_minutes==null?null:num(r.sleep_minutes)})));
  const copy=useSystemCopy("App");

  const day=today(),logs=current(snapshot,'habit_logs');
  const habits:TodayHabit[]=current(snapshot,'habits').filter(x=>num(x.active)===1&&!weeklyComplete(x,logs,day)).sort((a,b)=>num(a.sort_order)-num(b.sort_order)).map(h=>{const log=logs.find(x=>x.habit_id===h.id&&x.day===day);return {id:num(h.id),name:str(h.name),kind:h.kind as TodayHabit['kind'],format:h.format as TodayHabit['format'],period:h.period as TodayHabit['period'],target:num(h.target),value:log?num(log.value):null,status:log?.status as TodayHabit['status']??null};});
  const health=current(snapshot,'health_daily_entries').find(x=>x.day===day),weights=[...current(snapshot,'weight_entries')].sort((a,b)=>str(b.day).localeCompare(str(a.day)));
  const lastSleep=[...current(snapshot,'health_daily_entries')].filter(x=>x.sleep_minutes!=null).sort((a,b)=>str(b.day).localeCompare(str(a.day)))[0];
  const expenses=current(snapshot,'finance_transactions').filter(x=>x.type==='expense'&&str(x.occurred_at).startsWith(day)).reduce((sum,x)=>sum+num(x.amount_cents),0);
  const extra=useRef<HTMLDetailsElement>(null);
  async function mark(h:TodayHabit,value:number,status:TodayHabit['status']){if(h.period==='weekly'&&status==='done'&&!confirm(`Отметить «${h.name}» выполненной ${displayDay(day)}?`))return false;if(!await commitLatest(s=>{const list=current(s,'habit_logs'),existing=list.find(x=>x.habit_id===h.id&&x.day===day);upsert(list,{id:existing?.id??nextId(list),habit_id:h.id,day,value,status,comment:''});}))throw new Error('Не удалось сохранить отметку.');}
  const options={mood:[['1','Очень тяжело'],['3','Плохо'],['5','Нейтрально'],['7','Хорошо'],['10','Отлично']],energy:[['1','Сил совсем нет'],['3','Мало сил'],['5','Хватает на обычные дела'],['7','Есть запас сил'],['10','Много сил']]};
  return <><SectionHeading eyebrow={displayDay(day)} title="Сегодня"/><TodayCapture onOpen={()=>onNavigate('journal')}/><DailyLaunchpad onJournal={()=>onNavigate('journal')}/>
    <div className="today-metrics dominion-instrument-bay"><button className="today-metric" onClick={()=>onNavigate('health')}><small>{copy("Последний вес")}</small><strong>{weights.length?`${theme==='dominion'?num(weights[0].weight_kg).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}):str(weights[0].weight_kg)} кг`:'—'}</strong><MetricDelta kind="weight" {...weightCompare}/></button><button className="today-metric" onClick={()=>onNavigate('health')}><small>{copy("Последний сон")}</small><strong>{lastSleep?`${Math.floor(num(lastSleep.sleep_minutes)/60)} ч ${num(lastSleep.sleep_minutes)%60} мин`:'—'}</strong><MetricDelta kind="sleep" {...sleepCompare}/></button><button className="today-metric" onClick={()=>onNavigate('finance')}><small>{copy("Траты сегодня")}</small><strong>{money(expenses,currency(snapshot))}</strong></button></div>
    <div className="today-layout"><TodayHabits habits={habits} onMark={mark} onManage={()=>onNavigate('health')}/><TodayTasks onRemove={async id=>{if(!await commitLatest(s=>{removeTask(s,id);}))throw new Error('Не удалось удалить дело.');}} data={lifeData(snapshot)} day={day} onTask={async input=>{if(!await commitLatest(s=>updateTask(s,input)))throw new Error('Не удалось сохранить дело.');}} onMore={()=>{if(extra.current){extra.current.open=true;extra.current.scrollIntoView({block:'start',behavior:'smooth'});}}}/></div>
    <WeeklyPlans/><details className="today-secondary dominion-frame" ref={extra}><summary>{copy("Дополнительные отметки")}<small>{copy("Сон, самочувствие и воспоминания")}</small></summary><Card title={copy("Самочувствие · необязательно")}>{(['mood','energy'] as const).map(key=><label key={key}>{key==='mood'?copy("Как прошёл день?"):copy("Хватало ли сил?")}<select value={str(health?.[key])} onChange={e=>{const value=e.target.value?Number(e.target.value):null;void commit(s=>saveDaily(s,day,key,value));}}><option value="">Не отмечать</option>{options[key].map(([value,label])=><option key={value} value={value}>{label}</option>)}{Boolean(health?.[key])&&!options[key].some(([value])=>value===str(health?.[key]))&&<option value={str(health?.[key])}>Прежняя оценка: {str(health?.[key])}/10</option>}</select></label>)}</Card><Card title="Сон"><SleepInput day={day} start={str(health?.sleep_start)} end={str(health?.sleep_end)} onSave={async(start,end)=>{if(!await commitLatest(s=>{saveDaily(s,day,'sleep_start',start);saveDaily(s,day,'sleep_end',end);}))throw new Error('Не удалось сохранить сон.');}}/></Card><MobileLifeBoard snapshot={snapshot} commitLatest={commitLatest}/></details></>;
}
function saveDaily(s:Snapshot,day:string,key:string,value:unknown){const list=current(s,'health_daily_entries');const row=list.find(x=>x.day===day)??{day,sleep_start:null,sleep_end:null,sleep_minutes:null,mood:null,energy:null,nutrition:null,comment:''};row[key]=value;if(key==='sleep_start'||key==='sleep_end'){const start=str(row.sleep_start),end=str(row.sleep_end);if(start&&end){const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);row.sleep_minutes=((eh*60+em)-(sh*60+sm)+1440)%1440||1440;}else row.sleep_minutes=null;}upsert(list,row,'day');}

function Health({snapshot,commit,commitLatest}:PanelProps){
 const theme=useTheme();
  const copy=useSystemCopy("App");

  const [view,setView]=useState<'weight'|'calendar'|'habits'|'experiments'>('weight');
  const [habitRole,setHabitRole]=useState<'care'|'habit'>('habit'),[newHabitOpen,setNewHabitOpen]=useState(false),[habitName,setHabitName]=useState(''),[habitPeriod,setHabitPeriod]=useState<'daily'|'weekly'>('daily'),[weight,setWeight]=useState('');const day=today();
  const habits=current(snapshot,'habits').filter(h=>num(h.active)===1).sort((a,b)=>num(a.sort_order)-num(b.sort_order));
  const weightCompare=metricComparison('weight',current(snapshot,'weight_entries').map(r=>({id:num(r.id),day:str(r.day),value:r.weight_kg==null?null:num(r.weight_kg)})));
  const health=current(snapshot,'health_daily_entries').find(x=>x.day===day);
  const weights=[...current(snapshot,'weight_entries')].sort((a,b)=>str(b.day).localeCompare(str(a.day))).slice(0,12);
  return <><SectionHeading eyebrow="02 / ЗДОРОВЬЕ" title={copy("Здоровье")} /><nav className="segmented health-views" aria-label="Виды здоровья">{([['weight','Вес и сон'],['calendar','Календарь'],['habits',copy("Уход и привычки")],['experiments',copy("Эксперименты")]] as const).map(([key,label])=><button key={key} className={view===key?'selected':''} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</nav><div className="section-view" hidden={view!=='habits'}><CareSettings initialGroup={habitRole} onCreate={role=>{setHabitRole(role);setNewHabitOpen(true);}}/>{newHabitOpen&&<DailyDialog title="Новый пункт" onClose={()=>setNewHabitOpen(false)}><div className="habit-form"><select aria-label="Раздел нового пункта" value={habitRole} onChange={e=>setHabitRole(e.target.value as 'care'|'habit')}><option value="care">{copy("Уход")}</option><option value="habit">Привычка</option></select><input aria-label="Название нового пункта" placeholder="Название" value={habitName} onChange={e=>setHabitName(e.target.value)}/><select aria-label="Периодичность" value={habitPeriod} onChange={e=>setHabitPeriod(e.target.value as 'daily'|'weekly')}><option value="daily">Каждый день</option><option value="weekly">Раз в неделю</option></select><button disabled={!habitName.trim()} onClick={()=>void commit(s=>{const list=current(s,'habits'),id=nextId(list);list.push({id,name:habitName.trim(),description:'',kind:'positive',format:'boolean',target:1,period:habitPeriod,active:1,created_at:new Date().toISOString(),sort_order:Math.max(0,...list.map(x=>num(x.sort_order)))+1});saveCareRole(s,{habit_id:id,role:habitRole});setHabitName('');setNewHabitOpen(false);})}>Создать</button></div></DailyDialog>}<details className="mobile-fold dominion-frame"><summary>Управление</summary><Card title="">{habits.map((h,i)=><div className="listrow habit-editor" key={str(h.id)}><div><strong>{str(h.name)}</strong><small>{h.period==='weekly'?'Раз в неделю':'Каждый день'}{weeklyComplete(h,current(snapshot,'habit_logs'),day)?' · сделано':''}</small></div><div className="actions"><button className="ghost" disabled={i===0} onClick={()=>void commit(s=>moveHabit(s,num(h.id),-1))}>↑</button><button className="ghost" disabled={i===habits.length-1} onClick={()=>void commit(s=>moveHabit(s,num(h.id),1))}>↓</button><button className="ghost" disabled={current(snapshot,'care_slots').some(slot=>slot.habit_id===h.id&&slot.active)} onClick={()=>void commit(s=>{const item=current(s,'habits').find(x=>x.id===h.id);if(item)item.period=item.period==='weekly'?'daily':'weekly';})}>{h.period==='weekly'?'Ежедневно':'Еженедельно'}</button>{weeklyComplete(h,current(snapshot,'habit_logs'),day)&&<button className="ghost" onClick={()=>void commit(s=>{const log=current(s,'habit_logs').find(l=>l.habit_id===h.id&&str(l.day)>=monday(day)&&str(l.day)<=day&&habitDone(h,l));if(log){log.status='skipped';log.value=0;}})}>Отменить</button>}<button className="ghost danger" onClick={()=>{if(confirm(`Архивировать привычку «${str(h.name)}»?`))void commit(s=>{const item=current(s,'habits').find(x=>x.id===h.id);if(item)item.active=0;});}}>Архив</button></div></div>)}</Card></details></div><div className="section-view" hidden={view!=='experiments'}><ExperimentsPanel currency={currency(snapshot)}/></div><div className="section-view" hidden={view!=='weight'}><Card title="Вес"><div className="inline"><input aria-label="Вес в килограммах" type="number" min="1" max="500" step="0.1" placeholder="Вес, кг" value={weight} onChange={e=>setWeight(e.target.value)}/><button disabled={!weight||Number(weight)<=0} onClick={()=>void commit(s=>{const list=current(s,'weight_entries');const row=list.find(x=>x.day===day)??{id:nextId(list),day};row.weight_kg=Number(weight);upsert(list,row);setWeight('');})}>Записать</button></div><MetricDelta kind="weight" {...weightCompare}/><MobileChart carryForward label="Вес" points={[...weights].reverse().map(x=>({day:str(x.day),value:num(x.weight_kg)}))} formatValue={value=>`${(theme==='dominion'?value.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}):value.toFixed(1))} кг`}/>{weights.map(x=><div className="listrow" key={str(x.id)}><span>{displayDay(str(x.day))}</span><strong>{str(x.weight_kg)} кг</strong></div>)}</Card><Card title="Сон"><SleepInput day={day} start={str(health?.sleep_start)} end={str(health?.sleep_end)} onSave={async(start,end)=>{if(!await commitLatest(s=>{saveDaily(s,day,'sleep_start',start);saveDaily(s,day,'sleep_end',end);}))throw new Error('Не удалось сохранить сон.');}}/>{health?.sleep_minutes!=null&&<p>{Math.floor(num(health.sleep_minutes)/60)} ч {num(health.sleep_minutes)%60} мин</p>}</Card></div><div className="section-view" hidden={view!=='calendar'}><PatternsPanel/><HabitStatistics snapshot={snapshot}/></div></>;
}
function moveHabit(s:Snapshot,id:number,step:number){const list=current(s,'habits').filter(x=>num(x.active)===1).sort((a,b)=>num(a.sort_order)-num(b.sort_order));const i=list.findIndex(x=>x.id===id),other=list[i+step];if(i<0||!other)return;list.forEach((x,j)=>{x.sort_order=j;});const a=list[i];a.sort_order=i+step;other.sort_order=i;}

function Finance({snapshot,commitLatest}:PanelProps){return <MobileFinance snapshot={snapshot} commitLatest={commitLatest}/>;}

const legacyStatuses:[string,string][]=[['saved','Сохранена'],['planned','В планах'],['applied','Отклик'],['viewed','Просмотрена'],['invited','Приглашение'],['interview','Интервью'],['next','Следующий этап'],['offer','Оффер'],['rejected','Отказ'],['withdrawn','Отозвана'],['archived','Архив']];
const statuses=workStages.map(stage=>[stage,workStageLabels[stage]] as [string,string]);
function Work({snapshot,commitLatest}:PanelProps){
 const copy=useSystemCopy("App"),[archive,setArchive]=useState(false),[removing,setRemoving]=useState<number|null>(null);
 const deleting=useRef(false),[monthly,setMonthly]=useState(str(field(snapshot,'monthlyTarget',num(field(snapshot,'weeklyTarget',15))*4)));
 const statistics=workStatistics(current(snapshot,'jobs') as unknown as Job[],current(snapshot,'job_status_history') as unknown as JobStatusEvent[]);
 async function deleteVacancy(job:Row){
  if(deleting.current)return;deleting.current=true;
  try{
   if(!await askConfirm(`Удалить «${str(job.title)}» (${str(job.company)}) навсегда? История статусов и результаты ИИ тоже будут удалены.`))return;
   setRemoving(num(job.id));await commitLatest(s=>removeJob(s,num(job.id)));
  }finally{deleting.current=false;setRemoving(null);}
 }
 const jobs=[...current(snapshot,'jobs')].filter(x=>archive?workStage(str(x.status) as JobStatus)==='archived':workStage(str(x.status) as JobStatus)!=='archived').sort((a,b)=>str(b.updated_at).localeCompare(str(a.updated_at))||num(b.id)-num(a.id));
 return <><SectionHeading eyebrow="04 / РАБОТА" title={copy("Работа")}/><div className="segmented"><button className={!archive?'selected':''} onClick={()=>setArchive(false)}>Вакансии</button><button className={archive?'selected':''} onClick={()=>setArchive(true)}>Архив</button></div><Card title="Статистика поиска"><div className="work-statistics-grid">{[['Всего откликов',statistics.total],['Отказы на отклике',statistics.rejectedApplication],['Собеседования',statistics.interviews],['Отказы на собеседовании',statistics.rejectedInterview]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><details><summary>Цель откликов</summary><label>Откликов за месяц<input type="number" value={monthly} min="0" max="1000" onChange={e=>setMonthly(e.target.value)} onBlur={()=>{const value=Number(monthly);if(Number.isInteger(value)&&value>=0&&value<=1000)void commitLatest(s=>upsert(current(s,'settings'),{key:'monthlyTarget',value:JSON.stringify(value)},'key'));}}/></label></details></Card><Card title={`Вакансии · ${jobs.length}`}>{jobs.length?jobs.map(job=><details className="work-vacancy" key={str(job.id)}><summary><span style={{display:'inline-grid',gap:4,minWidth:0}}><strong>{str(job.title)}</strong><small>{[str(job.company),workStageLabels[workStage(str(job.status) as JobStatus)]??legacyStatuses.find(([key])=>key===job.status)?.[1]].filter(Boolean).join(' · ')}</small></span></summary><div className="form-stack">{Boolean(job.city||job.work_mode)&&<p>{[str(job.city),str(job.work_mode)].filter(Boolean).join(' · ')}</p>}{(job.salary_from!=null||job.salary_to!=null)&&<p>{job.salary_from===job.salary_to?groupNumber(str(job.salary_from)):[job.salary_from!=null?`от ${groupNumber(str(job.salary_from))}`:'',job.salary_to!=null?`до ${groupNumber(str(job.salary_to))}`:''].filter(Boolean).join(' ')} {str(job.currency)}</p>}<label>Статус<select value={workStage(str(job.status) as JobStatus)} aria-label={`Статус ${str(job.title)}`} disabled={removing===job.id} onChange={e=>{const status=e.target.value;void commitLatest(s=>{const item=current(s,'jobs').find(x=>x.id===job.id);if(!item||item.status===status)return;const old=item.status,now=stamp();item.status=status;item.updated_at=now;const history=current(s,'job_status_history');history.push({id:nextId(history),job_id:item.id,old_status:old,new_status:status,occurred_at:now,comment:''});});}}>{workStage(str(job.status) as JobStatus)==='archived'&&<option value="archived">Архив</option>}{statuses.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{Boolean(job.url)&&/^https?:\/\//i.test(str(job.url))&&<a href={str(job.url)} target="_blank" rel="noreferrer">Открыть вакансию</a>}{Boolean(job.notes)&&<p style={{whiteSpace:'pre-wrap'}}>{str(job.notes)}</p>}{Boolean(job.original_text)&&<details><summary>Текст вакансии</summary><p style={{whiteSpace:'pre-wrap'}}>{str(job.original_text)}</p></details>}<button className="button danger" disabled={removing!==null} onClick={()=>void deleteVacancy(job)}>Удалить вакансию</button></div></details>):<Empty>{archive?'Архив пуст':'Вакансий пока нет.'}</Empty>}</Card></>;
}

function Settings({snapshot,onConnected,focusAPI}:PanelProps&{onConnected:()=>void;focusAPI:FocusAPI}){
  const copy=useSystemCopy("App");

  const [profile,setProfile]=useState<Awaited<ReturnType<typeof remoteProfile>>|null>(null);
  useEffect(()=>{void remoteProfile().then(setProfile).catch(()=>{});},[]);
  return <><SectionHeading eyebrow="06 / НАСТРОЙКИ" title={copy("Настройки")}/><FocusSettings api={focusAPI}/><UpdatePanel/><details className="mobile-fold"><summary>Уведомления</summary><RemindersPanel api={reminders} habits={rows(snapshot,'habits').filter(x=>x.active).map(x=>({id:Number(x.id),name:String(x.name)}))}/></details><details className="mobile-fold"><summary>ИИ</summary><AIStatus/></details><details className="mobile-fold"><summary>Подключение</summary>{profile&&<div className="connection-summary"><span className="dot"/>Подключено · {profile.name}</div>}<Connect onConnected={onConnected}/></details></>;

}
