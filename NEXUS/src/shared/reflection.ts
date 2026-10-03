import {z} from './validation';
import {dateSchema} from './growth';
import {ensureDaily,put,records} from './daily-core';
import type {Snapshot} from './snapshot-sync';
export const reflectionSchema=z.object({day:dateSchema,question:z.string().min(1).max(300),answer:z.string().trim().max(2000),skipped:z.boolean()}).strict();
export type ReflectionInput=z.infer<typeof reflectionSchema>;
export type EveningAnswer={id:string;day:string;question:string;answer:string;skipped:number;updated_at:string};
export function eveningQuestion(s:Snapshot,day:string):string{const old=records(s,'evening_answers').find(r=>r.day===day);if(old)return String(old.question);const detail=records(s,'day_details').find(r=>r.day===day),health=records(s,'health_daily_entries').find(r=>r.day===day);if(detail?.tension==='overloaded')return 'Что сегодня забрало больше всего сил — и что завтра можно убрать?';if(typeof health?.sleep_minutes==='number'&&health.sleep_minutes<360)return 'Что помешало выспаться и как сегодня ляжешь раньше?';if(records(s,'day_tasks').some(t=>t.status==='open'&&String(t.due_day)<=day))return 'Какое дело откладывал и какой первый шаг сделаешь завтра?';const questions=['Что сегодня получилось лучше, чем ожидал?','На что ушло время, которое хотел потратить иначе?','Что сегодня стоило повторить завтра?','Какой момент дня хочется сохранить?','Что завтра сделаешь проще?'];return questions[Math.abs(Math.floor(Date.parse(`${day}T12:00:00Z`)/86400000))%questions.length];}
export function saveReflection(s:Snapshot,input:ReflectionInput){ensureDaily(s);const x=reflectionSchema.parse(input);put(s,'evening_answers',{id:x.day,day:x.day,question:x.question,answer:x.skipped?'':x.answer,skipped:Number(x.skipped),updated_at:new Date().toISOString()});}
