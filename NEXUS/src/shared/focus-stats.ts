import type {Snapshot,Row} from './snapshot-sync';
import {savingsBalance} from './focus-savings';
import {nutritionTotals} from './nutrition';
import {focusConfig} from './focus-mode';
import {focusSnapshot,focusBoundary} from './focus-isolation';
import {localDay,weekStart} from './domain';
import {shiftDay} from './daily-core';
import {weightTrend,savingsForecast,trainingSummary} from './focus-progress';
import {carryChartValues} from './chart-series';
export function focusStats(s:Snapshot,end=localDay(),days:number|null=7){
 s=focusSnapshot(s);const config={...focusConfig(s),startDay:focusBoundary(s)?.day??localDay()},start=days===null?config.startDay:[config.startDay,shiftDay(end,-days+1)].sort().at(-1)!;
 const range=(table:string,key='day')=>(s.tables[table]??[]).filter(r=>String(r[key]).slice(0,10)>=start&&String(r[key]).slice(0,10)<=end);
 const periodMoney=range('finance_transactions','occurred_at'),money=periodMoney.filter(r=>r.type!=='transfer'),savings=periodMoney.filter(r=>r.type==='transfer'),foods=range('food_entries'),activities=range('activity_entries'),sleep=range('health_daily_entries').filter(r=>typeof r.sleep_minutes==='number'),weights=(s.tables.weight_entries??[]).filter(r=>String(r.day)<=end).sort((a,b)=>String(a.day).localeCompare(String(b.day)));
 const sums=(type:string,rows=money)=>rows.filter(r=>r.type===type).reduce((n,r)=>n+Number(r.amount_cents),0);
 const daysList:string[]=[];for(let day=start;day<=end;day=shiftDay(day,1))daysList.push(day);
 const byDay=(rows:Row[],value:(r:Row)=>number,key='day')=>{const totals=new Map<string,number>();for(const row of rows){const day=String(row[key]).slice(0,10);totals.set(day,(totals.get(day)??0)+value(row));}return daysList.map(day=>{return {day,value:totals.get(day)??null};});};
 const gymDays=new Set((s.tables.activity_entries??[]).filter(r=>r.type==='gym'&&String(r.day)<=end).map(r=>String(r.day)));

 const goalMoney=(s.tables.finance_transactions??[]).filter(r=>String(r.occurred_at).slice(0,10)>=config.startDay&&String(r.occurred_at).slice(0,10)<=end);
 const week=weekStart(new Date(`${end}T12:00:00`),1);
 const knownFoods=foods.filter(r=>typeof r.kcal==='number'),knownActivities=activities.filter(r=>typeof r.minutes==='number');
 const categoryTotals=new Map<string,number>();for(const row of money.filter(r=>r.type==='expense')){const name=String(s.tables.finance_categories?.find(c=>c.id===row.category_id)?.name??'Без категории');categoryTotals.set(name,(categoryTotals.get(name)??0)+Number(row.amount_cents));}
 const sleepByDay=new Map(sleep.map(r=>[String(r.day),Number(r.sleep_minutes)]));
 const carried=carryChartValues(weights.map(r=>({day:String(r.day),value:Number(r.weight_kg)})),end).filter(r=>r.day>=start);
 const savingsDays=new Map<string,number>();let savingsTotal=savingsBalance(goalMoney.filter(r=>String(r.occurred_at).slice(0,10)<start));for(const row of goalMoney){const day=String(row.occurred_at).slice(0,10);if(day>=start)savingsDays.set(day,(savingsDays.get(day)??0)+savingsBalance([row]));}const savingsChart=daysList.map(day=>({day,value:(savingsTotal+=savingsDays.get(day)??0)}));
 return {start,end,config,weightTrend:weightTrend(weights,start,end),forecast:savingsForecast(goalMoney,config,end),training:trainingSummary(activities,start,end),nutrition:nutritionTotals(foods),weights,sleep,money,foods,activities,expense:sums('expense'),income:sums('income'),net:sums('income')-sums('expense'),goalNet:savingsBalance(goalMoney),saved:savingsBalance(goalMoney),savings,gym:[...gymDays].filter(d=>d>=start).length,gymThisWeek:[...gymDays].filter(d=>d>=week).length,sleepAverage:sleep.length?sleep.reduce((n,r)=>n+Number(r.sleep_minutes),0)/sleep.length:null,kcal:knownFoods.reduce((n,r)=>n+Number(r.kcal),0),foodDays:new Set(knownFoods.map(r=>r.day)).size,unknownFood:foods.length-knownFoods.length,estimated:foods.some(r=>r.estimated===1),categories:[...categoryTotals].sort((a,b)=>b[1]-a[1]),charts:{savings:savingsChart,weight:carried,sleep:daysList.map(day=>({day,value:sleepByDay.get(day)??null})),expense:byDay(money.filter(r=>r.type==='expense'),r=>Number(r.amount_cents),'occurred_at'),food:byDay(knownFoods,r=>Number(r.kcal)),activity:byDay(knownActivities,r=>Number(r.minutes))}};
}
