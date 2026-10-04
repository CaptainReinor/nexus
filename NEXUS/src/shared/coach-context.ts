import type {Row,Snapshot} from './snapshot-sync';
import {shiftDay} from './daily-core';

const pick=<const Keys extends readonly string[]>(row:Row,keys:Keys):Partial<Record<Keys[number],unknown>>=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]])) as Partial<Record<Keys[number],unknown>>;
function jsonValue(value:unknown,fallback:unknown=null):unknown{try{return JSON.parse(String(value));}catch{return fallback;}}

// User-authored content and domain records only. Never export settings, access
// credentials, sync metadata or generated assistant reviews as personal facts.
export function coachContext(snapshot:Snapshot,start:string,end:string){
  const rows=(table:string)=>snapshot.tables[table]??[];
  const day=(row:Row,key='day')=>String(row[key]??'').slice(0,10);
  const within=(row:Row,key='day')=>day(row,key)>=start&&day(row,key)<=end;
  const range=(table:string,key='day')=>rows(table).filter(row=>within(row,key));
  const name=(table:string,id:unknown)=>rows(table).find(row=>row.id===id)?.name??null;
  const currencyValue=jsonValue(rows('settings').find(row=>row.key==='currency')?.value);
  const currency=typeof currencyValue==='string'&&/^[A-Z]{3}$/.test(currencyValue)?currencyValue:'RUB';
  const transactions=rows('finance_transactions');
  const transaction=(row:Row)=>({...pick(row,['id','occurred_at','type','amount_cents','account_id','target_account_id','category_id','note']),account_name:name('finance_accounts',row.account_id),target_account_name:name('finance_accounts',row.target_account_id),category_name:name('finance_categories',row.category_id)});
  const accountBalance=(id:unknown,before:boolean)=>transactions.filter(row=>before?day(row,'occurred_at')<start:day(row,'occurred_at')<=end).reduce((sum,row)=>{
    const amount=Number(row.amount_cents)||0;
    if(row.account_id===id){if(row.type==='income')return sum+amount;if(row.type==='expense'||row.type==='transfer')return sum-amount;}
    return row.type==='transfer'&&row.target_account_id===id?sum+amount:sum;
  },Number(rows('finance_accounts').find(row=>row.id===id)?.opening_cents)||0);
  const metrics=rows('custom_metrics');
  const metricEntries=range('metric_entries').map(row=>{const metric=metrics.find(item=>item.id===row.metric_id);return {id:row.id,day:row.day,name:metric?.name??null,kind:metric?.kind??null,unit:metric?.unit??null,value:jsonValue(row.value_json)};});
  const tasks=rows('day_tasks').filter(row=>within(row,'due_day')||(day(row,'due_day')<start&&row.status==='open'));
  const plans=rows('weekly_plans').filter(row=>day(row,'week')<=end&&shiftDay(day(row,'week'),6)>=start).map(row=>{
    const ids=new Set([row.task_id,...rows('weekly_plan_tasks').filter(link=>link.plan_id===row.id).map(link=>link.task_id)]);
    return {...pick(row,['id','title','week','status']),tasks:rows('day_tasks').filter(task=>ids.has(task.id)).map(task=>pick(task,['id','title','due_day','status']))};
  });
  const jobEvents=range('job_status_history','occurred_at');
  const jobs=rows('jobs').filter(row=>row.status!=='archived'||jobEvents.some(event=>event.job_id===row.id)||within(row,'updated_at'));
  const jobIds=new Set(jobs.map(row=>row.id));
  const habitIds=new Set([...range('habit_logs').map(row=>row.habit_id),...rows('care_slots').filter(row=>row.active).map(row=>row.habit_id)]);
  const habits=rows('habits').filter(row=>row.active||habitIds.has(row.id)).map(row=>({...pick(row,['id','name','description','kind','format','target','period','active']),role:rows('habit_preferences').find(item=>item.id===row.id)?.role??'habit'}));
  const careSlots=rows('care_slots').filter(row=>row.active||range('care_checks').some(check=>check.slot_id===row.id));
  const careSchedule=careSlots.map(row=>({...pick(row,['id','label','time','active']),habit:name('habits',row.habit_id)}));
  const payments=rows('payment_occurrences').filter(row=>within(row,'due_day')||(day(row,'due_day')<start&&row.status==='open')).map(row=>{
    const payment=rows('scheduled_payments').find(item=>item.id===row.payment_id);
    const paid=transactions.find(item=>item.id===row.transaction_id);
    return {...pick(row,['id','payment_id','due_day','amount_cents','status','transaction_id']),name:payment?.name??null,cadence:payment?.cadence??null,account_name:name('finance_accounts',row.account_id),category_name:name('finance_categories',row.category_id),transaction:paid?transaction(paid):null};
  });
  const portfolioIds=new Set(range('investment_entries').map(row=>row.account_id));
  const prior=(table:string,valid:(row:Row)=>boolean,fields:string[])=>{const row=rows(table).filter(item=>day(item)<start&&valid(item)).sort((a,b)=>day(a).localeCompare(day(b))).at(-1);return row?pick(row,fields):null;};
  const portfolios=rows('investment_accounts').filter(row=>row.active||portfolioIds.has(row.id)).map(row=>{
    const entries=rows('investment_entries').filter(item=>item.account_id===row.id&&day(item)<=end).sort((a,b)=>day(a).localeCompare(day(b)));
    const fields=['day','value_cents','flow_cents','note'];
    const baseline=entries.filter(item=>day(item)<start).at(-1),latest=entries.at(-1);
    return {id:row.id,name:row.name,entries:entries.filter(item=>within(item)).map(item=>pick(item,fields)),beforePeriod:baseline?pick(baseline,fields):null,latestAtEnd:latest?pick(latest,fields):null};
  });
  return {
    currency,
    journals:range('daily_journals').map(row=>pick(row,['id','day','raw_text','source'])),
    workouts:range('workouts').map(row=>pick(row,['day','done','type','minutes','comment'])),
    healthBaselines:{weightBeforePeriod:prior('weight_entries',row=>Number(row.weight_kg)>0,['day','weight_kg']),sleepBeforePeriod:prior('health_daily_entries',row=>row.sleep_minutes!==null&&row.sleep_minutes!==undefined&&Number.isFinite(Number(row.sleep_minutes)),['day','sleep_minutes','sleep_start','sleep_end'])},
    habitDefinitions:habits,
    habitRecords:range('habit_logs').map(row=>({...pick(row,['habit_id','day','value','status','comment']),habit:name('habits',row.habit_id)})),
    finances:{
      accounts:rows('finance_accounts').map(row=>({id:row.id,name:row.name,active:row.active,beforePeriod_cents:accountBalance(row.id,true),atEnd_cents:accountBalance(row.id,false)})),
      transactions:range('finance_transactions','occurred_at').map(transaction),
      budgets:rows('finance_budgets').filter(row=>String(row.month)>=start.slice(0,7)&&String(row.month)<=end.slice(0,7)).map(row=>({month:row.month,amount_cents:row.amount_cents,spentThroughEnd_cents:transactions.filter(item=>item.type==='expense'&&day(item,'occurred_at').startsWith(String(row.month))&&day(item,'occurred_at')<=end).reduce((sum,item)=>sum+Number(item.amount_cents),0)})),
      goals:rows('financial_goals').map(row=>pick(row,['id','name','target_cents','saved_cents','deadline','active','updated_at'])),
      scheduledPayments:rows('scheduled_payments').filter(row=>row.active||payments.some(item=>item.payment_id===row.id)).map(row=>({...pick(row,['id','name','amount_cents','cadence','start_day','active']),account_name:name('finance_accounts',row.account_id),category_name:name('finance_categories',row.category_id)})),
      payments,
      portfolios,
    },
    planning:{tasks:tasks.map(row=>pick(row,['id','title','day','due_day','status','updated_at'])),weeklyPlans:plans,recurringTasks:rows('recurring_tasks').filter(row=>row.active&&day(row,'start_day')<=end).map(row=>({...pick(row,['id','title','start_day','active']),weekdays:jsonValue(row.weekdays_json,[])})),recurringSkips:range('recurring_skips').map(row=>pick(row,['template_id','day']))},
    personalMetrics:{definitions:metrics.filter(row=>row.active||range('metric_entries').some(entry=>entry.metric_id===row.id)).map(row=>({...pick(row,['id','name','kind','unit','active']),options:jsonValue(row.options_json,[])})),entries:metricEntries},
    routines:rows('routines').map(row=>{const parsed=jsonValue(row.steps_json,[]);return {id:row.id,steps:(Array.isArray(parsed)?parsed:[]).map(id=>{const key=String(id),slot=careSlots.find(item=>`slot:${item.id}`===key);return {id:key,name:({wake:'Время подъёма',weight:'Вес',reflection:'Вопрос вечера',journal:'Запись дня'} as Record<string,string>)[key]??(slot?`${name('habits',slot.habit_id)} · ${slot.label}`:key.startsWith('habit:')?name('habits',Number(key.slice(6))):null)};})};}),
    careSchedule,
    focusSessions:range('focus_sessions').map(row=>pick(row,['id','title','task_id','mode','target_seconds','day','state','elapsed_seconds','started_at','ended_at'])),
    eveningAnswers:range('evening_answers').map(row=>pick(row,['day','question','answer','skipped'])),
    experiments:rows('experiments').filter(row=>day(row,'start_day')<=end&&shiftDay(day(row,'start_day'),Math.max(0,Number(row.duration)-1))>=start).map(row=>({...pick(row,['id','title','rule','start_day','duration','active']),marks:range('experiment_logs').filter(mark=>mark.experiment_id===row.id).map(mark=>pick(mark,['day','done']))})),
    career:{jobs:jobs.map(row=>pick(row,['id','title','company','url','source','city','work_mode','salary_from','salary_to','currency','original_text','notes','status','created_at','updated_at'])),events:jobEvents.map(row=>({...pick(row,['job_id','old_status','new_status','occurred_at','comment']),job:rows('jobs').find(job=>job.id===row.job_id)?.title??null,company:rows('jobs').find(job=>job.id===row.job_id)?.company??null})),experience:rows('experience_entries').map(row=>pick(row,['id','organization','position','start_date','end_date','description','skills','tools'])),cases:rows('experience_cases').map(row=>pick(row,['id','entry_id','title','situation','task','actions','result','skills','tools','tags'])),caseLinks:rows('job_experience_links').filter(row=>jobIds.has(row.job_id)).map(row=>pick(row,['job_id','case_id'])),generatedMaterials:rows('job_ai_analyses').filter(row=>jobIds.has(row.job_id)&&within(row,'created_at')).map(row=>pick(row,['job_id','kind','content','created_at']))},
  };
}
