import { expect, it } from 'vitest';
import { displayDay,habitDueToday,habitPeriodState,habitStats } from './domain';
import { dailyHabitSummary, weekRange, weeklyHealth, weeklyInvestments } from './weekly';
import type { Habit, HabitLog, HealthData } from './models';

const habit:Habit={id:1,name:'Недельная',description:'',kind:'positive',format:'boolean',target:1,period:'weekly',active:1,sort_order:0,created_at:''};
const log=(day:string):HabitLog=>({id:1,habit_id:1,day,value:1,status:'done',comment:''});
it('fails missing completed periods, leaves today pending and never invents avoidance success',()=>{
 const daily={...habit,period:'daily' as const,created_at:'2026-09-28T00:00:00Z'};
 expect(habitPeriodState(daily,[],'2026-09-29','2026-09-30')).toBe('failure');
 expect(habitPeriodState(daily,[],'2026-09-30','2026-09-30')).toBe('unmarked');
 expect(habitPeriodState(daily,[],'2026-09-27','2026-09-30')).toBe('unmarked');
 expect(habitPeriodState({...daily,kind:'avoid'},[],'2026-09-29','2026-09-30')).toBe('failure');
 expect(habitPeriodState({...daily,kind:'avoid'},[{...log('2026-09-29'),value:0}],'2026-09-29','2026-09-30')).toBe('success');
 expect(habitPeriodState(habit,[log('2026-09-27')],'2026-09-28','2026-09-30')).toBe('unmarked');
 expect(habitPeriodState(habit,[],'2026-09-21','2026-09-30')).toBe('failure');
 expect(habitPeriodState(habit,[log('2026-09-27')],'2026-09-21','2026-09-30')).toBe('success');
 expect(displayDay('2026-10-06')).toBe('06.10.2026');
});
it('never counts Sunday in the following Monday week, even with a Sunday preference',()=>{
  const logs=[log('2026-09-27')];
  expect(habitDueToday(habit,logs,'2026-09-28')).toBe(true);
  expect(habitStats(habit,logs,'2026-09-30',0).week).toBe(0);
  expect(habitDueToday(habit,[...logs,log('2026-09-28')],'2026-09-30')).toBe(false);
  expect(habitDueToday(habit,[...logs,log('2026-09-28')],'2026-10-05')).toBe(true);
  expect(habitStats(habit,[log('2026-09-21'),log('2026-09-22'),log('2026-09-28')],'2026-09-30').streak).toBe(2);
});
it('excludes weekly habits from the daily dashboard count',()=>{
  expect(dailyHabitSummary({habits:[habit,{...habit,id:2,period:'daily'}],logs:[log('2026-09-30')]},'2026-09-30')).toEqual({total:1,completed:0});
});
it('uses Monday boundaries across month/year and truncates the current week at today',()=>{
  expect(weekRange('current','2026-09-30')).toEqual({start:'2026-09-28',end:'2026-09-30'});
  expect(weekRange('previous','2026-01-01')).toEqual({start:'2025-12-22',end:'2025-12-28'});
});
it('keeps the unfinished week and today pending and only averages recorded sleep',()=>{
  const data:HealthData={habits:[habit,{...habit,id:2,period:'daily',created_at:'2026-09-29T12:00:00Z'}],logs:[log('2026-09-27'),{...log('2026-09-29'),habit_id:2}],weights:[{id:1,day:'2026-09-29',weight_kg:80}],daily:null,workouts:[],history:[{day:'2026-09-29',sleep_start:null,sleep_end:null,sleep_minutes:420,mood:null,energy:null,nutrition:null,comment:''}]};
  const result=weeklyHealth(data,'2026-09-28','2026-09-30','2026-09-30');
  expect(result.habits).toMatchObject([{completed:0,observed:0,expected:1},{completed:1,observed:1,expected:2}]);
  expect(result.sleepAverage).toBe(420);expect(result.sleepDays).toBe(1);
});
it('includes missing closed days and closed weeks in failed weekly totals',()=>{
 const data:HealthData={habits:[habit,{...habit,id:2,period:'daily',created_at:'2026-09-29'}],logs:[],weights:[],daily:null,workouts:[],history:[]};
 expect(weeklyHealth(data,'2026-09-28','2026-10-04','2026-10-05').habits).toMatchObject([{completed:0,observed:1,expected:1},{completed:0,observed:6,expected:6}]);
});
it('calculates weekly investment result from the last baseline and excludes deposits',()=>{
  const result=weeklyInvestments({accounts:[{id:1,name:'Биржа',active:1}],entries:[{id:1,account_id:1,day:'2026-09-27',value_cents:10000,flow_cents:10000,note:''},{id:2,account_id:1,day:'2026-09-29',value_cents:15100,flow_cents:5000,note:''},{id:3,account_id:1,day:'2026-10-01',value_cents:15200,flow_cents:0,note:''}]},'2026-09-28','2026-09-30');
  expect(result).toEqual([{name:'Биржа',value:15100,profit:100,measurements:1}]);
});
