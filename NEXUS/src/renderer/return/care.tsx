import {useState} from 'react';
import type {DailyAPI} from '../../shared/daily';
import type {ReminderAPI} from '../../shared/reminders';
import {DailyProvider,CareSettings} from '../components/daily-ui';
import {Modal,errorText} from '../ui';

export function CarePreferences({api,reminders,create}:{api:DailyAPI;reminders:ReminderAPI;create?:(name:string,role:'care'|'habit')=>Promise<void>}){
 const [role,setRole]=useState<'care'|'habit'|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <DailyProvider api={api} reminders={reminders}><CareSettings initialGroup="care" onCreate={create?group=>{setRole(group);setName('');setError('');}:undefined}/>{role&&<Modal title={role==='care'?'Новый уход':'Новая привычка'} onClose={()=>{if(!busy)setRole(null);}}><form className="return-form" onSubmit={e=>{e.preventDefault();if(busy||!name.trim())return;setBusy(true);void create!(name.trim(),role).then(()=>{window.dispatchEvent(new Event('nexus:daily-change'));setRole(null);}).catch(error=>setError(errorText(error))).finally(()=>setBusy(false));}}><label>Название<input required autoFocus maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>{error&&<p className="return-error" role="alert">{error}</p>}<button className="return-button primary" disabled={busy}>Добавить</button></form></Modal>}</DailyProvider>;
}
