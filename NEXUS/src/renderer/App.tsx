import {lazy,Suspense,useState} from 'react';
import {ReturnApp,type Extra} from './return/app';
import {ConnectionGate} from './connection-gate';
import {ConfirmHost} from './confirm';
import {DailyProvider} from './components/daily-ui';
import {GrowthProvider} from './components/growth-ui';

const Settings=lazy(()=>import('./modules/settings').then(m=>({default:m.SettingsPage})));
const Work=lazy(()=>import('./modules/work').then(m=>({default:m.WorkPage})));
const Health=lazy(()=>import('./modules/health').then(m=>({default:m.HealthPage})));
const Finance=lazy(()=>import('./modules/finance').then(m=>({default:m.FinancePage})));
const Investments=lazy(()=>import('./modules/investments').then(m=>({default:m.InvestmentsPanel})));
function ExtraPage({kind}:{kind:Extra}){const [tab,setTab]=useState<'health'|'finance'>('health');return <GrowthProvider api={window.nexus.growth}><DailyProvider api={window.nexus.daily} reminders={window.nexus.reminders}><Suspense fallback={<p role="status">Загружаю…</p>}>{kind==='work'?<Work/>:kind==='investments'?<Investments/>:<><div className="return-segments">{([['health','Здоровье'],['finance','Финансы']] as const).map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div>{tab==='health'?<Health/>:<Finance/>}</>}</Suspense></DailyProvider></GrowthProvider>;}
export function App(){const taskAPI={save:window.nexus.life.task,remove:(id:string)=>window.nexus.life.remove({table:'day_tasks',id})};return <><ConfirmHost/><ConnectionGate/><ReturnApp api={window.nexus.focus} social={window.nexus.social} daily={window.nexus.daily} reminders={window.nexus.reminders} createCare={(name,role)=>window.nexus.health.saveHabit({name,role,description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1})} tasks={taskAPI} desktopQuick={window.nexus.quick} quickActions={window.nexus.quick} settings={<Suspense fallback={<p role="status">Загружаю настройки…</p>}><Settings/></Suspense>} extra={kind=><ExtraPage kind={kind}/>}/></>;}
