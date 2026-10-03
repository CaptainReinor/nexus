import {useState} from 'react';
import {RoutineButton,RoutineDialog} from './routine-ui';
import {DailyDialog} from './daily-context';
import {FocusPanel} from './focus-ui';
export {DailyProvider,useDaily} from './daily-context';
export {CareSettings,CareChecks} from './care-ui';
export {ReflectionPanel} from './reflection-ui';
export {PaymentsPanel} from './payments-ui';
export {ExperimentsPanel} from './experiments-ui';
export {FocusDock} from './focus-ui';
export function DailyLaunchpad({onJournal}:{onJournal:()=>void}){const [open,setOpen]=useState<'morning'|'evening'|'focus'|null>(null);return <><div className="daily-launchpad"><RoutineButton id="morning" onOpen={()=>setOpen('morning')}/><RoutineButton id="evening" onOpen={()=>setOpen('evening')}/><button className="daily-launch" onClick={()=>setOpen('focus')}><span className="daily-launch-icon">◷</span><span><strong>Фокус</strong><small>Время работы</small></span><span aria-hidden="true">›</span></button></div>{open==='focus'?<DailyDialog title="Фокус" onClose={()=>setOpen(null)}><FocusPanel/></DailyDialog>:open&&<RoutineDialog id={open} onClose={()=>setOpen(null)} onJournal={onJournal}/>}</>;}
