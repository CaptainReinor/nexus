import type { Row,Snapshot } from './snapshot-sync';

// Stored as an internal setting so older server versions can transport it unchanged.
export const recordClockSetting='_nexus_record_edits';
export type RecordClock={at:number;hash:string};
export type RecordClocks=Record<string,RecordClock>;
export const recordKey=(table:string,key:string)=>`${table}:${key}`;
export const isClockRow=(table:string,row:Row)=>table==='settings'&&row.key===recordClockSetting;
export function fingerprint(row:Row|null|undefined):string{
  const text=row?JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]))):'null';
  let a=2166136261,b=2246822519;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}
  return `${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}
export function readRecordClocks(snapshot:Snapshot):RecordClocks{
  try{
    const raw=JSON.parse(String(snapshot.tables.settings?.find(row=>row.key===recordClockSetting)?.value??'{}')) as Record<string,RecordClock>;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
    return Object.fromEntries(Object.entries(raw).filter(([key,value])=>key.length<1000&&value&&Number.isSafeInteger(value.at)&&value.at>=0&&value.at<=Date.now()+86_400_000&&/^[0-9a-f]{16}$/.test(value.hash)));
  }catch{return {};}
}
export function recordTime(clocks:RecordClocks,table:string,key:string,row:Row|undefined|null):number{
  const clock=clocks[recordKey(table,key)];
  if(clock?.hash===fingerprint(row))return clock.at;
  // Old records did not carry clocks. Only explicit edit timestamps are useful;
  // exportedAt changes even for reads and must never decide the winner.
  const legacy=row?.updated_at?Date.parse(String(row.updated_at)):0;
  return Number.isFinite(legacy)?Math.max(0,legacy):0;
}
export function writeRecordClocks(snapshot:Snapshot,clocks:RecordClocks){
  if(!Object.keys(clocks).length)return;
  snapshot.tables.settings=(snapshot.tables.settings??[]).filter(row=>!isClockRow('settings',row));
  snapshot.tables.settings.push({key:recordClockSetting,value:JSON.stringify(Object.fromEntries(Object.entries(clocks).sort(([a],[b])=>a.localeCompare(b))))});
}
export function stampRecordChanges(before:Snapshot,after:Snapshot,keyOf:(table:string,row:Row)=>string,now=Date.now()){
  const clocks={...readRecordClocks(before),...readRecordClocks(after)};
  const time=Object.values(clocks).reduce((max,clock)=>Math.max(max,clock.at+1),now);
  let changed=false;
  for(const table of new Set([...Object.keys(before.tables),...Object.keys(after.tables)])){
    const previous=new Map((before.tables[table]??[]).filter(row=>!isClockRow(table,row)).map(row=>[keyOf(table,row),row]));
    const next=new Map((after.tables[table]??[]).filter(row=>!isClockRow(table,row)).map(row=>[keyOf(table,row),row]));
    for(const key of new Set([...previous.keys(),...next.keys()]))if(fingerprint(previous.get(key))!==fingerprint(next.get(key))){clocks[recordKey(table,key)]={at:time,hash:fingerprint(next.get(key))};changed=true;}
  }
  if(changed)writeRecordClocks(after,clocks);
}
