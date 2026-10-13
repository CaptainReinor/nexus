import {useState} from 'react';
import {RoutineButton,RoutineDialog} from './routine-ui';
export {DailyProvider,useDaily} from './daily-context';
export {CareSettings,CareChecks} from './care-ui';
export {PaymentsPanel} from './payments-ui';
export {ExperimentsPanel} from './experiments-ui';
export function DailyLaunchpad({onJournal}:{onJournal:()=>void}){
 const [open,setOpen]=useState<'morning'|'evening'|null>(null);return <><div className="daily-launchpad"><RoutineButton id="morning" onOpen={()=>setOpen('morning')}/><RoutineButton id="evening" onOpen={()=>setOpen('evening')}/></div>{open&&<RoutineDialog id={open} onClose={()=>setOpen(null)} onJournal={onJournal}/>}</>;
}
