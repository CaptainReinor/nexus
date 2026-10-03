import { z } from './validation';
import { localDay, weekStart } from './domain';
import type { Snapshot, Row } from './snapshot-sync';

export const growthTables=['financial_goals','weekly_plans','recurring_tasks','recurring_skips','custom_metrics','metric_entries'] as const;
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(new Date(`${value}T12:00:00`).getTime())&&localDay(new Date(`${value}T12:00:00`))===value);
const identity=z.string().uuid(),name=z.string().trim().min(1).max(120),flag=z.union([z.literal(0),z.literal(1)]);
export const goalSchema=z.object({id:identity.optional(),name,target_cents:z.number().int().positive().safe(),saved_cents:z.number().int().nonnegative().safe(),deadline:dateSchema.nullable(),active:flag}).strict();
export const planSchema=z.object({id:identity.optional(),title:name,week:dateSchema,scheduled_day:dateSchema.nullable(),status:z.enum(['open','done'])}).strict().refine(x=>weekStart(new Date(`${x.week}T12:00:00`),1)===x.week,'Выберите неделю.').refine(x=>!x.scheduled_day||weekStart(new Date(`${x.scheduled_day}T12:00:00`),1)===x.week,'Дата должна входить в выбранную неделю.');
export const repeatSchema=z.object({id:identity.optional(),title:name,weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),start_day:dateSchema,active:flag}).strict();
export const metricSchema=z.object({id:identity.optional(),name,kind:z.enum(['number','boolean','choice']),unit:z.string().trim().max(20),options:z.array(z.string().trim().min(1).max(60)).max(8),active:flag}).strict().refine(x=>x.kind!=='choice'||new Set(x.options).size>=2,'Добавьте хотя бы два варианта.');
export const metricValueSchema=z.union([z.number().finite().min(0).max(1e9),z.boolean(),z.string().max(60)]);
export const metricEntrySchema=z.object({metric_id:identity,day:dateSchema,value:metricValueSchema.nullable()}).strict();
export type GoalInput=z.infer<typeof goalSchema>;
export type PlanInput=z.infer<typeof planSchema>;
export type RepeatInput=z.infer<typeof repeatSchema>;
export type MetricInput=z.infer<typeof metricSchema>;
export type MetricEntryInput=z.infer<typeof metricEntrySchema>;
export type Goal=Omit<GoalInput,'id'>&{id:string;updated_at:string};
export type WeeklyPlan={id:string;title:string;week:string;task_id:string|null;status:'open'|'done';updated_at:string};
export type RecurringTask={id:string;title:string;weekdays_json:string;start_day:string;active:0|1;updated_at:string};
export type CustomMetric={id:string;name:string;kind:MetricInput['kind'];unit:string;options_json:string;active:0|1;updated_at:string};
export type MetricEntry={id:string;metric_id:string;day:string;value_json:string;updated_at:string};
export type GrowthData={goals:Goal[];plans:WeeklyPlan[];repeats:RecurringTask[];metrics:CustomMetric[];entries:MetricEntry[];tasks:Row[]};
export interface GrowthAPI{insights(start:string,end:string):Promise<import('./insights').Insights>;list():Promise<GrowthData>;goal(input:GoalInput):Promise<void>;plan(input:PlanInput):Promise<void>;repeat(input:RepeatInput):Promise<void>;metric(input:MetricInput):Promise<void>;entry(input:MetricEntryInput):Promise<void>;removePlan(id:string):Promise<void>}
export function ensureGrowth(s:Snapshot){for(const table of growthTables)s.tables[table]??=[];s.version=Math.max(s.version,8);}
export function growthData(s:Snapshot):GrowthData{return {goals:(s.tables.financial_goals??[]) as unknown as Goal[],plans:(s.tables.weekly_plans??[]) as unknown as WeeklyPlan[],repeats:(s.tables.recurring_tasks??[]) as unknown as RecurringTask[],metrics:(s.tables.custom_metrics??[]) as unknown as CustomMetric[],entries:(s.tables.metric_entries??[]) as unknown as MetricEntry[],tasks:s.tables.day_tasks??[]};}
const list=(s:Snapshot,table:string)=>s.tables[table]??(s.tables[table]=[]);
function put(s:Snapshot,table:string,row:Row){const rows=list(s,table),index=rows.findIndex(x=>x.id===row.id);if(index<0)rows.push(row);else rows[index]=row;}
const now=()=>new Date().toISOString();
export function saveGoal(s:Snapshot,input:GoalInput){ensureGrowth(s);const x=goalSchema.parse(input);put(s,'financial_goals',{...x,id:x.id??crypto.randomUUID(),updated_at:now()});}
export function savePlan(s:Snapshot,input:PlanInput){ensureGrowth(s);const x=planSchema.parse(input),id=x.id??crypto.randomUUID(),old=list(s,'weekly_plans').find(r=>r.id===id);let taskId=old?.task_id as string|undefined;
  if(x.scheduled_day){taskId??=crypto.randomUUID();const prior=list(s,'day_tasks').find(r=>r.id===taskId);put(s,'day_tasks',{id:taskId,title:x.title,day:prior?.day??localDay(),due_day:x.scheduled_day,status:x.status,created_at:prior?.created_at??now(),updated_at:now()});}
  else if(taskId){s.tables.day_tasks=list(s,'day_tasks').filter(r=>r.id!==taskId);taskId=undefined;}
  put(s,'weekly_plans',{id,title:x.title,week:x.week,task_id:taskId??null,status:x.status,updated_at:now()});
}
export function removePlan(s:Snapshot,id:string){identity.parse(id);const plan=list(s,'weekly_plans').find(x=>x.id===id);if(plan?.task_id)s.tables.day_tasks=list(s,'day_tasks').filter(x=>x.id!==plan.task_id);s.tables.weekly_plans=list(s,'weekly_plans').filter(x=>x.id!==id);}
export function saveRepeat(s:Snapshot,input:RepeatInput){ensureGrowth(s);const x=repeatSchema.parse(input);if(x.id)s.tables.day_tasks=list(s,'day_tasks').filter(task=>!(task.status==='open'&&String(task.day)>=localDay()&&(task.recurrence_id===x.id||task.id===occurrenceId(x.id!,String(task.day)))));put(s,'recurring_tasks',{id:x.id??crypto.randomUUID(),title:x.title,weekdays_json:JSON.stringify([...new Set(x.weekdays)].sort()),start_day:x.start_day,active:x.active,updated_at:now()});}
// Stable UUID per template/date lets two offline devices produce the same task.
export function occurrenceId(template:string,day:string){let hash=2166136261;const seed=template+day;const words=[];for(let i=0;i<4;i++){for(const char of seed+String(i)){hash=Math.imul(hash^char.charCodeAt(0),16777619);}words.push((hash>>>0).toString(16).padStart(8,'0'));}const hex=words.join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;}
export function materializeRepeats(s:Snapshot,today=localDay()):boolean{let changed=false;const tasks=list(s,'day_tasks'),skips=list(s,'recurring_skips');for(const rule of growthData(s).repeats.filter(x=>x.active)){let weekdays:number[];try{weekdays=JSON.parse(rule.weekdays_json) as number[];}catch{continue;}
  for(let offset=-7;offset<=7;offset++){const date=new Date(`${today}T12:00:00`);date.setDate(date.getDate()+offset);const day=localDay(date),id=occurrenceId(rule.id,day);if(day<rule.start_day||!weekdays.includes((date.getDay()+6)%7)||tasks.some(x=>x.id===id)||skips.some(x=>x.id===id))continue;tasks.push({id,recurrence_id:rule.id,title:rule.title,day,due_day:day,status:'open',created_at:`${day}T00:00:00.000Z`,updated_at:`${day}T00:00:00.000Z`});changed=true;}}
  return changed;
}
export function removeTask(s:Snapshot,id:string){const task=list(s,'day_tasks').find(x=>x.id===id);if(task)for(const repeat of growthData(s).repeats){const original=String(task.day);if(task.recurrence_id===repeat.id||occurrenceId(repeat.id,original)===id)put(s,'recurring_skips',{id,template_id:repeat.id,day:original});}s.tables.day_tasks=list(s,'day_tasks').filter(x=>x.id!==id);}
export function saveMetric(s:Snapshot,input:MetricInput){ensureGrowth(s);const x=metricSchema.parse(input),old=list(s,'custom_metrics').find(row=>row.id===x.id);if(old&&old.kind!==x.kind&&list(s,'metric_entries').some(row=>row.metric_id===x.id))throw new Error('У показателя с записями нельзя менять тип.');put(s,'custom_metrics',{id:x.id??crypto.randomUUID(),name:x.name,kind:x.kind,unit:x.unit,options_json:JSON.stringify([...new Set(x.options)]),active:x.active,updated_at:now()});}
export function metricOptions(metric:CustomMetric):string[]{try{return JSON.parse(metric.options_json) as string[];}catch{return [];}}
export function metricValue(entry:MetricEntry|undefined):number|boolean|string|null{try{return entry?metricValueSchema.parse(JSON.parse(entry.value_json)):null;}catch{return null;}}
export function saveMetricEntry(s:Snapshot,input:MetricEntryInput){ensureGrowth(s);const x=metricEntrySchema.parse(input),metric=growthData(s).metrics.find(m=>m.id===x.metric_id&&m.active);if(!metric)throw new Error('Показатель удалён.');const id=`${x.metric_id}:${x.day}`;if(x.value===null){s.tables.metric_entries=list(s,'metric_entries').filter(r=>r.id!==id);return;}
  if((metric.kind==='number'&&typeof x.value!=='number')||(metric.kind==='boolean'&&typeof x.value!=='boolean')||(metric.kind==='choice'&&(typeof x.value!=='string'||!metricOptions(metric).includes(x.value))))throw new Error('Проверьте значение показателя.');
  put(s,'metric_entries',{id,metric_id:x.metric_id,day:x.day,value_json:JSON.stringify(x.value),updated_at:now()});
}
export function knownMetrics(s:Snapshot){return growthData(s).metrics.filter(x=>x.active).map(x=>({id:x.id,name:x.name,kind:x.kind,unit:x.unit,options:metricOptions(x)}));}
export function restrictMetrics(s:Snapshot,entries:{metricId:string;value:number|boolean|string}[]){return entries.filter(x=>{const clone:Snapshot={...s,tables:{...s.tables,metric_entries:[]}};try{saveMetricEntry(clone,{metric_id:x.metricId,day:localDay(),value:x.value});return true;}catch{return false;}});}

export function filterMetricSuggestions(known:ReturnType<typeof knownMetrics>,entries:{metricId:string;value:number|boolean|string}[]){return entries.filter((x,i)=>{const m=known.find(m=>m.id===x.metricId);return !!m&&!entries.slice(0,i).some(other=>other.metricId===x.metricId)&&((m.kind==='number'&&typeof x.value==='number'&&x.value>=0)||(m.kind==='boolean'&&typeof x.value==='boolean')||(m.kind==='choice'&&typeof x.value==='string'&&m.options.includes(x.value)));});}
