import { DayLifeRepository } from './life';
import { lifeKeys } from '../shared/life';
import type { DB } from './database';
import type { DailyInput, JournalAnalysis, JournalEntry } from '../shared/models';
import { sleepDuration } from '../shared/domain';
import { journalAnalysisSchema, AIGateway } from './ai';
import { HealthRepository } from './health';
import { FinanceRepository } from './finance';
import { WorkRepository } from './work';
import { SettingsRepository } from './settings';

export class JournalService {
  constructor(private db:DB,private ai:AIGateway,private health:HealthRepository,private finance:FinanceRepository,private work:WorkRepository,private settings?:SettingsRepository,private life=new DayLifeRepository(db)){}
  private prune():void{this.db.prepare('DELETE FROM daily_journals WHERE id NOT IN (SELECT id FROM daily_journals ORDER BY created_at DESC,id DESC LIMIT 3)').run();}
  list():JournalEntry[]{this.prune();return this.db.prepare('SELECT * FROM daily_journals ORDER BY created_at DESC,id DESC LIMIT 3').all() as JournalEntry[];}
  save(day:string,text:string,source:'text'|'voice'):JournalEntry {
    const latest=this.db.prepare('SELECT MAX(created_at) AS value FROM daily_journals').get() as {value:string|null};
    const created_at=new Date(Math.max(Date.now(),latest.value?Date.parse(latest.value)+1:0)).toISOString();
    const r=this.db.prepare('INSERT INTO daily_journals(id,day,raw_text,source,created_at) VALUES (nexus_id(),?,?,?,?)').run(day,text,source,created_at);
    this.prune();
    return this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(r.lastInsertRowid) as JournalEntry;
  }
  update(id:number,day:string,text:string,source:'text'|'voice'):JournalEntry {
    const journal=this.db.prepare('SELECT analysis_json FROM daily_journals WHERE id=?').get(id) as {analysis_json:string|null}|undefined;
    if(!journal)throw new Error('Запись дня не найдена.');
    if(journal.analysis_json)throw new Error('Для изменения разобранной записи начните новую запись.');
    this.db.prepare('UPDATE daily_journals SET day=?,raw_text=?,source=? WHERE id=?').run(day,text,source,id);
    return this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry;
  }
  async analyze(id:number,overrideBudget=false):Promise<JournalEntry> {
    const journal=this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry|undefined;
    if(!journal)throw new Error('Запись дня не найдена.');
    const h=this.health.list(),f=this.finance.list(),w=this.work.list();
    const accounts=f.accounts.filter(x=>x.active);
    const preferred=accounts.find(x=>x.id===this.settings?.get().primaryAccountId)??accounts[0];
    const analysis=await this.ai.analyzeJournal(journal.raw_text,{day:journal.day,dailyMarkers:this.life.list().markers,habits:h.habits.filter(x=>x.active).map(x=>({id:x.id,name:x.name,kind:x.kind})),accounts:accounts.map(x=>({id:x.id,name:x.name})),defaultAccountId:preferred?.id??null,categories:f.categories.filter(x=>x.active&&x.kind==='expense').map(x=>({id:x.id,name:x.name,kind:x.kind})),jobs:w.jobs.map(x=>({id:x.id,title:x.title,company:x.company}))},overrideBudget);
    this.db.prepare('UPDATE daily_journals SET analysis_json=?,applied_json=? WHERE id=?').run(JSON.stringify(analysis),'[]',id);
    return this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry;
  }
  editAnalysis(id:number,raw:JournalAnalysis):JournalEntry{
    const entry=this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry|undefined;
    if(!entry?.analysis_json)throw new Error('Сначала разберите запись.');
    const analysis=journalAnalysisSchema.parse(raw),previous=JSON.parse(entry.analysis_json) as JournalAnalysis;
    const applied=JSON.parse(entry.applied_json) as string[];
    for(const key of applied){
      const get=(a:JournalAnalysis)=>{if(key==='health.sleep')return [a.health.sleepStart,a.health.sleepEnd];if(key.startsWith('health.habit.'))return a.health.habits.find(x=>x.habitId===Number(key.slice(13)));if(key.startsWith('health.'))return a.health[(( {weight:'weightKg',sleep_start:'sleepStart',sleep_end:'sleepEnd'} as Record<string,string>)[key.slice(7)]??key.slice(7)) as keyof typeof a.health];if(key.startsWith('finance.'))return a.finance[Number(key.slice(8))];if(key.startsWith('work.'))return a.work[Number(key.slice(5))];if(key.startsWith('life.task.'))return a.life?.tasks[Number(key.slice(10))];if(key.startsWith('life.memory.'))return a.life?.memories[Number(key.slice(12))];return a.life?.[key.slice(5) as keyof NonNullable<JournalAnalysis['life']>];};
      if(JSON.stringify(get(previous))!==JSON.stringify(get(analysis)))throw new Error('Сохранённое предложение нельзя менять в разборе.');
    }
    this.db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(analysis),id);
    return this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry;
  }
  apply(id:number,keys:string[]):void {
    const journal=this.db.prepare('SELECT * FROM daily_journals WHERE id=?').get(id) as JournalEntry|undefined;
    if(!journal?.analysis_json)throw new Error('Сначала разберите запись с помощью AI.');
    const analysis=journalAnalysisSchema.parse(JSON.parse(journal.analysis_json)) as JournalAnalysis;
    const already=new Set(JSON.parse(journal.applied_json) as string[]),chosen=[...new Set(keys)].filter(k=>!already.has(k));
    if(!chosen.length)return;
    const valid=new Set<string>(['health.weight','health.sleep','health.sleep_start','health.sleep_end','health.mood','health.energy','health.nutrition',...analysis.health.habits.map(x=>`health.habit.${x.habitId}`),...analysis.finance.map((_,i)=>`finance.${i}`),...analysis.work.map((_,i)=>`work.${i}`),...lifeKeys(analysis.life)]);
    if(chosen.some(k=>!valid.has(k)))throw new Error('В выборе есть неизвестное предложение.');
    this.db.transaction(()=>{
      const healthKeys=chosen.filter(k=>k.startsWith('health.'));
      if(healthKeys.length){
        const current=this.health.getDay(journal.day),d=current.daily,h=analysis.health;
        const logs=new Map(current.logs.map(l=>[l.habit_id,{habit_id:l.habit_id,value:l.value,status:l.status,comment:l.comment}]));
        for(const suggestion of h.habits)if(chosen.includes(`health.habit.${suggestion.habitId}`))logs.set(suggestion.habitId,{habit_id:suggestion.habitId,value:suggestion.value,status:this.health.list().habits.find(h=>h.id===suggestion.habitId)?.kind==='avoid'?(suggestion.value===0?'done':'missed'):suggestion.status,comment:suggestion.reason});
        const sleepStart=chosen.includes('health.sleep')||chosen.includes('health.sleep_start')?h.sleepStart:d?.sleep_start??null,sleepEnd=chosen.includes('health.sleep')||chosen.includes('health.sleep_end')?h.sleepEnd:d?.sleep_end??null;
        const input:DailyInput={day:journal.day,sleep_start:sleepStart,sleep_end:sleepEnd,sleep_minutes:sleepStart&&sleepEnd?sleepDuration(sleepStart,sleepEnd):null,mood:chosen.includes('health.mood')?h.mood:d?.mood??null,energy:chosen.includes('health.energy')?h.energy:d?.energy??null,nutrition:chosen.includes('health.nutrition')?h.nutrition:d?.nutrition??null,comment:d?.comment??'',weight:chosen.includes('health.weight')?h.weightKg:current.weight,workout:null,logs:[...logs.values()]};
        this.health.saveDay(input);
      }
      const f=this.finance.list();
      for(let i=0;i<analysis.finance.length;i++)if(chosen.includes(`finance.${i}`)){
        const x=analysis.finance[i];
        if(!x.accountId||(x.type==='expense'&&!x.categoryId))throw new Error('Для финансового предложения нужны существующие счёт и категория.');
        const category=f.categories.find(c=>c.id===x.categoryId);
        if(x.type==='expense'&&(!category||category.kind!=='expense'))throw new Error('Категория не соответствует типу операции.');
        this.finance.saveTransaction({occurred_at:`${journal.day}T00:00:00`,amount_cents:x.amountCents,type:x.type,account_id:x.accountId,target_account_id:null,category_id:x.categoryId,note:x.note||'Из дневника'});
      }
      for(let i=0;i<analysis.work.length;i++)if(chosen.includes(`work.${i}`)){const x=analysis.work[i];this.work.changeStatus(x.jobId,x.status,`Из дневника: ${x.reason}`);}
      if(analysis.life)this.life.apply(journal.day,analysis.life,chosen);
      this.db.prepare('UPDATE daily_journals SET applied_json=? WHERE id=?').run(JSON.stringify([...already,...chosen]),id);
    })();
  }
}
