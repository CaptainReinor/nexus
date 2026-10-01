import { fingerprint,isClockRow,readRecordClocks,recordKey,recordTime,writeRecordClocks } from "./record-clocks";
import { alignNewParents } from './id-alignment';
export type Row=Record<string,unknown>;
export type Snapshot={format:'nexus-backup';version:number;exportedAt:string;tables:Record<string,Row[]>};
export type State={revision:number;snapshot:Snapshot|null};
export type LocalEnvelope={base:State;local:Snapshot|null;conflicts?:Conflict[]};
export type Conflict={table:string;key:string;fields:string[];local:Row|null;remote:Row|null};
export type SyncStatus='loading'|'saved'|'pending'|'syncing'|'offline'|'conflict'|'storage-error';
const naturalKeys:Record<string,string[]>={settings:['key'],day_details:['day'],habit_logs:['habit_id','day'],health_daily_entries:['day'],weight_entries:['day'],finance_budgets:['month'],investment_entries:['account_id','day'],job_experience_links:['job_id','case_id']};
export const rowKey=(table:string,row:Row)=>JSON.stringify((naturalKeys[table]??['id']).map(key=>row[key]));
const equal=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
const fieldsEqual=(a:Row|undefined|null,b:Row|undefined|null)=>a===b||Boolean(a&&b&&[...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>equal(a[k],b[k])));
// First entries on two devices share these empty defaults; an untouched default
// must not overwrite a fact entered on the other device.
function initialDay(table:string,row:Row):Row|undefined{
  if(table==='day_details')return {day:row.day,contexts_json:'[]',achievement:'',appetite:null,sleep_quality:null,tension:null};
  if(table==='health_daily_entries')return {day:row.day,sleep_start:null,sleep_end:null,sleep_minutes:null,mood:null,energy:null,nutrition:null,comment:''};
}
export function normalizeSleep(snapshot:Snapshot,base:Snapshot){
  for(const row of snapshot.tables.health_daily_entries??[]){
    const old=base.tables.health_daily_entries?.find(item=>item.day===row.day);
    if(old?.sleep_start===row.sleep_start&&old?.sleep_end===row.sleep_end)continue;
    if(typeof row.sleep_start==='string'&&typeof row.sleep_end==='string'&&/^\d{2}:\d{2}$/.test(row.sleep_start)&&/^\d{2}:\d{2}$/.test(row.sleep_end)){
      const [sh,sm]=row.sleep_start.split(':').map(Number),[eh,em]=row.sleep_end.split(':').map(Number);
      row.sleep_minutes=((eh*60+em)-(sh*60+sm)+1440)%1440||1440;
    }else row.sleep_minutes=null;
  }
}
export function sameSnapshot(a:Snapshot|null,b:Snapshot|null):boolean{
  if(!a||!b)return a===b;
  return [...new Set([...Object.keys(a.tables),...Object.keys(b.tables)])].every(table=>{
    const left=a.tables[table]??[],right=b.tables[table]??[];
    if(left.length!==right.length)return false;
    const index=new Map(right.map(row=>[rowKey(table,row),row]));
    return left.every(row=>fieldsEqual(row,index.get(rowKey(table,row))));
  });
}

export function mergeSnapshots(base:Snapshot,local:Snapshot,remote:Snapshot,choices:Record<string,'local'|'remote'>={}):{snapshot:Snapshot;conflicts:Conflict[]}{
  local=alignNewParents(base,local,remote,rowKey);
  const snapshot=structuredClone(remote),conflicts:Conflict[]=[];
  const localClocks=readRecordClocks(local),remoteClocks=readRecordClocks(remote),baseClocks=readRecordClocks(base);
  snapshot.version=Math.max(local.version,remote.version);
  for(const table of new Set([...Object.keys(base.tables),...Object.keys(local.tables)])){
    const before=new Map((base.tables[table]??[]).map(r=>[rowKey(table,r),r]));
    const after=new Map((local.tables[table]??[]).map(r=>[rowKey(table,r),r]));
    const incoming=new Map((remote.tables[table]??[]).map(r=>[rowKey(table,r),r]));
    const result=new Map(incoming);
    const localKeys=Object.keys(localClocks).filter(key=>key.startsWith(table+':')).map(key=>key.slice(table.length+1));
    for(const key of new Set([...before.keys(),...after.keys(),...localKeys])){
      const edited=after.get(key),other=incoming.get(key),old=before.get(key)??(edited&&other?initialDay(table,edited):undefined);
      if((edited&&isClockRow(table,edited))||(old&&isClockRow(table,old)))continue;
      if(fieldsEqual(old,edited)){
        const localTime=recordTime(localClocks,table,key,edited);
        if(localTime<=Math.max(recordTime(baseClocks,table,key,old),recordTime(remoteClocks,table,key,other)))continue;
        if(edited)result.set(key,{...edited,...(naturalKeys[table]&&other&&'id' in other?{id:other.id}:{})});else result.delete(key);
        continue;
      }
      const newer=recordTime(localClocks,table,key,edited)>recordTime(remoteClocks,table,key,other)?'local':'remote';
      const choice=choices[`${table}:${key}`]??newer;
      if(!edited||!other){
        if(!fieldsEqual(edited,other)&&choice==='remote'&&(!fieldsEqual(old,other)||(!other&&recordTime(remoteClocks,table,key,other)>0)))continue;
        if(edited)result.set(key,structuredClone(edited));else result.delete(key);
        continue;
      }
      const next={...other},collisions:string[]=[];
      for(const field of new Set([...Object.keys(old??{}),...Object.keys(edited)])){
        if(equal(old?.[field],edited[field]))continue;
        // Natural-key rows keep the remote primary key for referential integrity.
        if(field==='id'&&naturalKeys[table])continue;
        if(field==='updated_at'){next[field]=[String(edited[field]??''),String(other[field]??'')].sort().at(-1);continue;}
        if(!equal(old?.[field],other[field])&&!equal(edited[field],other[field]))collisions.push(field);
        if(choice!=='remote'||!collisions.includes(field)){
          if(edited[field]===undefined)delete next[field];else next[field]=edited[field];
        }
      }

      result.set(key,next);
    }
    snapshot.tables[table]=[...result.values()];
  }
  normalizeSleep(snapshot,base);
  if(snapshot.tables.daily_journals)snapshot.tables.daily_journals.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||Number(b.id)-Number(a.id)).splice(3);
  const clocks={...remoteClocks};
  for(const table of new Set([...Object.keys(local.tables),...Object.keys(remote.tables)])){
    const left=new Map((local.tables[table]??[]).filter(row=>!isClockRow(table,row)).map(row=>[rowKey(table,row),row]));
    const right=new Map((remote.tables[table]??[]).filter(row=>!isClockRow(table,row)).map(row=>[rowKey(table,row),row]));
    const merged=new Map((snapshot.tables[table]??[]).filter(row=>!isClockRow(table,row)).map(row=>[rowKey(table,row),row]));
    const keys=new Set([...left.keys(),...right.keys(),...Object.keys(localClocks).filter(key=>key.startsWith(table+':')).map(key=>key.slice(table.length+1)),...Object.keys(remoteClocks).filter(key=>key.startsWith(table+':')).map(key=>key.slice(table.length+1))]);
    for(const key of keys){const at=Math.max(recordTime(localClocks,table,key,left.get(key)),recordTime(remoteClocks,table,key,right.get(key)));if(at>0)clocks[recordKey(table,key)]={at,hash:fingerprint(merged.get(key))};}
  }
  writeRecordClocks(snapshot,clocks);
  return {snapshot,conflicts};
}
