import type { DB } from './database';
import { serializeBackup } from './database';
import type { Snapshot } from '../shared/snapshot-sync';
import { applyLife,lifeData,patchDay,updateTask,saveMemory,saveReview,coachFacts,type DayLifeData,type DetailPatch,type LifeSuggestions,type CoachReview,type Marker } from '../shared/life';

export class DayLifeRepository {
  constructor(private db:DB){}
  snapshot():Snapshot{return JSON.parse(serializeBackup(this.db)) as Snapshot;}
  private lifeSnapshot():Snapshot{return {format:'nexus-backup',version:9,exportedAt:new Date().toISOString(),tables:Object.fromEntries(['day_details','day_tasks','day_memories','assistant_reviews','settings','custom_metrics','metric_entries','weekly_plans','weekly_plan_tasks'].map(table=>[table,this.db.prepare(`SELECT * FROM ${table}`).all() as Record<string,unknown>[]]))};}
  list():DayLifeData{return lifeData(this.lifeSnapshot());}
  private change(fn:(snapshot:Snapshot)=>void):void{
    const before=this.lifeSnapshot(),snapshot=structuredClone(before);fn(snapshot);
    this.db.transaction(()=>{for(const table of ['day_details','day_tasks','day_memories','assistant_reviews','metric_entries','weekly_plans']){
      const primary=table==='day_details'?'day':'id',remaining=new Set(snapshot.tables[table].map(r=>r[primary]));
      for(const row of before.tables[table])if(!remaining.has(row[primary]))this.db.prepare(`DELETE FROM ${table} WHERE ${primary}=?`).run(String(row[primary]));
      for(const row of snapshot.tables[table]){const old=before.tables[table].find(r=>r[primary]===row[primary]);if(old&&JSON.stringify(old)===JSON.stringify(row))continue;const keys=Object.keys(row);this.db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(${primary}) DO UPDATE SET ${keys.filter(k=>k!==primary).map(k=>`"${k}"=excluded."${k}"`).join(',')}`).run(...keys.map(k=>row[k] as string|number|null));}
    }})();
  }

  patch(day:string,patch:DetailPatch){this.change(s=>patchDay(s,day,patch));}
  markers(fields:Marker[]){this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('dailyMarkers',JSON.stringify(fields));}
  task(input:{id?:string;title?:string;day:string;due_day:string;status?:'open'|'done'}){
    this.change(s=>updateTask(s,input));
  }
  memory(input:{id?:string;day:string;text:string}){
    this.change(s=>{if(!input.id){saveMemory(s,input.text,input.day);return;}const row=s.tables.day_memories.find(x=>x.id===input.id);if(!row)throw new Error('Воспоминание не найдено.');row.day=input.day;row.text=input.text;row.updated_at=new Date().toISOString();});
  }
  remove(table:'day_tasks'|'day_memories',id:string){this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);}
  apply(day:string,life:LifeSuggestions,keys:string[]){this.change(s=>applyLife(s,day,life,keys));}
  facts(start:string,end:string){return coachFacts(this.snapshot(),start,end);}
  saveReview(kind:'day'|'week',start:string,end:string,review:CoachReview){this.change(s=>saveReview(s,kind,start,end,review));}
}
