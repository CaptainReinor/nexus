import { describe, expect, it } from 'vitest';
import { habitStats, money, sleepDuration, toCents, weightStats } from './domain';
import type { Habit, HabitLog } from './models';
const habit: Habit = { id:1,name:'Чтение',description:'',kind:'positive',format:'quantity',target:20,period:'daily',active:1,sort_order:0,created_at:'' };
describe('domain calculations',()=>{
  it('stores money as cents',()=>{ expect(toCents('1 234,56')).toBe(123456); expect(()=>toCents('12.345')).toThrow(); expect(money(123456)).toContain('1 234'); });
  it('counts completion and series',()=>{ const logs: HabitLog[] = ['2026-09-25','2026-09-26','2026-09-27'].map((day,i)=>({id:i,habit_id:1,day,value:20,status:'done',comment:''})); expect(habitStats(habit,logs,'2026-09-27')).toMatchObject({ week:3, month:3, streak:3 }); });
  it('tracks an avoided habit separately',()=>{ const avoid: Habit={...habit,kind:'avoid',format:'avoidance'}; const logs: HabitLog[]=[{id:1,habit_id:1,day:'2026-09-27',value:0,status:'done',comment:''},{id:2,habit_id:1,day:'2026-09-26',value:2,status:'missed',comment:''}]; expect(habitStats(avoid,logs,'2026-09-27')).toMatchObject({streak:1,incidents:2}); });
  it('calculates sleep across midnight and weight average',()=>{ expect(sleepDuration('23:30','07:00')).toBe(450); expect(weightStats([{id:1,day:'2026-09-20',weight_kg:80},{id:2,day:'2026-09-27',weight_kg:79}])).toMatchObject({current:79,previousDelta:-1,previousWeekAverage:80}); });
});
