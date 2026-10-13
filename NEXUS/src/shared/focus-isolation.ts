import type {Row,Snapshot} from './snapshot-sync';
import {initializeFoodPortions,removeLegacyDeletedFoods} from './food-portions';
import {localDay} from './domain';
import {put,numericId,records} from './daily-core';
import {fingerprint} from './record-clocks';
import {defaultExpenseCategories} from './finance-defaults';
import {learnProduct} from './product-catalog';
import {defaultMentorModel} from './focus-model';

export const focusSourceTables=['focus_weights','focus_sleep','focus_money'] as const;
const sourceMap={weight_entries:'focus_weights',health_daily_entries:'focus_sleep',finance_transactions:'focus_money'} as const;
const owned=['mentor_turns','food_entries','activity_entries','focus_products'] as const;
export const focusAccounts=[{id:1,name:'Дебет',active:1,opening_cents:0},{id:2,name:'Накопления',active:1,opening_cents:0}];
export const focusCategories=defaultExpenseCategories.map((name,i)=>({id:i+1,name,kind:'expense',active:1}));
export function focusBoundary(s:Snapshot):{day:string;at:string}|null{
 try{const value=JSON.parse(String(s.tables.settings?.find(r=>r.key==='focusBoundary')?.value));if(/^\d{4}-\d{2}-\d{2}$/.test(value.day)&&Number.isFinite(Date.parse(value.at)))return value;}catch{/* Older versions have no isolated session. */}return null;
}
export function initializeFocus(s:Snapshot,now=new Date().toISOString()){
 for(const table of [...focusSourceTables,...owned])records(s,table);
 initializeFoodPortions(records(s,'food_entries'));s.version=Math.max(s.version,15);
 if(!focusBoundary(s))put(s,'settings',{key:'focusBoundary',value:JSON.stringify({day:localDay(),at:now})},'key');
 const boundary=focusBoundary(s)!;
 s.tables.food_entries=removeLegacyDeletedFoods(records(s,'food_entries'),records(s,'mentor_turns').filter(r=>String(r.day)>=boundary.day&&String(r.created_at)>=boundary.at));
 if(!records(s,'settings').some(r=>r.key==='_focusProductsRevision')){
  for(const food of records(s,'food_entries').filter(r=>String(r.day)>=boundary.day&&String(r.updated_at)>=boundary.at))learnProduct(records(s,'focus_products'),food,{},now);
  for(const turn of records(s,'mentor_turns'))try{const links=JSON.parse(String(turn.links_json));let changed=false;for(const link of links)if(link.table==='food_entries'){const row=records(s,'food_entries').find(r=>r.id===link.key);if(row){const legacy={...row};delete legacy.product_id;delete legacy.nutrition_sources_json;if(fingerprint(legacy)===link.hash){link.hash=fingerprint(row);changed=true;}}}if(changed)turn.links_json=JSON.stringify(links);}catch{/* Legacy malformed history cannot be rewritten. */}
  put(s,'settings',{key:'_focusProductsRevision',value:'1'},'key');
 }
 if(!records(s,'settings').some(r=>r.key==='_focusModelRevision')){
  const config=records(s,'settings').find(r=>r.key==='focusConfig');
  try{const value=JSON.parse(String(config?.value));if(value.model==='anthropic/claude-sonnet-4.6')put(s,'settings',{key:'focusConfig',value:JSON.stringify({...value,model:defaultMentorModel})},'key');}catch{/* An unconfigured profile uses the new default. */}
  put(s,'settings',{key:'_focusModelRevision',value:'2'},'key');
 }
}
// Deliberate allowlist: never forward the normal application's records/settings.
// Aliases keep presentation independent of the physical storage layout.
export function focusSnapshot(s:Snapshot):Snapshot{
 const boundary=focusBoundary(s),start=boundary?.day??localDay();
 const tables:Snapshot['tables']={settings:(s.tables.settings??[]).filter(r=>['focusConfig','focusBoundary','focusFoodEdits'].includes(String(r.key))).map(r=>structuredClone(r)),finance_accounts:structuredClone(focusAccounts),finance_categories:structuredClone(focusCategories)};
 for(const [view,source] of Object.entries(sourceMap)){
  const rows=boundary?(s.tables[source]??[]).filter(r=>String(r.day??r.occurred_at).slice(0,10)>=start):[];
  tables[source]=structuredClone(rows);tables[view]=structuredClone(rows);
 }
 for(const table of owned)tables[table]=table==='focus_products'?structuredClone(s.tables.focus_products??[]):boundary?(s.tables[table]??[]).filter(r=>String(r.day)>=start&&String(r.created_at??r.updated_at)>=boundary.at).map(r=>{
  const row=structuredClone(r);if(table==='mentor_turns')delete row.exports_json;return row;
 }):[];
 tables.workouts=[];
 return {...s,tables};
}
export function storeFocusView(s:Snapshot,view:Snapshot){
 for(const [alias,source] of Object.entries(sourceMap))s.tables[source]=view.tables[alias];
 for(const table of owned){const visible=new Set(focusSnapshot(s).tables[table].map(r=>r.id));s.tables[table]=[...records(s,table).filter(r=>!visible.has(r.id)),...view.tables[table]];}
}
type ExportLink={source:string;key:string|number;primary:string;target:string|number;hash:string;sourceHash:string};
export function publishFocus(s:Snapshot):{written:number;skipped:number}{
 initializeFocus(s);const view=focusSnapshot(s);let links:ExportLink[]=[];
 try{links=JSON.parse(String(s.tables.settings?.find(r=>r.key==='focusExports')?.value??'[]'));}catch{/* No previous export. */}
 const gym=new Map<string,Row>();for(const r of view.tables.activity_entries)if(r.type==='gym'||r.type==='sport')gym.set(String(r.day),{day:r.day,done:1,type:r.title,minutes:r.minutes,comment:r.note});view.tables.workouts=[...gym.values()];
 let written=0,skipped=0;
 for(const source of ['weight_entries','health_daily_entries','finance_transactions','workouts']){
  const primary=source==='health_daily_entries'?'day':'id';
  for(const row of view.tables[source]??[]){
   const key=(source==='workouts'?row.day:row[primary]) as string|number,mapping=links.find(l=>l.source===source&&l.key===key),sourceHash=fingerprint(row);
   if(mapping?.sourceHash===sourceHash)continue;
   let target=mapping?records(s,source).find(r=>r[primary]===mapping.target):undefined;
   if(mapping&&fingerprint(target)!==mapping.hash){skipped++;continue;}
   if(!mapping&&source!=='finance_transactions')target=records(s,source).find(r=>r.day===row.day);
   let next:Row={...row,id:target?.id??mapping?.target??numericId(records(s,source))};
   if(source==='health_daily_entries')next={day:row.day,mood:null,energy:null,nutrition:null,comment:'',...target,sleep_start:row.sleep_start,sleep_end:row.sleep_end,sleep_minutes:row.sleep_minutes};
   if(source==='finance_transactions'){
    const accounts=records(s,'finance_accounts').filter(r=>r.active===1);let account=accounts.find(r=>r.name==='Дебет')??accounts[0];
    if(!account){const archived=records(s,'finance_accounts').find(r=>r.name==='Дебет');account=archived?{...archived,active:1}:{id:numericId(records(s,'finance_accounts')),name:'Дебет',opening_cents:0,active:1};put(s,'finance_accounts',account);}
    if(row.type==='transfer'){
     let savings=records(s,'finance_accounts').find(r=>r.name==='Накопления');
     if(!savings){savings={id:numericId(records(s,'finance_accounts')),name:'Накопления',opening_cents:0,active:1};put(s,'finance_accounts',savings);}
     else if(savings.active!==1){savings={...savings,active:1};put(s,'finance_accounts',savings);}
     next={...next,account_id:row.account_id===2?savings.id:account.id,target_account_id:row.target_account_id===2?savings.id:account.id,category_id:null};
    }
    const name=focusCategories.find(c=>c.id===row.category_id)?.name??'Прочее';
    let category=row.type==='income'?null:records(s,'finance_categories').find(c=>c.active===1&&c.kind==='expense'&&c.name===name);
    if(row.type==='expense'&&!category){const archived=records(s,'finance_categories').find(c=>c.kind==='expense'&&c.name===name);category=archived?{...archived,active:1}:{id:numericId(records(s,'finance_categories')),name,kind:'expense',active:1};put(s,'finance_categories',category);}
    if(row.type!=='transfer')next={...next,account_id:account.id,category_id:category?.id??null};
   }
   const link={source,key,primary,target:next[primary] as string|number,hash:fingerprint(next),sourceHash};
   links=links.filter(l=>!(l.source===source&&l.key===key));links.push(link);put(s,source,next,primary);written++;
  }
 }
 put(s,'settings',{key:'focusExports',value:JSON.stringify(links)},'key');return {written,skipped};
}
