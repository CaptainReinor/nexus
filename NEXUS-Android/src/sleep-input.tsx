import {useEffect,useState} from 'react';
import {normalizeSleepTime} from '../../NEXUS/src/shared/sleep-time';

export function SleepInput({day,start,end,onSave}:{day:string;start:string;end:string;onSave:(start:string|null,end:string|null)=>Promise<void>}){
  const [bed,setBed]=useState(start),[wake,setWake]=useState(end),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  useEffect(()=>{setBed(start);setWake(end);setSaved(false);},[day,start,end]);
  async function save(){
    const a=normalizeSleepTime(bed),b=normalizeSleepTime(wake);
    if(a===undefined||b===undefined){setError('Время: ЧЧ:ММ, например 23:30.');return;}
    setBusy(true);setError('');
    try{await onSave(a,b);setBed(a??'');setWake(b??'');setSaved(true);}catch{setError('Не удалось сохранить сон.');}finally{setBusy(false);}
  }
  return <form onSubmit={event=>{event.preventDefault();void save();}}>
    <div className="two"><label>Лёг спать<input aria-label="Лёг спать" type="text" inputMode="numeric" maxLength={5} placeholder="23:30" value={bed} onChange={e=>{setBed(e.target.value);setSaved(false);}}/></label><label>Проснулся<input aria-label="Проснулся" type="text" inputMode="numeric" maxLength={5} placeholder="08:00" value={wake} onChange={e=>{setWake(e.target.value);setSaved(false);}}/></label></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="actions"><button type="submit" disabled={busy||saved}>{saved?'Сохранено':'Сохранить'}</button></div>
  </form>;
}
