import type { DB } from './database';
import { insights } from '../shared/insights';
import { serializeBackup,schemaVersion } from './database';
import type { Snapshot,Row } from '../shared/snapshot-sync';
import { growthTables,growthData,saveGoal,savePlan,saveRepeat,saveMetric,saveMetricEntry,removePlan,materializeRepeats,removeTask,type GrowthAPI,type GoalInput,type PlanInput,type RepeatInput,type MetricInput,type MetricEntryInput } from '../shared/growth';

export class GrowthRepository implements GrowthAPI {
  constructor(private db:DB){}
  snapshot():Snapshot{return {format:'nexus-backup',version:schemaVersion,exportedAt:new Date().toISOString(),tables:Object.fromEntries([...growthTables,'day_tasks'].map(t=>[t,this.db.prepare(`SELECT * FROM ${t}`).all() as Row[]]))};}
  private change(fn:(s:Snapshot)=>void){const before=this.snapshot(),s=structuredClone(before);fn(s);const tables=[...growthTables,'day_tasks'];this.db.transaction(()=>{for(const table of [...tables].reverse()){const ids=new Set(s.tables[table].map(r=>r.id));for(const row of before.tables[table])if(!ids.has(row.id))this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(String(row.id));}for(const table of tables)for(const row of s.tables[table]){const old=before.tables[table].find(r=>r.id===row.id);if(old&&JSON.stringify(old)===JSON.stringify(row))continue;const keys=Object.keys(row);this.db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${keys.filter(k=>k!=='id').map(k=>`"${k}"=excluded."${k}"`).join(',')}`).run(...keys.map(k=>row[k] as string|number|null));}})();}

  materialize(){const s=this.snapshot();if(!materializeRepeats(s))return false;this.change(next=>{next.tables.day_tasks=s.tables.day_tasks;});return true;}
  async insights(start:string,end:string){return insights(JSON.parse(serializeBackup(this.db)) as Snapshot,start,end);}
  async list(){this.materialize();return growthData(this.snapshot());}
  async goal(x:GoalInput){this.change(s=>saveGoal(s,x));}
  async plan(x:PlanInput){this.change(s=>savePlan(s,x));}
  async repeat(x:RepeatInput){this.change(s=>{saveRepeat(s,x);materializeRepeats(s);});}
  async metric(x:MetricInput){this.change(s=>saveMetric(s,x));}
  async entry(x:MetricEntryInput){this.change(s=>saveMetricEntry(s,x));}
  async removePlan(id:string){this.change(s=>removePlan(s,id));}
  removeTask(id:string){this.change(s=>removeTask(s,id));}
}
