import {displayDay,localDay,money} from './domain';
import {shiftDay} from './daily-core';
import {paymentDate,type ScheduledPayment} from './payments';
import type {Snapshot} from './snapshot-sync';
import type {ReminderSettings} from './reminders';

export function paymentReminderCandidates(s:Snapshot,settings:ReminderSettings,now:Date){
  if(!settings.payments)return [];
  const today=localDay(now),through=shiftDay(today,365),until=shiftDay(through,settings.paymentsDaysBefore);
  let currency='RUB';try{currency=JSON.parse(String(s.tables.settings?.find(x=>x.key==='currency')?.value??'"RUB"'));}catch{/* Use the default currency. */}
  const result:{ruleId:string;day:string;title:string;body:string;paymentId:string;paymentOccurrenceId:string}[]=[];
  for(const p of (s.tables.scheduled_payments??[]).filter(x=>x.active) as unknown as ScheduledPayment[]){
    const occurrences=new Map((s.tables.payment_occurrences??[]).filter(o=>o.payment_id===p.id&&String(o.due_day)>=today&&String(o.due_day)<=until).map(o=>[String(o.due_day),o]));
    for(let i=0;i<2000;i++){const due=paymentDate(p.start_day,p.cadence,i);if(due>until)break;if(due<today||occurrences.has(due))continue;occurrences.set(due,{id:`${p.id}:${due}`,due_day:due,status:'open',amount_cents:p.amount_cents});}
    for(const [due,o] of occurrences){
      if(o.status!=='open')continue;
      const dates=new Set<string>();if(settings.paymentsDaysBefore>0)dates.add(shiftDay(due,-settings.paymentsDaysBefore));if(settings.paymentsOnDue||settings.paymentsDaysBefore===0)dates.add(due);
      for(const day of dates){if(day<today||day>through)continue;result.push({ruleId:`payment:${p.id}:${due}:${day}`,day,title:`Платёж: ${p.name}`.slice(0,120),body:`${money(Number(o.amount_cents),currency)} · ${displayDay(due)}. ${settings.paymentsText}`.slice(0,300),paymentId:p.id,paymentOccurrenceId:String(o.id)});}
    }
  }
  return result;
}
