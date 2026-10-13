import {expect,it} from 'vitest';
import {weightTrend,savingsForecast,trainingSummary} from './focus-progress';
import type {Row} from './snapshot-sync';
const transfer=(day:string,amount:number,direction='in'):Row=>({type:'transfer',occurred_at:day+'T12:00:00',amount_cents:amount,account_id:direction==='in'?1:2,target_account_id:direction==='in'?2:1});
it('averages actual measurements once and does not invent measurements on missing days',()=>{
 const rows=[{day:'2026-10-01',weight_kg:100},{day:'2026-10-03',weight_kg:98},{day:'2026-10-08',weight_kg:96},{day:'2026-10-13',weight_kg:94}];
 const result=weightTrend(rows,'2026-10-01','2026-10-13');expect(result.current).toEqual({value:95,count:2});expect(result.previous).toEqual({value:99,count:2});expect(result.change).toBe(-4);
 expect(result.points.find(p=>p.day==='2026-10-07')?.value).toBe(99);expect(weightTrend(rows,'2026-10-21','2026-10-21').current.value).toBeNull();
});
it('projects real savings net of withdrawals, including days without deposits and excluding income',()=>{
 const rows=[transfer('2026-10-01',10000),transfer('2026-10-07',10000),transfer('2026-10-08',6000,'out'),{type:'income',occurred_at:'2026-10-07',amount_cents:900000,target_account_id:null}];
 const r=savingsForecast(rows,{startDay:'2026-10-01',targetCents:28000,targetDay:'2026-10-21'},'2026-10-14');expect(r.balance).toBe(14000);expect(r.dailyNet).toBe(1000);expect(r.predictedDay).toBe('2026-10-28');expect(r.weeklyRequired).toBe(14000);
 expect(savingsForecast([transfer('2026-10-14',5000)],{startDay:'2026-10-14',targetCents:10000},'2026-10-14').predictedDay).toBeNull();
 expect(savingsForecast(rows,{startDay:'2026-10-01',targetCents:1000},'2026-10-14').state).toBe('reached');
});
it('separates gym/sport sessions from walking and preserves unknown durations',()=>{
 const rows=[{id:1,day:'2026-10-13',type:'gym',minutes:45},{id:2,day:'2026-10-13',type:'sport',minutes:null},{id:3,day:'2026-10-13',type:'walk',minutes:90}];
 const r=trainingSummary(rows,'2026-10-13','2026-10-13');expect(r.sessions).toHaveLength(2);expect(r.other).toHaveLength(1);expect(r.days).toBe(1);expect(r.minutes).toBe(45);expect(r.missingDuration).toBe(1);expect(r.points[0].value).toBe(45);
});
