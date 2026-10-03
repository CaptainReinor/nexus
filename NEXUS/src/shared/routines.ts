import {z} from './validation';
import {dateSchema} from './growth';
import {ensureDaily,put,records,numericId} from './daily-core';
import {sleepDuration} from './domain';
import type {Snapshot} from './snapshot-sync';
export const routineSchema=z.object({id:z.enum(['morning','evening']),steps:z.array(z.string().min(1).max(80)).max(30)}).strict();
export const routineEntrySchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('weight'),day:dateSchema,value:z.number().min(1).max(500)}).strict(),
  z.object({kind:z.literal('wake'),day:dateSchema,value:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).strict(),
  z.object({kind:z.literal('habit'),day:dateSchema,habit_id:z.number().int().positive(),done:z.boolean()}).strict()
]);
export type RoutineInput=z.infer<typeof routineSchema>;
export type RoutineEntry=z.infer<typeof routineEntrySchema>;
export type Routine={id:'morning'|'evening';steps_json:string;updated_at:string};
export function saveRoutine(s:Snapshot,input:RoutineInput){ensureDaily(s);const x=routineSchema.parse(input);const available=new Set(['weight','wake','reflection','journal',...records(s,'care_slots').filter(x=>x.active).map(x=>`slot:${x.id}`),...records(s,'habits').filter(h=>h.active&&h.kind==='positive'&&h.period==='daily'&&h.format==='boolean').map(h=>`habit:${h.id}`)]);if(x.steps.some(step=>!available.has(step)))throw new Error('Один из пунктов больше недоступен.');put(s,'routines',{id:x.id,steps_json:JSON.stringify([...new Set(x.steps)]),updated_at:new Date().toISOString()});}
export function recordRoutineEntry(s:Snapshot,input:RoutineEntry){ensureDaily(s);const x=routineEntrySchema.parse(input);
  if(x.kind==='weight'){const list=records(s,'weight_entries'),old=list.find(r=>r.day===x.day);put(s,'weight_entries',{id:old?.id??numericId(list),day:x.day,weight_kg:x.value});}
  else if(x.kind==='wake'){const row=records(s,'health_daily_entries').find(r=>r.day===x.day)??{day:x.day,sleep_start:null,sleep_end:null,sleep_minutes:null,mood:null,energy:null,nutrition:null,comment:''};row.sleep_end=x.value;row.sleep_minutes=typeof row.sleep_start==='string'?sleepDuration(row.sleep_start,x.value):null;put(s,'health_daily_entries',row,'day');}
  else{const habit=records(s,'habits').find(h=>h.id===x.habit_id&&h.active&&h.kind==='positive'&&h.period==='daily'&&h.format==='boolean');if(!habit||records(s,'care_slots').some(slot=>slot.habit_id===habit.id&&slot.active))throw new Error('Отметьте отдельные выполнения этого пункта.');const list=records(s,'habit_logs'),old=list.find(r=>r.habit_id===x.habit_id&&r.day===x.day);put(s,'habit_logs',{id:old?.id??numericId(list),habit_id:x.habit_id,day:x.day,value:x.done?habit.target:0,status:x.done?'done':'skipped',comment:''});}
}
