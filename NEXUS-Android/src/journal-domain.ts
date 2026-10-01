import { isPositiveJournalAmount,hasIncompleteSelectedFinance } from '../../NEXUS/src/shared/journal-schema';
import { applyLife,lifeKeys } from '../../NEXUS/src/shared/life';
import { journalSchema, type JournalAnalysis } from './ai';
import { nextId, rows, upsert, type Row, type Snapshot } from './sync';

function sleepMinutes(start:unknown,end:unknown):number|null{
  if(typeof start!=='string'||typeof end!=='string'||!start||!end)return null;
  const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
  return ((eh*60+em)-(sh*60+sm)+1440)%1440||1440;
}
function saveDaily(snapshot:Snapshot,day:string,field:string,value:unknown):void{
  const list=rows(snapshot,'health_daily_entries');
  const item=list.find(x=>x.day===day)??{day,sleep_start:null,sleep_end:null,sleep_minutes:null,mood:null,energy:null,nutrition:null,comment:''};
  item[field]=value;
  if(field==='sleep_start'||field==='sleep_end')item.sleep_minutes=sleepMinutes(item.sleep_start,item.sleep_end);
  upsert(list,item,'day');
}
export function applyJournalSuggestions(snapshot:Snapshot,entryId:number,rawAnalysis:JournalAnalysis,keys:string[]):void{
  const entry=rows(snapshot,'daily_journals').find(x=>x.id===entryId);
  if(!entry)throw new Error('Запись дневника больше не найдена.');
  const analysis=journalSchema.parse(rawAnalysis),day=String(entry.day);
  const already=new Set(JSON.parse(String(entry.applied_json??'[]')) as string[]);
  const selected=[...new Set(keys)].filter(key=>!already.has(key));
  const valid=new Set(['health.weight','health.sleep_start','health.sleep_end','health.mood','health.energy','health.nutrition',...analysis.health.habits.map(x=>`health.habit.${x.habitId}`),...analysis.finance.map((_,i)=>`finance.${i}`),...analysis.work.map((_,i)=>`work.${i}`),...lifeKeys(analysis.life)]);
  if(selected.some(key=>!valid.has(key)))throw new Error('Неизвестное предложение AI.');
  if(hasIncompleteSelectedFinance(analysis,selected))throw new Error('Укажите сумму для выбранной операции.');
  for(const key of selected){
    if(key==='health.weight'&&analysis.health.weightKg!==null){const weights=rows(snapshot,'weight_entries');upsert(weights,{id:weights.find(x=>x.day===day)?.id??nextId(weights),day,weight_kg:analysis.health.weightKg});}
    else if(key==='health.sleep_start')saveDaily(snapshot,day,'sleep_start',analysis.health.sleepStart);
    else if(key==='health.sleep_end')saveDaily(snapshot,day,'sleep_end',analysis.health.sleepEnd);
    else if(key==='health.mood')saveDaily(snapshot,day,'mood',analysis.health.mood);
    else if(key==='health.energy')saveDaily(snapshot,day,'energy',analysis.health.energy);
    else if(key==='health.nutrition')saveDaily(snapshot,day,'nutrition',analysis.health.nutrition);
    else if(key.startsWith('health.habit.')){
      const habitId=Number(key.slice('health.habit.'.length));
      const habit=analysis.health.habits.find(x=>x.habitId===habitId);
      if(!habit||!rows(snapshot,'habits').some(x=>x.id===habitId))throw new Error('Привычка не найдена.');
      const logs=rows(snapshot,'habit_logs');
      const item:Row={id:logs.find(x=>x.habit_id===habitId&&x.day===day)?.id??nextId(logs),habit_id:habitId,day,value:habit.value,status:rows(snapshot,'habits').find(x=>x.id===habitId)?.kind==='avoid'?(habit.value===0?'done':'missed'):habit.status,comment:habit.reason};
      upsert(logs,item);
    }else if(key.startsWith('finance.')){
      const item=analysis.finance[Number(key.slice(8))];
      if(!item)throw new Error('Финансовое предложение не найдено.');
      if(!isPositiveJournalAmount(item.amountCents))throw new Error('Укажите сумму для выбранной операции.');
      const account=rows(snapshot,'finance_accounts').find(x=>x.id===item.accountId&&x.active===1);
      const category=rows(snapshot,'finance_categories').find(x=>x.id===item.categoryId&&x.active===1&&x.kind===item.type);
      if(!account||(item.type==='expense'&&!category))throw new Error('Нужны существующие счёт и категория.');
      const transactions=rows(snapshot,'finance_transactions');
      transactions.push({id:nextId(transactions),occurred_at:`${day}T12:00:00`,amount_cents:item.amountCents,type:item.type,account_id:item.accountId,target_account_id:null,category_id:item.type==='income'?null:item.categoryId,note:item.note||'Из дневника'});
    }else if(key.startsWith('work.')){
      const item=analysis.work[Number(key.slice(5))],job=rows(snapshot,'jobs').find(x=>x.id===item?.jobId);
      if(!job||!item)throw new Error('Вакансия не найдена.');
      const old=job.status;job.status=item.status;job.updated_at=new Date().toISOString().slice(0,19);
      const history=rows(snapshot,'job_status_history');
      history.push({id:nextId(history),job_id:job.id,old_status:old,new_status:item.status,occurred_at:job.updated_at,comment:`Из дневника: ${item.reason}`});
    }
  }
  if(analysis.life)applyLife(snapshot,day,analysis.life,selected);
  entry.applied_json=JSON.stringify([...already,...selected]);
}
