import type {DB} from './database';
import {schemaVersion} from './database';
import type {Snapshot,Row} from '../shared/snapshot-sync';
import {dailyTables} from '../shared/daily-core';
import {dailyData,type DailyAPI} from '../shared/daily';
import {saveCareConfig,markCare,type CareConfig,type CareMark} from '../shared/care';
import {saveRoutine,recordRoutineEntry,type RoutineInput,type RoutineEntry} from '../shared/routines';
import {savePayment,paymentAction,materializePayments,type PaymentInput,type PaymentAction} from '../shared/payments';
import {saveExperiment,markExperiment,type ExperimentInput,type experimentMarkSchema} from '../shared/experiments';
import {focusAction,type FocusInput} from '../shared/focus';
import {saveReflection,type ReflectionInput} from '../shared/reflection';
import type {z} from '../shared/validation';
const readTables=['settings','daily_journals','habits','habit_logs','weight_entries','health_daily_entries','finance_accounts','finance_categories','finance_transactions','day_tasks','day_details','custom_metrics','metric_entries',...dailyTables];
const writeTables=['habit_logs','weight_entries','health_daily_entries','finance_transactions',...dailyTables];
export class DailyRepository implements DailyAPI{
  constructor(private db:DB){}
  snapshot():Snapshot{return {format:'nexus-backup',version:schemaVersion,exportedAt:new Date().toISOString(),tables:Object.fromEntries(readTables.map(t=>[t,this.db.prepare(`SELECT * FROM ${t}`).all() as Row[]]))};}
  private change(fn:(s:Snapshot)=>void){const before=this.snapshot(),s=structuredClone(before);fn(s);this.db.transaction(()=>{for(const table of [...writeTables].reverse()){const primary=table==='health_daily_entries'?'day':'id',ids=new Set(s.tables[table].map(r=>r[primary]));for(const old of before.tables[table])if(!ids.has(old[primary]))this.db.prepare(`DELETE FROM ${table} WHERE ${primary}=?`).run(old[primary] as string|number);}for(const table of writeTables){const primary=table==='health_daily_entries'?'day':'id';for(const row of s.tables[table]){const old=before.tables[table].find(r=>r[primary]===row[primary]);if(old&&JSON.stringify(old)===JSON.stringify(row))continue;const keys=Object.keys(row);this.db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(${primary}) DO UPDATE SET ${keys.filter(k=>k!==primary).map(k=>`"${k}"=excluded."${k}"`).join(',')}`).run(...keys.map(k=>row[k] as string|number|null));}}})();}
  materialize(){const s=this.snapshot();if(!materializePayments(s))return false;this.change(next=>{next.tables.payment_occurrences=s.tables.payment_occurrences;});return true;}
  async list(){return dailyData(this.snapshot());}
  async careConfig(x:CareConfig){this.change(s=>saveCareConfig(s,x));}
  async careMark(x:CareMark){this.change(s=>markCare(s,x));}
  async routine(x:RoutineInput){this.change(s=>saveRoutine(s,x));}
  async routineEntry(x:RoutineEntry){this.change(s=>recordRoutineEntry(s,x));}
  async payment(x:PaymentInput){this.change(s=>savePayment(s,x));}
  async paymentAction(x:PaymentAction){this.change(s=>paymentAction(s,x));}
  async experiment(x:ExperimentInput){this.change(s=>saveExperiment(s,x));}
  async experimentMark(x:z.infer<typeof experimentMarkSchema>){this.change(s=>markExperiment(s,x));}
  async focus(x:FocusInput){this.change(s=>focusAction(s,x));}
  async reflection(x:ReflectionInput){this.change(s=>saveReflection(s,x));}
}
