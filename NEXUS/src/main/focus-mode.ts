import type {DB} from './database';
import {schemaVersion,backupTables} from './database';
import type {Row,Snapshot} from '../shared/snapshot-sync';
import {configureFocus,updateFocusConfig,saveFocusTurn,removeFocusFood,focusConfig,focusFacts,type FocusAPI,type FocusConfig,type FocusTurnInput} from '../shared/focus-mode';
import {focusSnapshot,initializeFocus,publishFocus} from '../shared/focus-isolation';
import {focusDiagnostic} from '../shared/focus-diagnostics';
import type {AIGateway} from './ai';
const writeTables=['settings','finance_accounts','finance_categories','weight_entries','health_daily_entries','workouts','finance_transactions','mentor_turns','food_entries','activity_entries','focus_weights','focus_sleep','focus_money'];
export class FocusModeRepository implements FocusAPI{
 constructor(private db:DB,private ai:AIGateway){this.change(s=>initializeFocus(s));}
 private readSnapshot():Snapshot{return {format:'nexus-backup',version:schemaVersion,exportedAt:new Date().toISOString(),tables:Object.fromEntries(backupTables.map(table=>[table,this.db.prepare(`SELECT * FROM ${table}`).all() as Row[]]))};}
 async snapshot():Promise<Snapshot>{return focusSnapshot(this.readSnapshot());}
 private change(fn:(s:Snapshot)=>void){
  const before=this.readSnapshot(),after=structuredClone(before);fn(after);
  this.db.transaction(()=>{
   for(const table of [...writeTables].reverse()){
    const key=table==='settings'?'key':(table==='health_daily_entries'||table==='focus_sleep')?'day':'id',ids=new Set(after.tables[table].map(r=>r[key]));
    for(const old of before.tables[table])if(!ids.has(old[key]))this.db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(old[key] as string|number);
   }
   for(const table of writeTables){const primary=table==='settings'?'key':(table==='health_daily_entries'||table==='focus_sleep')?'day':'id',previous=new Map(before.tables[table].map(row=>[row[primary],row]));
    for(const row of after.tables[table]){const old=previous.get(row[primary]);if(old&&JSON.stringify(old)===JSON.stringify(row))continue;const keys=Object.keys(row);this.db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) ON CONFLICT(${primary}) DO UPDATE SET ${keys.filter(k=>k!==primary).map(k=>`"${k}"=excluded."${k}"`).join(',')}`).run(...keys.map(k=>row[k] as string|number|null));}
   }
  })();
 }
 async updateConfig(patch:Parameters<FocusAPI['updateConfig']>[0]){this.change(s=>updateFocusConfig(s,patch));}
 async removeFood(input:Parameters<FocusAPI['removeFood']>[0]){this.change(s=>removeFocusFood(s,input));}
 async publish(){let result={written:0,skipped:0};this.change(s=>{result=publishFocus(s);});return result;}
 async configure(config:FocusConfig,enableAI=false){this.change(s=>configureFocus(s,config,enableAI));}
 async send(input:Parameters<FocusAPI['send']>[0]){const snapshot=await this.snapshot();return this.ai.mentor(focusConfig(snapshot).model,focusFacts(snapshot,input.day,input.text),input.overrideBudget,snapshot);}
 async save(input:FocusTurnInput){try{await this.change(s=>saveFocusTurn(s,input));}catch(error){this.ai.recordFocusDiagnostic?.(focusDiagnostic({stage:'save',model:focusConfig(this.readSnapshot()).model,requestId:'',day:input.day,text:input.text,response:JSON.stringify({reply:input.reply,actions:input.actions}),attempt:0},error));throw error;}}
 async transcribe(input:Parameters<FocusAPI['transcribe']>[0]){return this.ai.transcribe(input.base64,input.format,input.overrideBudget);}
}
