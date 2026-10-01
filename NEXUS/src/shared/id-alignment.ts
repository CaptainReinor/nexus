import type { Snapshot,Row } from './snapshot-sync';
import { readRecordClocks,recordKey,recordTime,fingerprint,writeRecordClocks } from './record-clocks';
// Two offline devices may independently create the same named account/category.
// Reuse the server identity and keep all child records attached to that identity.
export function alignNewParents(base:Snapshot,input:Snapshot,remote:Snapshot,keyOf:(table:string,row:Row)=>string):Snapshot{
  const local=structuredClone(input),original=readRecordClocks(input),clocks={...original};
  const groups=[{table:'finance_accounts',fields:['name'],children:[['finance_transactions','account_id'],['finance_transactions','target_account_id']]},{table:'finance_categories',fields:['name','kind'],children:[['finance_transactions','category_id']]},{table:'investment_accounts',fields:['name'],children:[['investment_entries','account_id']]}];
  for(const group of groups){
    const known=new Set((base.tables[group.table]??[]).map(x=>x.id));
    for(const row of local.tables[group.table]??[]){
      if(known.has(row.id))continue;
      const other=remote.tables[group.table]?.find(x=>x.id!==row.id&&!known.has(x.id)&&group.fields.every(field=>x[field]===row[field]));if(!other)continue;
      const oldId=row.id,oldKey=keyOf(group.table,row),time=recordTime(original,group.table,oldKey,row);
      row.id=other.id;if(time)clocks[recordKey(group.table,keyOf(group.table,row))]={at:time,hash:fingerprint(row)};
      delete clocks[recordKey(group.table,oldKey)];
      if(group.table==='finance_accounts'){
        const setting=local.tables.settings?.find(x=>x.key==='primaryAccountId'&&String(x.value)===String(oldId));
        if(setting){const key=keyOf('settings',setting),at=recordTime(clocks,'settings',key,setting);setting.value=JSON.stringify(row.id);if(at)clocks[recordKey('settings',key)]={at,hash:fingerprint(setting)};}
      }
      for(const [table,field] of group.children)for(const child of local.tables[table]??[])if(child[field]===oldId){
        const key=keyOf(table,child),at=recordTime(clocks,table,key,child);child[field]=row.id;
        const newKey=keyOf(table,child);if(newKey!==key)delete clocks[recordKey(table,key)];
        if(at)clocks[recordKey(table,newKey)]={at,hash:fingerprint(child)};
      }
    }
  }
  writeRecordClocks(local,clocks);return local;
}
