import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {openDatabase,serializeBackup,importBackupText,type DB} from '../main/database';
import {DailyRepository} from '../main/daily';
import {DayLifeRepository} from '../main/life';
import {HealthRepository} from '../main/health';
import {lifeSchema,lifeKeys,applyLife,coachFacts} from './life';
import {dailyTables} from './daily-core';
import {saveCareConfig,saveCareRole,markCare,knownCare} from './care';
import {saveRoutine,recordRoutineEntry} from './routines';
import {savePayment,paymentDate,paymentAction} from './payments';
import {saveExperiment,markExperiment,experimentResult,type Experiment} from './experiments';
import {focusAction,focusSeconds,type FocusSession} from './focus';
import {saveReflection,eveningQuestion} from './reflection';
import {mergeSnapshots,rowKey,type Snapshot} from './snapshot-sync';
import {stampRecordChanges} from './record-clocks';
import {reminderPlan,defaultReminders} from './reminders';
let db:DB;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-03T12:00:00'));db=openDatabase(':memory:');db.exec("INSERT INTO habits(id,name,kind,format,target,period,active,sort_order,created_at) VALUES(1,'Уход за головой','positive','boolean',1,'daily',1,0,'2026-09-01T12:00:00Z'); INSERT INTO finance_accounts(id,name,opening_cents,active) VALUES(1,'Дебет',100000,1); INSERT INTO finance_categories(id,name,kind,active) VALUES(1,'Подписки','expense',1)");});
afterEach(()=>{db.close();vi.useRealTimers();});
const snapshot=()=>JSON.parse(serializeBackup(db)) as Snapshot;
function care(s:Snapshot){saveCareConfig(s,{habit_id:1,role:'care',slots:[{label:'Утро',time:'08:00',notify:true},{label:'Вечер',time:'20:00',notify:true}]});return s.tables.care_slots;}
const payment={name:'Музыка',amount_cents:39900,account_id:1,category_id:1,cadence:'monthly' as const,start_day:'2026-10-03',active:1 as const};
it('moves between care and habits without rewriting schedules, marks or reminders',async()=>{
 const s=snapshot(),slots=care(s);markCare(s,{slot_id:String(slots[0].id),day:'2026-10-03',done:true});
 const before=structuredClone(s),plan=reminderPlan(s,{...defaultReminders,quiet:false},new Date('2026-10-03T07:00:00'));
 saveCareRole(s,{habit_id:1,role:'habit'});
 for(const table of Object.keys(s.tables).filter(t=>t!=='habit_preferences'))expect(s.tables[table]).toEqual(before.tables[table]);
 expect(reminderPlan(s,{...defaultReminders,quiet:false},new Date('2026-10-03T07:00:00'))).toEqual(plan);
 expect(()=>saveCareRole(s,{habit_id:999,role:'care'})).toThrow('не найден');
 importBackupText(db,JSON.stringify(s));const repo=new DailyRepository(db);await repo.careRole({habit_id:1,role:'care'});
 const data=await repo.list();expect(data.preferences[0].role).toBe('care');expect(data.checks).toHaveLength(1);expect(data.slots).toHaveLength(2);expect(data.logs[0].comment).toBe('1/2');
});
it('creates a care item atomically and preserves its group when older clients edit it',()=>{
 const health=new HealthRepository(db);health.saveHabit({name:'Процедура',description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1,role:'care'});
 const item=health.list().habits.find(h=>h.name==='Процедура')!;
 expect(db.prepare('SELECT role FROM habit_preferences WHERE id=?').get(item.id)).toEqual({role:'care'});
 health.saveHabit({...item,name:'Новая процедура'});expect(db.prepare('SELECT role FROM habit_preferences WHERE id=?').get(item.id)).toEqual({role:'care'});
 health.saveHabit({...item,role:'habit'});expect(db.prepare('SELECT role FROM habit_preferences WHERE id=?').get(item.id)).toEqual({role:'habit'});
});
it('keeps two care executions independent, derives completion after offline merge and supports clearing marks',()=>{
 const base=snapshot(),slots=care(base),left=structuredClone(base),right=structuredClone(base);
 markCare(left,{slot_id:String(slots[0].id),day:'2026-10-03',done:true});markCare(right,{slot_id:String(slots[1].id),day:'2026-10-03',done:true});
 expect(left.tables.habit_logs[0]).toMatchObject({value:0,status:'missed',comment:'1/2'});
 stampRecordChanges(base,left,rowKey);stampRecordChanges(base,right,rowKey);
 const merged=mergeSnapshots(base,left,right).snapshot;expect(merged.tables.care_checks).toHaveLength(2);expect(merged.tables.habit_logs[0]).toMatchObject({value:1,status:'done',comment:'2/2'});
 importBackupText(db,JSON.stringify(merged));expect(db.pragma('foreign_key_check')).toEqual([]);
 markCare(merged,{slot_id:String(slots[0].id),day:'2026-10-03',done:null});expect(merged.tables.habit_logs[0].status).toBe('missed');markCare(merged,{slot_id:String(slots[1].id),day:'2026-10-03',done:null});expect(merged.tables.habit_logs[0].status).toBe('skipped');
});
it('does not reinterpret old or weekly marks as care executions and blocks whole-day bypass',async()=>{
 const s=snapshot();s.tables.habit_logs.push({id:20,habit_id:1,day:'2026-10-02',value:1,status:'done',comment:'Раньше'});const slots=care(s);
 expect(knownCare(s,'2026-10-02')).toEqual([]);expect(s.tables.habit_logs[0].comment).toBe('Раньше');expect(()=>markCare(s,{slot_id:String(slots[0].id),day:'2026-10-02',done:true})).toThrow('даты');
 importBackupText(db,JSON.stringify(s));const health=new HealthRepository(db);expect(()=>health.saveHabitLog({habit_id:1,day:'2026-10-03',value:1,status:'done',comment:''})).toThrow('отдельные');
 expect(()=>recordRoutineEntry(s,{kind:'habit',habit_id:1,day:'2026-10-03',done:true})).toThrow('отдельные');
 s.tables.habits[0].period='weekly';expect(()=>saveCareConfig(s,{habit_id:1,role:'care',slots:[{label:'Утро',time:'08:00',notify:false}]})).toThrow('ежедневных');
});
it('does not let one morning mark cancel the evening reminder',()=>{
 const s=snapshot(),slots=care(s);markCare(s,{slot_id:String(slots[0].id),day:'2026-10-03',done:true});const plan=reminderPlan(s,{...defaultReminders,quiet:false},new Date('2026-10-03T07:00:00'));
 expect(plan.some(p=>p.ruleId===`care:${slots[0].id}`&&new Date(p.at).getDate()===3)).toBe(false);expect(plan.some(p=>p.ruleId===`care:${slots[1].id}`&&new Date(p.at).getDate()===3)).toBe(true);
});
it('applies only the selected AI care proposal and persists it through the desktop service',async()=>{
 const repo=new DailyRepository(db);await repo.careConfig({habit_id:1,role:'care',slots:[{label:'Утро',time:'08:00',notify:false},{label:'Вечер',time:'20:00',notify:false}]});const slots=(await repo.list()).slots,life=lifeSchema.parse({care:slots.map(s=>({slotId:s.id,done:true}))});
 expect(lifeKeys(life)).toContain('life.care.0');new DayLifeRepository(db).apply('2026-10-03',life,['life.care.0']);expect((await repo.list()).checks).toHaveLength(1);expect((await repo.list()).logs[0].comment).toBe('1/2');
 const mobile=snapshot();applyLife(mobile,'2026-10-03',life,['life.care.1']);expect(mobile.tables.habit_logs[0].status).toBe('done');expect(coachFacts(mobile,'2026-10-03','2026-10-03').daily.care).toHaveLength(2);
});
it('clamps month-end bills without drifting and handles leap years',()=>{
 expect(paymentDate('2026-01-31','monthly',1)).toBe('2026-02-28');expect(paymentDate('2026-01-31','monthly',2)).toBe('2026-03-31');expect(paymentDate('2024-02-29','yearly',1)).toBe('2025-02-28');expect(paymentDate('2026-10-03','weekly',1)).toBe('2026-10-10');
});
it('creates no expense before confirmation and deduplicates independent offline confirmations',()=>{
 const base=snapshot();savePayment(base,payment);expect(base.tables.finance_transactions).toEqual([]);const id=String(base.tables.payment_occurrences[0].id),left=structuredClone(base),right=structuredClone(base);
 for(const s of [left,right]){paymentAction(s,{id,action:'pay',day:'2026-10-03',amount_cents:35000});paymentAction(s,{id,action:'pay',day:'2026-10-03'});}
 stampRecordChanges(base,left,rowKey);stampRecordChanges(base,right,rowKey);const merged=mergeSnapshots(base,left,right).snapshot;
 expect(merged.tables.finance_transactions).toHaveLength(1);expect(merged.tables.finance_transactions[0]).toMatchObject({amount_cents:35000,type:'expense'});expect(merged.tables.payment_occurrences[0]).toMatchObject({status:'paid',amount_cents:35000});
 importBackupText(db,JSON.stringify(merged));expect(db.pragma('foreign_key_check')).toEqual([]);
 const skipped=structuredClone(base);paymentAction(skipped,{id,action:'skip',day:'2026-10-03'});expect(skipped.tables.finance_transactions).toEqual([]);expect(skipped.tables.payment_occurrences[0].status).toBe('skipped');
});
it('keeps scheduled payment references valid when independently created accounts are unified',()=>{
 const base=snapshot();base.tables.finance_accounts=[];const left=structuredClone(base),right=structuredClone(base);left.tables.finance_accounts.push({id:100,name:'Новый',active:1,opening_cents:0});right.tables.finance_accounts.push({id:200,name:'Новый',active:1,opening_cents:0});savePayment(left,{...payment,account_id:100});const merged=mergeSnapshots(base,left,right).snapshot;
 expect(merged.tables.scheduled_payments[0].account_id).toBe(200);expect(merged.tables.payment_occurrences[0].account_id).toBe(200);importBackupText(db,JSON.stringify(merged));
});
it('preserves sleep and stable weight identities when a routine is used repeatedly',()=>{
 const s=snapshot();s.tables.health_daily_entries.push({day:'2026-10-03',sleep_start:'23:30',sleep_end:null,sleep_minutes:null,mood:7,energy:8,nutrition:null,comment:'Сохранить'});
 recordRoutineEntry(s,{kind:'wake',day:'2026-10-03',value:'08:00'});expect(s.tables.health_daily_entries[0]).toMatchObject({sleep_minutes:510,mood:7,comment:'Сохранить'});
 recordRoutineEntry(s,{kind:'weight',day:'2026-10-03',value:90});const id=s.tables.weight_entries[0].id;recordRoutineEntry(s,{kind:'weight',day:'2026-10-03',value:89.9});expect(s.tables.weight_entries).toHaveLength(1);expect(s.tables.weight_entries[0].id).toBe(id);saveRoutine(s,{id:'morning',steps:['wake','weight','wake']});expect(JSON.parse(String(s.tables.routines[0].steps_json))).toEqual(['wake','weight']);
});
it('excludes pauses, survives closing the app and does not automatically complete the linked task',()=>{
 const s=snapshot(),task='30000000-0000-4000-8000-000000000003';s.tables.day_tasks.push({id:task,title:'Код',status:'open'});focusAction(s,{action:'start',title:'Код',task_id:task,mode:'interval',target_seconds:1500},new Date('2026-10-03T08:00:00Z'));const id=String(s.tables.focus_sessions[0].id);
 focusAction(s,{action:'pause',id},new Date('2026-10-03T08:10:00Z'));expect(focusSeconds(s.tables.focus_sessions[0] as unknown as FocusSession,Date.parse('2026-10-03T09:00:00Z'))).toBe(600);
 const restored=structuredClone(s);focusAction(restored,{action:'resume',id},new Date('2026-10-03T09:00:00Z'));focusAction(restored,{action:'finish',id},new Date('2026-10-03T09:05:00Z'));expect(restored.tables.focus_sessions[0]).toMatchObject({elapsed_seconds:900,state:'finished'});expect(restored.tables.day_tasks[0].status).toBe('open');expect(coachFacts(restored,'2026-10-03','2026-10-03').daily.focus[0].minutes).toBe(15);
});
it('compares equal observed experiment periods without inventing missing sleep values',()=>{
 const s=snapshot();saveExperiment(s,{title:'Режим',rule:'Ложиться до полуночи',start_day:'2026-10-01',duration:7,active:1});const e=s.tables.experiments[0] as unknown as Experiment;s.tables.health_daily_entries.push({day:'2026-09-24',sleep_minutes:420},{day:'2026-09-25',sleep_minutes:null},{day:'2026-10-01',sleep_minutes:480},{day:'2026-10-02',sleep_minutes:null});markExperiment(s,{id:e.id,day:'2026-10-01',done:true});markExperiment(s,{id:e.id,day:'2026-10-02',done:false});const result=experimentResult(s,e,'2026-10-03');expect(result).toMatchObject({elapsed:3,done:1,missed:1,unmarked:1,current:{sleep:480,sleepDays:1},previous:{sleep:420,sleepDays:1}});expect(()=>markExperiment(s,{id:e.id,day:'2026-10-04',done:true})).toThrow();
});
it('preserves historical evening answers and exports every domain',async()=>{
 const repo=new DailyRepository(db);await repo.reflection({day:'2026-10-03',question:'Что помогло?',answer:'Прогулка',skipped:false});await repo.payment(payment);await repo.routine({id:'evening',steps:['reflection']});await repo.experiment({title:'Без доставки',rule:'Готовить дома',start_day:'2026-10-03',duration:7,active:1});await repo.focus({action:'start',title:'Диплом',task_id:null,mode:'stopwatch',target_seconds:1500});
 const s=snapshot();expect(eveningQuestion(s,'2026-10-03')).toBe('Что помогло?');expect(coachFacts(s,'2026-10-03','2026-10-03').daily.reflections[0].answer).toBe('Прогулка');saveReflection(s,{day:'2026-10-02',question:'Как день?',answer:'',skipped:true});expect(coachFacts(s,'2026-10-02','2026-10-02').daily.reflections).toEqual([]);
 const copy=openDatabase(':memory:');try{importBackupText(copy,JSON.stringify(s));expect(copy.pragma('foreign_key_check')).toEqual([]);expect((await new DailyRepository(copy).list()).payments[0].name).toBe('Музыка');}finally{copy.close();}
 const old=structuredClone(s);old.version=10;for(const table of dailyTables)delete old.tables[table];importBackupText(db,JSON.stringify(old));expect((await repo.list()).sessions).toEqual([]);
});

it('drops the retired evening question from saved routines without deleting historical answers',()=>{
 const s=snapshot(),slots=care(s);saveReflection(s,{day:'2026-10-02',question:'Как день?',answer:'Прогулка',skipped:false});const answers=structuredClone(s.tables.evening_answers);
 saveRoutine(s,{id:'evening',steps:[`slot:${slots[1].id}`,'reflection','journal']});
 expect(JSON.parse(String(s.tables.routines[0].steps_json))).toEqual([`slot:${slots[1].id}`,'journal']);expect(s.tables.evening_answers).toEqual(answers);
 expect(()=>saveRoutine(s,{id:'evening',steps:['unknown']})).toThrow('недоступен');
});
