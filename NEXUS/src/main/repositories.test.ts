import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, exportBackup, importBackup, type DB } from './database';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HealthRepository } from './health';
import { FinanceRepository } from './finance';
import { InvestmentRepository } from './investments';
import { investmentSummary } from '../shared/investments';
import { WorkRepository } from './work';
import { JournalService } from './journal';
import type { AIGateway } from './ai';
import { habitDueToday, habitStats, localDateTime, localDay, monthOf, weightStats } from '../shared/domain';

let db:DB;
beforeEach(()=>{db=openDatabase(':memory:');});
afterEach(()=>db.close());
describe('repositories',()=>{
  it('records income without requiring or retaining a category',()=>{
    const f=new FinanceRepository(db);
    f.saveAccount({name:'Дебет',opening_cents:0,active:1});
    f.saveTransaction({occurred_at:localDateTime(),type:'income',account_id:f.list().accounts[0].id,amount_cents:100_000,target_account_id:null,category_id:null,note:'Поступление'});
    expect(f.list().accounts[0].balance_cents).toBe(100_000);
    expect(f.list().transactions[0].category_id).toBeNull();
  });
  it('keeps portfolios separate from expenses and adjusts profit for contributions',()=>{
    const i=new InvestmentRepository(db),f=new FinanceRepository(db);
    i.saveAccount({name:'Биржа',active:1});const id=i.list().accounts[0].id;
    i.saveEntry({account_id:id,day:'2026-09-28',value_cents:1_000_000,flow_cents:1_000_000,note:''});
    i.saveEntry({account_id:id,day:'2026-09-29',value_cents:1_210_000,flow_cents:200_000,note:''});
    expect(investmentSummary(i.list().entries)).toEqual({value:1_210_000,flow:200_000,profit:10_000});
    i.saveEntry({account_id:id,day:'2026-09-29',value_cents:1_205_000,flow_cents:200_000,note:'Правка'});
    expect(i.list().entries).toHaveLength(2);expect(investmentSummary(i.list().entries).profit).toBe(5000);
    expect(f.list().accounts).toHaveLength(0);expect(f.list().today_expense).toBe(0);
  });
  it('shows only three recent journal inputs but retains thirty days for the mentor',()=>{
    const h=new HealthRepository(db),f=new FinanceRepository(db),w=new WorkRepository(db),j=new JournalService(db,null as unknown as AIGateway,h,f,w);
    f.saveAccount({name:'Карта',opening_cents:0,active:1});
    f.saveTransaction({occurred_at:localDateTime(),type:'income',account_id:f.list().accounts[0].id,amount_cents:1234,target_account_id:null,category_id:null,note:''});
    for(let n=0;n<5;n++)j.save('2026-09-29',`Запись ${n}`,'text');
    expect(j.list().map(x=>x.raw_text)).toEqual(['Запись 4','Запись 3','Запись 2']);
    expect((db.prepare('SELECT COUNT(*) AS n FROM daily_journals').get() as {n:number}).n).toBe(5);
    db.prepare("INSERT INTO daily_journals(day,raw_text,source,created_at) VALUES ('2026-08-01','Старый текст','text','2026-08-01T12:00:00Z')").run();
    j.list();expect((db.prepare('SELECT COUNT(*) AS n FROM daily_journals').get() as {n:number}).n).toBe(5);
    expect(f.list().transactions).toHaveLength(1);
  });
  it('does not apply an AI avoidance incident as a successful habit',()=>{
    const h=new HealthRepository(db),f=new FinanceRepository(db),w=new WorkRepository(db),j=new JournalService(db,null as unknown as AIGateway,h,f,w);
    h.saveHabit({name:'Фастфуд',description:'',kind:'avoid',format:'avoidance',target:0,period:'daily',active:1});
    const habit=h.list().habits[0],entry=j.save('2026-09-29','Фастфуд был','text');
    const analysis={summary:'Фастфуд был',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:null,energy:null,nutrition:null,workout:null,habits:[{habitId:habit.id,value:1,status:'done',reason:'Был'}]},finance:[],work:[],uncertain:[]};
    db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(analysis),entry.id);
    j.apply(entry.id,[`health.habit.${habit.id}`]);
    expect(h.getDay('2026-09-29').logs[0]).toMatchObject({value:1,status:'missed'});
  });
  it('hides a weekly habit after completion until the next Monday',()=>{
    const h=new HealthRepository(db);
    h.saveHabit({name:'Цель недели',description:'',kind:'positive',format:'boolean',target:1,period:'weekly',active:1});
    const habit=h.list().habits[0];
    h.saveHabitLog({day:'2026-09-28',habit_id:habit.id,value:1,status:'done',comment:''});
    const logs=h.list().logs;
    expect(habitDueToday(habit,logs,'2026-09-28')).toBe(false);
    expect(habitDueToday(habit,logs,'2026-10-04')).toBe(false);
    expect(habitDueToday(habit,logs,'2026-10-05')).toBe(true);
  });
  it('creates a habit, records a day and calculates series and weight averages',()=>{
    const h=new HealthRepository(db),day=localDay();
    h.saveHabit({name:'Чтение',description:'',kind:'positive',format:'quantity',target:20,period:'daily',active:1});
    const habit=h.list().habits[0];
    h.saveDay({day,weight:78.5,mood:8,energy:7,sleep_start:'23:00',sleep_end:'07:00',sleep_minutes:480,nutrition:'good',comment:'',workout:{done:true,type:'Зал',minutes:60,comment:''},logs:[{habit_id:habit.id,value:25,status:'done',comment:''}]});
    const result=h.list();
    expect(result.logs).toHaveLength(1);expect(result.daily?.mood).toBe(8);expect(result.workouts[0].done).toBe(1);
    expect(habitStats(habit,result.logs,day).streak).toBe(1);
    expect(weightStats(result.weights).current).toBe(78.5);
  });
  it('saves a habit immediately and updates one day field without overwriting others',()=>{
    const h=new HealthRepository(db),day=localDay();
    h.saveHabit({name:'Ходьба',description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1});
    const habit=h.list().habits[0];
    h.saveHabitLog({day,habit_id:habit.id,value:1,status:'done',comment:''});
    h.saveDayField({day,field:'weight',value:78.4});
    h.saveDayField({day,field:'sleep_start',value:'23:30'});
    h.saveDayField({day,field:'sleep_end',value:'07:00'});
    h.saveDayField({day,field:'comment',value:'Нормальный день'});
    expect(h.list().logs[0].status).toBe('done');
    expect(h.list().daily?.sleep_minutes).toBe(450);
    expect(h.list().daily?.comment).toBe('Нормальный день');
    h.saveDayField({day,field:'weight',value:null});
    expect(h.list().weights.find(x=>x.day===day)).toBeUndefined();
    expect(h.list().logs[0].status).toBe('done');
  });
  it('persists habit order and restores order from an older backup',()=>{
    const h=new HealthRepository(db);
    for(const name of ['Чтение','Прогулка','Сон'])h.saveHabit({name,description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1});
    expect(h.list().habits.map(x=>x.name)).toEqual(['Чтение','Прогулка','Сон']);
    const walk=h.list().habits.find(x=>x.name==='Прогулка')!;
    h.moveHabit(walk.id,'up');
    expect(h.list().habits.map(x=>x.name)).toEqual(['Прогулка','Чтение','Сон']);
    h.moveHabit(walk.id,'down');
    expect(h.list().habits.map(x=>x.name)).toEqual(['Чтение','Прогулка','Сон']);
    const path=join(process.cwd(),'.test-old-backup.json');
    try{
      exportBackup(db,path);
      const backup=JSON.parse(readFileSync(path,'utf8'));
      backup.version=3;
      backup.tables.habits.forEach((row:Record<string,unknown>)=>{delete row.sort_order;row.id=['Чтение','Прогулка','Сон'].indexOf(String(row.name))+1;});
      writeFileSync(path,JSON.stringify(backup));
      importBackup(db,path);
      expect(h.list().habits.map(x=>x.name)).toEqual(['Сон','Прогулка','Чтение']);
      h.moveHabit(h.list().habits[1].id,'up');
      expect(h.list().habits.map(x=>x.name)).toEqual(['Прогулка','Сон','Чтение']);
    }finally{unlinkSync(path);}
  });
  it('moves money between accounts without changing total balance and calculates budget',()=>{
    const f=new FinanceRepository(db),now=localDateTime();
    f.saveAccount({name:'Карта',opening_cents:100000,active:1});f.saveAccount({name:'Наличные',opening_cents:0,active:1});
    f.saveCategory({name:'Продукты',kind:'expense',active:1});
    const accounts=f.list().accounts,card=accounts.find(a=>a.name==='Карта')!,cash=accounts.find(a=>a.name==='Наличные')!,category=f.list().categories[0];
    f.saveTransaction({occurred_at:now,amount_cents:20000,type:'transfer',account_id:card.id,target_account_id:cash.id,category_id:null,note:''});
    f.saveTransaction({occurred_at:now,amount_cents:5500,type:'expense',account_id:cash.id,target_account_id:null,category_id:category.id,note:''});
    f.setBudget({month:monthOf(localDay()),amount_cents:30000});
    const result=f.list();
    expect(result.accounts.find(a=>a.id===card.id)?.balance_cents).toBe(80000);
    expect(result.accounts.find(a=>a.id===cash.id)?.balance_cents).toBe(14500);
    expect(result.accounts.reduce((sum,a)=>sum+a.balance_cents,0)).toBe(94500);
    expect(result.month_expense).toBe(5500);expect(result.budget!.amount_cents-result.month_expense).toBe(24500);
    expect(result.balance_history).toHaveLength(90);
    expect(result.balance_history.at(-1)?.balance_cents).toBe(94500);
    expect(result.balance_history.at(-2)?.balance_cents).toBe(100000);
  });
  it('removes an accidental expense and recalculates balances and totals',()=>{
    const finance=new FinanceRepository(db);
    finance.saveAccount({name:'Карта',opening_cents:100_000,active:1});
    finance.saveCategory({name:'Еда',kind:'expense',active:1});
    const account=finance.list().accounts[0],category=finance.list().categories[0];
    finance.saveTransaction({occurred_at:localDateTime(),amount_cents:12_500,type:'expense',account_id:account.id,target_account_id:null,category_id:category.id,note:'Ошибочная запись'});
    const before=finance.list();
    expect(before.accounts[0].balance_cents).toBe(87_500);
    expect(before.month_expense).toBe(12_500);
    finance.deleteTransaction(before.transactions[0].id);
    const after=finance.list();
    expect(after.transactions).toHaveLength(0);
    expect(after.accounts[0].balance_cents).toBe(100_000);
    expect(after.month_expense).toBe(0);
    expect(after.category_totals).toHaveLength(0);
    expect(()=>finance.deleteTransaction(before.transactions[0].id)).toThrow('Операция уже удалена');
  });
  it('keeps status history, application counts and real experience links',()=>{
    const w=new WorkRepository(db);
    w.saveJob({title:'Аналитик',company:'Компания',url:'',source:'',city:'',work_mode:'',salary_from:null,salary_to:null,currency:'RUB',original_text:'SQL',notes:'',status:'saved'});
    const job=w.list().jobs[0];
    w.changeStatus(job.id,'applied','Отклик отправлен');
    w.saveEntry({organization:'Организация',position:'Аналитик',start_date:'2024-01',end_date:'',description:'',skills:'SQL',tools:''});
    const entry=w.list().entries[0];
    w.saveCase({entry_id:entry.id,title:'Отчёт',situation:'',task:'',actions:'',result:'',skills:'SQL',tools:'',tags:''});
    const experienceCase=w.list().cases[0];w.linkCase(job.id,experienceCase.id,true);
    const result=w.list();
    expect(result.weeklyApplications).toBe(1);expect(result.history.filter(e=>e.job_id===job.id)).toHaveLength(2);
    expect(result.links).toEqual([{job_id:job.id,case_id:experienceCase.id}]);
  });
  it('applies diary suggestions only once after review',()=>{
    const h=new HealthRepository(db),f=new FinanceRepository(db),w=new WorkRepository(db);
    f.saveAccount({name:'Карта',opening_cents:50000,active:1});f.saveCategory({name:'Еда',kind:'expense',active:1});
    const journal=new JournalService(db,null as unknown as AIGateway,h,f,w),entry=journal.save(localDay(),'Потратил 500 рублей на еду','text');
    const account=f.list().accounts[0],category=f.list().categories[0];
    const analysis={summary:'Расход на еду',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:null,energy:null,nutrition:null,workout:null,habits:[]},finance:[{type:'expense',amountCents:50000,categoryId:category.id,accountId:account.id,note:'Еда'}],work:[],uncertain:[]};
    db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(analysis),entry.id);
    journal.apply(entry.id,['finance.0']);journal.apply(entry.id,['finance.0']);
    expect(f.list().transactions).toHaveLength(1);
    expect(JSON.parse(journal.list()[0].applied_json)).toEqual(['finance.0']);
  });
  it('saves wake time alone and later combines it with bedtime',()=>{
    const h=new HealthRepository(db),f=new FinanceRepository(db),w=new WorkRepository(db);
    const journal=new JournalService(db,null as unknown as AIGateway,h,f,w);
    const day='2026-09-28';
    const wake=journal.save(day,'Встал в 8 утра','text');
    const base={summary:'Сон',health:{weightKg:null,sleepStart:null,sleepEnd:'08:00',mood:null,energy:null,nutrition:null,workout:null,habits:[]},finance:[],work:[],uncertain:[]};
    db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify(base),wake.id);
    journal.apply(wake.id,['health.sleep_end']);
    expect(h.getDay(day).daily).toMatchObject({sleep_start:null,sleep_end:'08:00',sleep_minutes:null});
    const bedtime=journal.save(day,'Лёг в 23:30','text');
    db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run(JSON.stringify({...base,health:{...base.health,sleepStart:'23:30',sleepEnd:null}}),bedtime.id);
    journal.apply(bedtime.id,['health.sleep_start']);
    expect(h.getDay(day).daily).toMatchObject({sleep_start:'23:30',sleep_end:'08:00',sleep_minutes:510});
  });
  it('updates an unanalysed diary draft in place',()=>{
    const h=new HealthRepository(db),f=new FinanceRepository(db),w=new WorkRepository(db);
    const journal=new JournalService(db,null as unknown as AIGateway,h,f,w);
    const first=journal.save(localDay(),'Начало','text');
    const updated=journal.update(first.id,localDay(),'Дополненная запись','text');
    expect(updated.id).toBe(first.id);
    expect(journal.list()).toHaveLength(1);
    expect(journal.list()[0].raw_text).toBe('Дополненная запись');
    db.prepare('UPDATE daily_journals SET analysis_json=? WHERE id=?').run('{}',first.id);
    expect(()=>journal.update(first.id,localDay(),'Поздняя правка','text')).toThrow();
  });
  it('exports and restores user data without losing foreign-key links',()=>{
    const h=new HealthRepository(db);
    h.saveHabit({name:'Прогулка',description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1});
    const habit=h.list().habits[0];
    h.saveDay({day:localDay(),comment:'',logs:[{habit_id:habit.id,value:1,status:'done',comment:''}]});
    const path=join(process.cwd(),'.test-backup.json');
    try{exportBackup(db,path);h.archiveHabit(habit.id);importBackup(db,path);expect(h.list().habits[0].active).toBe(1);expect(h.list().logs[0].habit_id).toBe(habit.id);}finally{unlinkSync(path);}
  });
});
