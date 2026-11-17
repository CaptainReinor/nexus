import {expect,it} from 'vitest';
import {resetFocusRecords,makeFocusResetRequest,readFocusReset,focusResetHeaders,resetFocusTables} from './focus-reset';
import {saveFocusTurn,validateMentorActions} from './focus-mode';
import {focusSnapshot} from './focus-isolation';
import {mergeSnapshots,rowKey,type Snapshot} from './snapshot-sync';
import {stampRecordChanges} from './record-clocks';
import {localDay} from './domain';
const fixture=():Snapshot=>({format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[{key:'focusConfig',value:JSON.stringify({model:'test/model',targetCents:500000,gymPerWeek:3,dietNote:'Без помидоров',startDay:localDay(),days:null})},{key:'returnPreferences',value:'{"dailyChecklist":["weight","food"]}'}],weight_entries:[{id:1,day:localDay(),weight_kg:90}],finance_transactions:[],habits:[{id:1,name:'Уход'}],care_checks:[{id:'original-care'}],day_tasks:[{id:'my-task'}]}});
const input=()=>({id:crypto.randomUUID(),day:localDay(),text:'Вес 84',reply:'',actions:[{kind:'weight' as const,day:localDay(),kg:84}],replace:false,expectedUpdatedAt:null});

it('clears the current diary and derived context, while preserving settings, goals and original records',()=>{
 const s=fixture();saveFocusTurn(s,input());const settings=structuredClone(s.tables.settings.filter(r=>['focusConfig','returnPreferences'].includes(String(r.key))));
 s.tables.settings.push({key:'_focusDiagnostics',value:'private excerpt'});s.tables.focus_products=[{id:'private-product'}];
 const request=makeFocusResetRequest();resetFocusRecords(s,request);
 for(const table of resetFocusTables)expect(s.tables[table]).toEqual([]);
 expect(s.tables.settings.filter(r=>['focusConfig','returnPreferences'].includes(String(r.key)))).toEqual(settings);
 expect(s.tables.settings.find(r=>r.key==='_focusDiagnostics')).toBeUndefined();expect(s.tables.weight_entries[0].weight_kg).toBe(90);expect(s.tables.care_checks).toHaveLength(1);expect(s.tables.day_tasks).toHaveLength(1);
 expect(readFocusReset(s)?.id).toBe(request.id);expect(focusResetHeaders(s)).toEqual({'X-Nexus-Focus-Reset':request.id});
 expect(focusSnapshot(s).tables.mentor_turns).toHaveLength(0);
});
it('discards obsolete offline diary rows in either merge direction even if their edit clocks are newer',()=>{
 const base=fixture();saveFocusTurn(base,input());const stale=structuredClone(base),fresh=structuredClone(base);const request=makeFocusResetRequest();resetFocusRecords(fresh,request);
 saveFocusTurn(stale,{...input(),text:'Поздно пришедшая старая запись'});stampRecordChanges(base,stale,rowKey,Date.now()+500);
 for(const [local,remote] of [[stale,fresh],[fresh,stale]]){
  const merged=mergeSnapshots(base,local,remote).snapshot;for(const table of resetFocusTables)expect(merged.tables[table]).toHaveLength(0);expect(readFocusReset(merged)?.id).toBe(request.id);
 }
});
it('accepts fresh records, rejects an AI response started before reset, and makes retries idempotent',()=>{
 const s=fixture(),old=input(),request=makeFocusResetRequest();resetFocusRecords(s,request);
 expect(()=>saveFocusTurn(s,old)).toThrow('Дневник сброшен');
 saveFocusTurn(s,{...input(),resetId:request.id});resetFocusRecords(s,request);expect(focusSnapshot(s).tables.mentor_turns).toHaveLength(1);
 expect(()=>validateMentorActions({reply:'Отметил.',actions:[{kind:'weight',day:localDay(),kg:83.9}]},s,'Вес 83.9',localDay())).not.toThrow();
 const stale=fixture(),merged=mergeSnapshots(stale,stale,s).snapshot;expect(focusSnapshot(merged).tables.mentor_turns).toHaveLength(1);
});
