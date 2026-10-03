import {expect,it} from 'vitest';
import {defaultReminders,reminderPlan,reminderSchema} from './reminders';
import type {Snapshot} from './snapshot-sync';
const id='20000000-0000-4000-8000-000000000002';
const fresh=():Snapshot=>({format:'nexus-backup',version:11,exportedAt:'',tables:{scheduled_payments:[{id,name:'Интернет',amount_cents:90000,account_id:1,category_id:1,cadence:'monthly',start_day:'2026-01-31',active:1,updated_at:''}],payment_occurrences:[]}});
const settings={...defaultReminders,payments:true,quiet:false,paymentsDaysBefore:3,paymentsTime:'10:00'};
it('reminds ahead of clamped monthly payments and on their actual due dates without creating expenses',()=>{
 const s=fresh(),before=structuredClone(s),plan=reminderPlan(s,settings,new Date('2026-02-24T08:00:00')).filter(p=>p.paymentOccurrenceId===`${id}:2026-02-28`);
 expect(plan.map(p=>new Date(p.at).getDate())).toEqual([25,28]);expect(plan.every(p=>p.repeatDays.length===0)).toBe(true);expect(plan[0].body).toContain('28.02.2026');expect(plan[0].body).toContain('900');expect(s).toEqual(before);
 const march=reminderPlan(s,settings,new Date('2026-03-01T08:00:00')).filter(p=>p.paymentOccurrenceId===`${id}:2026-03-31`);expect(march.map(p=>new Date(p.at).getDate())).toEqual([28,31]);
});
it('cancels paid, skipped and stopped payments, keeping each future occurrence independent',()=>{
 const s=fresh();s.tables.payment_occurrences=[{id:`${id}:2026-02-28`,payment_id:id,due_day:'2026-02-28',status:'paid',amount_cents:80000},{id:`${id}:2026-03-31`,payment_id:id,due_day:'2026-03-31',status:'skipped',amount_cents:90000}];
 const plan=reminderPlan(s,settings,new Date('2026-02-24T08:00:00'));expect(plan.some(p=>p.paymentOccurrenceId===`${id}:2026-02-28`||p.paymentOccurrenceId===`${id}:2026-03-31`)).toBe(false);expect(plan.some(p=>p.paymentOccurrenceId===`${id}:2026-04-30`)).toBe(true);expect(new Set(plan.map(p=>p.ruleId)).size).toBe(plan.length);
 s.tables.scheduled_payments[0].active=0;expect(reminderPlan(s,settings,new Date('2026-02-24T08:00:00'))).toEqual([]);
});
it('respects quiet hours and does not duplicate a same-day reminder or resurrect old ones',()=>{
 const s=fresh(),plan=reminderPlan(s,{...settings,quiet:true,paymentsDaysBefore:0,paymentsTime:'23:00'},new Date('2026-02-28T08:00:00')).filter(p=>p.paymentOccurrenceId===`${id}:2026-02-28`);
 expect(plan).toHaveLength(1);expect(new Date(plan[0].at).getHours()).toBe(8);expect(new Date(plan[0].at).getMonth()).toBe(2);expect(plan[0].repeatDays).toEqual([]);
 expect(reminderPlan(s,settings,new Date('2026-03-01T08:00:00')).some(p=>p.paymentOccurrenceId===`${id}:2026-02-28`)).toBe(false);
 expect(reminderPlan(s,{...settings,paymentsOnDue:false},new Date('2026-02-24T08:00:00')).filter(p=>p.paymentOccurrenceId===`${id}:2026-02-28`)).toHaveLength(1);
});
it('projects yearly payments beyond the materialized month and upgrades old notification settings safely',()=>{
 const s=fresh();Object.assign(s.tables.scheduled_payments[0],{cadence:'yearly',start_day:'2024-02-29'});const plan=reminderPlan(s,settings,new Date('2026-10-04T08:00:00'));expect(plan.some(p=>p.paymentOccurrenceId===`${id}:2027-02-28`)).toBe(true);
 const {payments,paymentsDaysBefore,paymentsOnDue,paymentsTime,paymentsText,...old}=defaultReminders;void [payments,paymentsDaysBefore,paymentsOnDue,paymentsTime,paymentsText];expect(reminderSchema.parse(old)).toEqual(defaultReminders);expect(reminderSchema.safeParse({...settings,paymentsDaysBefore:31}).success).toBe(false);
});
