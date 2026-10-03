import { afterEach,beforeEach,expect,it } from 'vitest';
import { openDatabase,serializeBackup,importBackupText,schemaVersion,type DB } from './database';
import { DayLifeRepository } from './life';
import { JournalService } from './journal';
import { HealthRepository } from './health';
import { FinanceRepository } from './finance';
import { WorkRepository } from './work';
import type { AIGateway } from './ai';
import { lifeSchema,lifeData,restrictMarkers,updateTask,coachFacts,containsProfanity } from '../shared/life';
import { applyJournalSuggestions } from '../../../NEXUS-Android/src/journal-domain';
import { journalSchema } from '../../../NEXUS-Android/src/ai';
import type { Snapshot } from '../shared/snapshot-sync';
import type { JournalAnalysis } from '../shared/models';
import { mergeSnapshots,rowKey } from '../shared/snapshot-sync';
import { stampRecordChanges } from '../shared/record-clocks';
import { mkdtempSync,readdirSync,rmSync } from 'node:fs';
import { join,resolve } from 'node:path';
import Database from 'better-sqlite3';
let db:DB;
beforeEach(()=>{db=openDatabase(':memory:');});afterEach(()=>db.close());
const analysis=():JournalAnalysis=>({summary:'День',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:7,energy:3,nutrition:null,workout:null,habits:[]},finance:[],work:[],uncertain:[],life:lifeSchema.parse({contexts:['Учёба','Прогулка'],achievement:'Закончил главу',appetite:'low',sleep_quality:'interrupted',tension:'tense',tasks:[{title:'Написать рекрутеру',dueDay:'2026-10-01'}],memories:[{text:'Встреча с друзьями'}]})});
function service(){return new JournalService(db,null as unknown as AIGateway,new HealthRepository(db),new FinanceRepository(db),new WorkRepository(db));}
it('keeps an unknown expense editable and requires a positive amount before applying it on PC and Android',()=>{
 const finance=new FinanceRepository(db);finance.saveAccount({name:'Дебет',opening_cents:100000,active:1});finance.saveCategory({name:'Еда',kind:'expense',active:1});
 const account=finance.list().accounts[0],category=finance.list().categories[0],journal=service(),entry=journal.save('2026-10-01','Купил продукты, сумму не помню.','text');
 const value=analysis();value.finance=[{type:'expense',amountCents:null,accountId:account.id,categoryId:category.id,note:'Продукты'}];
 db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(value),entry.id);
 const mobile=JSON.parse(serializeBackup(db)) as Snapshot,before=JSON.stringify(mobile);
 expect(()=>journal.apply(entry.id,['health.mood','finance.0'])).toThrow('Укажите сумму');
 expect(db.prepare('SELECT COUNT(*) AS n FROM health_daily_entries').get()).toEqual({n:0});expect(finance.list().transactions).toHaveLength(0);
 expect(()=>applyJournalSuggestions(mobile,entry.id,value,['health.mood','finance.0'])).toThrow('Укажите сумму');expect(JSON.stringify(mobile)).toBe(before);
 value.finance[0].amountCents=3575;journal.editAnalysis(entry.id,value);
 journal.apply(entry.id,['finance.0']);applyJournalSuggestions(mobile,entry.id,value,['finance.0']);
 expect(finance.list().transactions[0].amount_cents).toBe(3575);expect(mobile.tables.finance_transactions[0].amount_cents).toBe(3575);expect(finance.list().transactions[0].created_at?.slice(0,10)).not.toBe('2026-10-01');expect(String(mobile.tables.finance_transactions[0].created_at).slice(0,10)).not.toBe('2026-10-01');
});
it('migrates an existing schema 5 database with a recoverable backup and preserves old records',()=>{
 const root=resolve(process.cwd()),folder=mkdtempSync(join(root,'.test-life-migration-')),path=join(folder,'nexus.sqlite');
 if(resolve(folder,'..')!==root)throw new Error('Invalid test directory');
 let disk:DB|undefined;
 try{
  disk=openDatabase(path);disk.prepare("INSERT INTO finance_accounts(id,name,opening_cents) VALUES (42,'Existing account',12345)").run();
  disk.exec('DROP INDEX idx_transactions_created; ALTER TABLE finance_transactions DROP COLUMN created_at; DROP TABLE weekly_plan_tasks; DROP TABLE metric_entries; DROP TABLE custom_metrics; DROP TABLE recurring_skips; DROP TABLE recurring_tasks; DROP TABLE weekly_plans; DROP TABLE financial_goals; DROP TABLE assistant_reviews; DROP TABLE day_memories; DROP TABLE day_tasks; DROP TABLE day_details; DELETE FROM schema_migrations WHERE version>=6');disk.close();disk=undefined;
  disk=openDatabase(path);expect(disk.prepare('SELECT opening_cents FROM finance_accounts WHERE id=42').get()).toEqual({opening_cents:12345});expect(new DayLifeRepository(disk).list().details).toEqual([]);
  const backup=readdirSync(folder).find(name=>name.includes(`.before-v${schemaVersion}-`))!;expect(backup).toBeTruthy();
  const saved=new Database(join(folder,backup),{readonly:true});try{expect(saved.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({v:5});expect(saved.prepare('SELECT opening_cents FROM finance_accounts WHERE id=42').get()).toEqual({opening_cents:12345});}finally{saved.close();}
 }finally{disk?.close();rmSync(folder,{recursive:true,force:true});}
});
it('unifies independently created named parents and retains valid child links on import',()=>{
 const base=JSON.parse(serializeBackup(db)) as Snapshot,local=structuredClone(base),remote=structuredClone(base);
 for(const [snapshot,id] of [[local,111],[remote,222]] as const){
  snapshot.tables.finance_accounts.push({id,name:'Shared account',opening_cents:0,active:1});
  snapshot.tables.finance_categories.push({id,name:'Shared category',kind:'expense',active:1});
  snapshot.tables.finance_transactions.push({id,occurred_at:'2026-09-30T10:00:00',amount_cents:100,type:'expense',account_id:id,target_account_id:null,category_id:id,note:''});
  snapshot.tables.investment_accounts.push({id,name:'Shared portfolio',active:1});
  snapshot.tables.investment_entries.push({id,account_id:id,day:id===111?'2026-09-29':'2026-09-30',value_cents:1000,flow_cents:0,note:''});
 }
 stampRecordChanges(base,local,rowKey,100);stampRecordChanges(base,remote,rowKey,200);
 const merged=mergeSnapshots(base,local,remote).snapshot;
 expect(merged.tables.finance_accounts.filter(x=>x.name==='Shared account')).toHaveLength(1);
 expect(merged.tables.finance_transactions).toHaveLength(2);expect(merged.tables.finance_transactions.every(x=>x.account_id===222&&x.category_id===222)).toBe(true);
 expect(merged.tables.investment_entries).toHaveLength(2);expect(merged.tables.investment_entries.every(x=>x.account_id===222)).toBe(true);
 importBackupText(db,JSON.stringify(merged));expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('applies only selected life suggestions, survives journal pruning and round trips through a backup',()=>{
 const journal=service(),entry=journal.save('2026-09-30','Рассказ','text'),value=analysis();
 db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(value),entry.id);
 journal.apply(entry.id,['life.contexts','life.achievement','life.appetite','life.task.0','life.memory.0']);
 journal.apply(entry.id,['life.task.0','life.memory.0']);
 const life=new DayLifeRepository(db).list();expect(life.details[0]).toMatchObject({achievement:'Закончил главу',appetite:'low',sleep_quality:null,tension:null});expect(life.tasks).toHaveLength(1);expect(life.memories).toHaveLength(1);
 for(let i=0;i<5;i++)journal.save('2026-09-30',`Новый ${i}`,'text');
 expect(journal.list()).toHaveLength(3);expect(new DayLifeRepository(db).list().memories).toHaveLength(1);
 const copy=openDatabase(':memory:');try{importBackupText(copy,serializeBackup(db));expect(new DayLifeRepository(copy).list()).toEqual(new DayLifeRepository(db).list());}finally{copy.close();}
});
it('persists edits before applying and refuses to edit an already applied suggestion',()=>{
 const journal=service(),entry=journal.save('2026-09-30','Рассказ','text'),value=analysis();db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(value),entry.id);
 value.life!.achievement='Исправленный результат';journal.editAnalysis(entry.id,value);journal.apply(entry.id,['life.achievement']);expect(new DayLifeRepository(db).list().details[0].achievement).toBe('Исправленный результат');
 value.life!.achievement='Другой результат';expect(()=>journal.editAnalysis(entry.id,value)).toThrow('Сохранённое предложение');
});
it('applies the same selection on Android and rejects disabled markers on both platforms',()=>{
 const journal=service(),entry=journal.save('2026-09-30','Рассказ','text'),value=analysis();db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(value),entry.id);
 const mobile=JSON.parse(serializeBackup(db)) as Snapshot;
 const keys=['health.mood','health.energy','life.contexts','life.achievement','life.sleep_quality','life.tension','life.task.0','life.memory.0'];
 applyJournalSuggestions(mobile,entry.id,journalSchema.parse(value),keys);applyJournalSuggestions(mobile,entry.id,journalSchema.parse(value),keys);journal.apply(entry.id,keys);
 expect(lifeData(mobile).details).toEqual(new DayLifeRepository(db).list().details);
 expect(lifeData(mobile).tasks.map(x=>x.title)).toEqual(new DayLifeRepository(db).list().tasks.map(x=>x.title));expect(lifeData(mobile).memories).toHaveLength(1);
 expect(restrictMarkers(value.life!,['tension'])).toMatchObject({appetite:null,sleep_quality:null,tension:'tense'});
});
it('allows additional tasks, moving and reopening them on the same date',()=>{
 const repo=new DayLifeRepository(db);for(let i=0;i<3;i++)repo.task({day:'2026-09-30',due_day:'2026-10-01',title:`Дело ${i}`});
 expect(()=>repo.task({day:'2026-09-30',due_day:'2026-10-01',title:'Четвёртое'})).not.toThrow();
 repo.task({day:'2026-09-30',due_day:'2026-10-02',title:'Позже'});const snapshot=JSON.parse(serializeBackup(db)) as Snapshot;
 expect(()=>updateTask(snapshot,{...repo.list().tasks.find(x=>x.title==='Позже')!,due_day:'2026-10-01'})).not.toThrow();
 expect(repo.list().tasks).toHaveLength(5);
});
it('omits raw diary text from mentor input and preserves unknown sleep duration',()=>{
 service().save('2026-09-30','Приватный текст','text');db.prepare("INSERT INTO health_daily_entries(day,sleep_end) VALUES ('2026-09-30','08:00')").run();
 const facts=coachFacts(JSON.parse(serializeBackup(db)) as Snapshot,'2026-09-30','2026-09-30');expect(JSON.stringify(facts)).not.toContain('Приватный текст');expect(facts.health[0].sleep_minutes).toBeNull();
});
it('detects the user tone without forwarding raw diary text or confusing normal words with profanity',()=>{
 expect(containsProfanity('Учёба, хлеб и хороший день')).toBe(false);
 expect(containsProfanity('Сука, опять проебал прогулку')).toBe(true);
 expect(containsProfanity('Нахуй этот срыв, завтра исправлю')).toBe(true);
 service().save('2026-09-30','Сука, опять проебал прогулку','text');
 const facts=coachFacts(JSON.parse(serializeBackup(db)) as Snapshot,'2026-09-30','2026-09-30');
 expect(facts.communication.userUsesProfanity).toBe(true);
 expect(JSON.stringify(facts)).not.toContain('Сука, опять проебал прогулку');
 expect(JSON.stringify(facts)).not.toContain('raw_text');
});
it('passes qualitative wellbeing and closed-day failures to the mentor without inventing incidents',()=>{
 db.prepare("INSERT INTO health_daily_entries(day,mood,energy) VALUES ('2026-10-06',7,3)").run();
 db.prepare("INSERT INTO habits(id,name,kind,format,target,period,active,created_at) VALUES (1,'Фастфуд','avoid','avoidance',0,'daily',1,'2026-10-01'),(2,'Недельная','positive','boolean',1,'weekly',1,'2026-10-01')").run();
 const snapshot=JSON.parse(serializeBackup(db)) as Snapshot;
 const day=coachFacts(snapshot,'2026-10-06','2026-10-06','2026-10-07');
 expect(day.start).toBe('06.10.2026');expect(day.health[0]).toMatchObject({day:'06.10.2026',mood:'Хорошо',energy:'Мало сил'});
 expect(day.habitResults).toHaveLength(1);expect(day.habitResults[0].outcomes[0]).toMatchObject({result:'Не выполнено',marks:[]});
 expect(day.habitResults[0].outcomes[0].reason).toContain('само нежелательное действие не подтверждено');
 const week=coachFacts(snapshot,'2026-10-05','2026-10-07','2026-10-07');
 expect(week.habitResults[1].outcomes[0].result).toBe('Период ещё не завершён');
});
