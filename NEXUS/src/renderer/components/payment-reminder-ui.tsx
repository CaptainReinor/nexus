import {useSystemCopy} from '../appearance';
import {useEffect,useState} from 'react';
import {defaultReminders,reminderSchema,type ReminderSettings} from '../../shared/reminders';
import {DailyDialog,DailyError,useDaily} from './daily-context';

export function PaymentReminderFields({settings,onChange}:{settings:ReminderSettings;onChange:(patch:Partial<ReminderSettings>)=>void}){
  return <div className="payment-reminder-fields"><label className="daily-checkbox"><input type="checkbox" checked={settings.payments} onChange={e=>onChange({payments:e.target.checked})}/>Платежи</label>{settings.payments&&<><div className="daily-fields"><label>За сколько дней<input aria-label="За сколько дней" type="number" min="0" max="30" value={settings.paymentsDaysBefore} onChange={e=>onChange({paymentsDaysBefore:Number(e.target.value)})}/></label><label>Время<input aria-label="Время платежей" type="time" required value={settings.paymentsTime} onChange={e=>onChange({paymentsTime:e.target.value})}/></label></div>{settings.paymentsDaysBefore>0&&<label className="daily-checkbox"><input type="checkbox" checked={settings.paymentsOnDue} onChange={e=>onChange({paymentsOnDue:e.target.checked})}/>Также в день оплаты</label>}<label>Текст<textarea aria-label="Текст уведомления о платеже" rows={2} required maxLength={200} value={settings.paymentsText} onChange={e=>onChange({paymentsText:e.target.value})}/></label></>}</div>;
}
export function PaymentReminderDialog({onClose}:{onClose:()=>void}){
  const copy=useSystemCopy("payment-reminder-ui");

  const {reminders}=useDaily(),[settings,setSettings]=useState(defaultReminders),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;void reminders?.get().then(value=>{if(live){setSettings(value.settings);setLoaded(true);}}).catch(()=>{if(live)setError('Не удалось загрузить настройки.');});return()=>{live=false;};},[reminders]);
  return <DailyDialog title={copy("Уведомления о платежах")} onClose={onClose}><form className="daily-form" onSubmit={e=>{e.preventDefault();if(!reminders||!loaded)return;setBusy(true);void (async()=>{try{const current=await reminders.get();await reminders.save(reminderSchema.parse({...current.settings,payments:settings.payments,paymentsDaysBefore:settings.paymentsDaysBefore,paymentsTime:settings.paymentsTime,paymentsOnDue:settings.paymentsOnDue,paymentsText:settings.paymentsText}));window.dispatchEvent(new Event('nexus:reminders-change'));if(settings.payments&&!current.enabled&&!(await reminders.permission()).enabled){setError('Уведомления отключены в системе.');return;}onClose();}catch{setError('Не удалось сохранить. Проверь время и текст.');}finally{setBusy(false);}})();}}><PaymentReminderFields settings={settings} onChange={patch=>setSettings(s=>({...s,...patch}))}/><DailyError message={error}/><button className="daily-button primary" disabled={!loaded||busy}>Сохранить</button></form></DailyDialog>;
}
