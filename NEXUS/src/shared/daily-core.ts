import type {Snapshot,Row} from './snapshot-sync';
import {localDay} from './domain';
export const dailyTables=['habit_preferences','care_slots','care_checks','routines','scheduled_payments','payment_occurrences','experiments','experiment_logs','focus_sessions','evening_answers'] as const;
export function ensureDaily(s:Snapshot){for(const table of dailyTables)s.tables[table]??=[];s.version=Math.max(s.version,11);}
export const records=(s:Snapshot,table:string)=>s.tables[table]??(s.tables[table]=[]);
export function put(s:Snapshot,table:string,row:Row,key='id'){const list=records(s,table),index=list.findIndex(x=>x[key]===row[key]);if(index<0)list.push(row);else list[index]=row;}
export function numericId(rows:readonly Row[]):number{let id:number;do{const words=crypto.getRandomValues(new Uint32Array(2));id=words[0]*65536+(words[1]>>>16)||1;}while(rows.some(r=>r.id===id));return id;}
export const shiftDay=(day:string,days:number)=>{const date=new Date(`${day}T12:00:00`);date.setDate(date.getDate()+days);return localDay(date);};
