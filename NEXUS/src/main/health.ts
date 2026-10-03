import type { DB } from './database';
import type { DailyInput, DayFieldInput, Habit, HabitLogInput, HealthData } from '../shared/models';
import { localDay, sleepDuration } from '../shared/domain';

export class HealthRepository {
  constructor(private db: DB) {}
  getDay(day:string): {daily:HealthData['daily'];weight:number|null;workout:HealthData['workouts'][number]|null;logs:HealthData['logs']} {
    return {daily:(this.db.prepare('SELECT * FROM health_daily_entries WHERE day=?').get(day) as HealthData['daily'])??null,weight:(this.db.prepare('SELECT weight_kg FROM weight_entries WHERE day=?').get(day) as {weight_kg:number}|undefined)?.weight_kg??null,workout:(this.db.prepare('SELECT * FROM workouts WHERE day=?').get(day) as HealthData['workouts'][number])??null,logs:this.db.prepare('SELECT * FROM habit_logs WHERE day=?').all(day) as HealthData['logs']};
  }
  list(): HealthData {
    const day = localDay();
    return {
      habits: this.db.prepare('SELECT * FROM habits ORDER BY active DESC, sort_order ASC, id DESC').all() as Habit[],
      logs: this.db.prepare('SELECT * FROM habit_logs ORDER BY day DESC LIMIT 1500').all() as HealthData['logs'],
      daily: (this.db.prepare('SELECT * FROM health_daily_entries WHERE day=?').get(day) as HealthData['daily']) ?? null,
      weights: this.db.prepare('SELECT * FROM weight_entries ORDER BY day DESC LIMIT 1000').all() as HealthData['weights'],
      workouts: this.db.prepare('SELECT * FROM workouts ORDER BY day DESC LIMIT 365').all() as HealthData['workouts'],
      history: this.db.prepare('SELECT * FROM health_daily_entries ORDER BY day DESC LIMIT 90').all() as HealthData['history']
    };
  }
  saveHabit(input: Omit<Habit,'id'|'created_at'|'sort_order'> & {id?: number}): void {
    if(input.id&&this.db.prepare('SELECT 1 FROM care_slots WHERE habit_id=? AND active=1').get(input.id)&&(input.period!=='daily'||input.kind!=='positive'||input.format!=='boolean'))throw new Error('Сначала уберите отдельные выполнения этого пункта.');
    if (input.id) this.db.prepare('UPDATE habits SET name=?,description=?,kind=?,format=?,target=?,period=?,active=? WHERE id=?').run(input.name,input.description,input.kind,input.format,input.target,input.period,input.active,input.id);
    else this.db.prepare('INSERT INTO habits(id,name,description,kind,format,target,period,active,sort_order,created_at) VALUES (nexus_id(),?,?,?,?,?,?,?,?,?)').run(input.name,input.description,input.kind,input.format,input.target,input.period,input.active,(this.db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM habits').get() as {next:number}).next,new Date().toISOString());
  }
  moveHabit(id:number,direction:'up'|'down'): void {
    this.db.transaction(()=>{
      const habits=this.db.prepare('SELECT id FROM habits WHERE active=1 ORDER BY sort_order ASC,id DESC').all() as {id:number}[];
      const index=habits.findIndex(h=>h.id===id),other=index+(direction==='up'?-1:1);
      if(index<0||other<0||other>=habits.length)return;
      const first=habits[index].id,second=habits[other].id;
      const positions=this.db.prepare('SELECT id,sort_order FROM habits WHERE id IN (?,?)').all(first,second) as {id:number;sort_order:number}[];
      const a=positions.find(h=>h.id===first)!,b=positions.find(h=>h.id===second)!;
      if(a.sort_order===b.sort_order){
        habits.forEach((h,i)=>this.db.prepare('UPDATE habits SET sort_order=? WHERE id=?').run(i,h.id));
        this.db.prepare('UPDATE habits SET sort_order=? WHERE id=?').run(other,first);
        this.db.prepare('UPDATE habits SET sort_order=? WHERE id=?').run(index,second);
      }else{
        this.db.prepare('UPDATE habits SET sort_order=? WHERE id=?').run(b.sort_order,first);
        this.db.prepare('UPDATE habits SET sort_order=? WHERE id=?').run(a.sort_order,second);
      }
    })();
  }
  archiveHabit(id: number): void { this.db.prepare('UPDATE habits SET active=0 WHERE id=?').run(id); }
  saveHabitLog(input:HabitLogInput): void {
    if(this.db.prepare('SELECT 1 FROM care_slots WHERE habit_id=? AND active=1 AND substr(created_at,1,10)<=?').get(input.habit_id,input.day))throw new Error('Отметьте отдельные выполнения этого пункта.');
    this.db.prepare(`INSERT INTO habit_logs(id,habit_id,day,value,status,comment) VALUES (nexus_id(),@habit_id,@day,@value,@status,@comment)
      ON CONFLICT(habit_id,day) DO UPDATE SET value=excluded.value,status=excluded.status,comment=excluded.comment`).run(input);
  }
  saveDayField(input:DayFieldInput): void {
    this.db.transaction(()=>{
      if(input.field==='weight'){
        if(input.value===null)this.db.prepare('DELETE FROM weight_entries WHERE day=?').run(input.day);
        else this.db.prepare('INSERT INTO weight_entries(id,day,weight_kg) VALUES (nexus_id(),?,?) ON CONFLICT(day) DO UPDATE SET weight_kg=excluded.weight_kg').run(input.day,input.value);
        return;
      }
      this.db.prepare('INSERT OR IGNORE INTO health_daily_entries(day) VALUES (?)').run(input.day);
      if(input.field==='sleep_start'||input.field==='sleep_end'){
        this.db.prepare(`UPDATE health_daily_entries SET ${input.field}=? WHERE day=?`).run(input.value,input.day);
        const times=this.db.prepare('SELECT sleep_start,sleep_end FROM health_daily_entries WHERE day=?').get(input.day) as {sleep_start:string|null;sleep_end:string|null};
        const minutes=times.sleep_start&&times.sleep_end?sleepDuration(times.sleep_start,times.sleep_end):null;
        this.db.prepare('UPDATE health_daily_entries SET sleep_minutes=? WHERE day=?').run(minutes,input.day);
      }else if(input.field==='mood'||input.field==='energy'||input.field==='nutrition'||input.field==='comment'){
        this.db.prepare(`UPDATE health_daily_entries SET ${input.field}=? WHERE day=?`).run(input.value,input.day);
      }
    })();
  }
  saveDay(input: DailyInput): void {
    this.db.transaction(()=>{
      this.db.prepare(`INSERT INTO health_daily_entries(day,sleep_start,sleep_end,sleep_minutes,mood,energy,nutrition,comment) VALUES (@day,@sleep_start,@sleep_end,@sleep_minutes,@mood,@energy,@nutrition,@comment)
      ON CONFLICT(day) DO UPDATE SET sleep_start=excluded.sleep_start,sleep_end=excluded.sleep_end,sleep_minutes=excluded.sleep_minutes,mood=excluded.mood,energy=excluded.energy,nutrition=excluded.nutrition,comment=excluded.comment`).run({ day:input.day,sleep_start:input.sleep_start??null,sleep_end:input.sleep_end??null,sleep_minutes:input.sleep_minutes??null,mood:input.mood??null,energy:input.energy??null,nutrition:input.nutrition??null,comment:input.comment??'' });
      if (input.weight != null) this.db.prepare('INSERT INTO weight_entries(id,day,weight_kg) VALUES (nexus_id(),?,?) ON CONFLICT(day) DO UPDATE SET weight_kg=excluded.weight_kg').run(input.day,input.weight);
      if (input.workout) this.db.prepare('INSERT INTO workouts(id,day,done,type,minutes,comment) VALUES (nexus_id(),?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET done=excluded.done,type=excluded.type,minutes=excluded.minutes,comment=excluded.comment').run(input.day,Number(input.workout.done),input.workout.type,input.workout.minutes,input.workout.comment);
      for (const log of input.logs.filter(log=>!this.db.prepare('SELECT 1 FROM care_slots WHERE habit_id=? AND active=1 AND substr(created_at,1,10)<=?').get(log.habit_id,input.day))) this.db.prepare(`INSERT INTO habit_logs(id,habit_id,day,value,status,comment) VALUES (nexus_id(),?,?,?,?,?) ON CONFLICT(habit_id,day) DO UPDATE SET value=excluded.value,status=excluded.status,comment=excluded.comment`).run(log.habit_id,input.day,log.value,log.status,log.comment);
    })();
  }
}
