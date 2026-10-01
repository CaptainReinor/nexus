import { habitPeriodState, habitSuccess, localDay, weekStart } from './domain';
import type { HealthData, InvestmentData } from './models';

export function weekRange(period:'current'|'previous',today=localDay()) {
  const date=new Date(`${weekStart(new Date(`${today}T12:00:00`),1)}T12:00:00`);
  if(period==='previous')date.setDate(date.getDate()-7);
  const start=localDay(date);date.setDate(date.getDate()+6);
  return {start,end:period==='current'?today:localDay(date)};
}

export function dailyHabitSummary(data:Pick<HealthData,'habits'|'logs'>,day=localDay()) {
  const habits=data.habits.filter(h=>h.active&&h.period==='daily');
  return {total:habits.length,completed:habits.filter(h=>habitSuccess(h,data.logs.find(l=>l.habit_id===h.id&&l.day===day))).length};
}

export function weeklyHealth(data:HealthData,start:string,end:string,today=localDay()) {
  const days:string[]=[];const date=new Date(`${start}T12:00:00`);
  while(localDay(date)<=end&&localDay(date)<=today){days.push(localDay(date));date.setDate(date.getDate()+1);}
  const habits=data.habits.filter(h=>h.active).map(h=>{
    const logs=data.logs.filter(l=>l.habit_id===h.id&&l.day>=start&&l.day<=end&&l.day<=today&&l.status!=='skipped');
    const successes=logs.filter(l=>habitSuccess(h,l));
    return {id:h.id,name:h.name,period:h.period,completed:h.period==='weekly'?Number(successes.length>0):new Set(successes.map(l=>l.day)).size,
      observed:h.period==='weekly'?Number(habitPeriodState(h,data.logs,start,today)!=='unmarked'):days.filter(d=>(!h.created_at||d>=h.created_at.slice(0,10))&&habitPeriodState(h,data.logs,d,today)!=='unmarked').length,
      expected:h.period==='weekly'?1:days.filter(day=>!h.created_at||day>=h.created_at.slice(0,10)).length};
  });
  const weights=data.weights.filter(w=>w.day>=start&&w.day<=end).sort((a,b)=>a.day.localeCompare(b.day));
  const sleep=data.history.filter(d=>d.day>=start&&d.day<=end&&d.sleep_minutes!=null);
  return {habits,weightStart:weights[0]?.weight_kg??null,weightEnd:weights.at(-1)?.weight_kg??null,weightMeasurements:weights.length,
    sleepDays:sleep.length,sleepAverage:sleep.length?Math.round(sleep.reduce((sum,d)=>sum+d.sleep_minutes!,0)/sleep.length):null};
}

export function weeklyInvestments(data:InvestmentData,start:string,end:string) {
  return data.accounts.filter(a=>a.active).map(a=>{
    const entries=data.entries.filter(e=>e.account_id===a.id&&e.day<=end).sort((x,y)=>x.day.localeCompare(y.day));
    const baseline=entries.filter(e=>e.day<start).at(-1)??entries.find(e=>e.day>=start);
    const latest=entries.at(-1),changed=entries.some(e=>e.day>=start);
    if(!baseline||!latest||!changed)return {name:a.name,value:latest?.value_cents??null,profit:null,measurements:0};
    const flow=entries.filter(e=>e.day>baseline.day).reduce((sum,e)=>sum+e.flow_cents,0);
    return {name:a.name,value:latest.value_cents,profit:latest.value_cents-baseline.value_cents-flow,measurements:entries.filter(e=>e.day>=start).length};
  });
}
