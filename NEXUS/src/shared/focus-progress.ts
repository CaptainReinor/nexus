import type {Row} from './snapshot-sync';
import {shiftDay} from './daily-core';
import {savingsBalance} from './focus-savings';

const dayDifference=(a:string,b:string)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
export function weightTrend(rows:Row[],start:string,end:string){
 const actual=new Map<string,number>();for(const row of rows)if(typeof row.weight_kg==='number'&&row.weight_kg>0&&String(row.day)<=end)actual.set(String(row.day),row.weight_kg);
 const mean=(from:string,to:string)=>{const values=[...actual].filter(([day])=>day>=from&&day<=to).map(([,value])=>value);return {value:values.length?values.reduce((n,v)=>n+v,0)/values.length:null,count:values.length};};
 const current=mean(shiftDay(end,-6),end),previous=mean(shiftDay(end,-13),shiftDay(end,-7));
 const ordered=[...actual].sort(([a],[b])=>a.localeCompare(b));let right=0,left=0,sum=0;
 const points=[];for(let day=start;day<=end;day=shiftDay(day,1)){while(right<ordered.length&&ordered[right][0]<=day)sum+=ordered[right++][1];const from=shiftDay(day,-6);while(left<right&&ordered[left][0]<from)sum-=ordered[left++][1];points.push({day,value:right>left?sum/(right-left):null});}
 return {points,current,previous,change:current.value!==null&&previous.value!==null?current.value-previous.value:null};
}
export function savingsForecast(rows:Row[],config:{startDay:string;targetCents:number|null;targetDay?:string|null},end:string){
 const money=rows.filter(r=>String(r.occurred_at).slice(0,10)>=config.startDay&&String(r.occurred_at).slice(0,10)<=end),balance=savingsBalance(money);
 const from=[config.startDay,shiftDay(end,-27)].sort().at(-1)!,windowDays=Math.max(1,dayDifference(from,end)+1),recent=money.filter(r=>String(r.occurred_at).slice(0,10)>=from);
 const dailyNet=savingsBalance(recent)/windowDays,depositDays=new Set(recent.filter(r=>r.type==='transfer'&&r.target_account_id===2).map(r=>String(r.occurred_at).slice(0,10))).size;
 const remaining=config.targetCents===null?null:Math.max(0,config.targetCents-balance),deadlineDays=config.targetDay?dayDifference(end,config.targetDay):null;
 const weeklyRequired=remaining!==null&&deadlineDays!==null&&deadlineDays>0?Math.ceil(remaining*7/deadlineDays):null;
 const enough=windowDays>=7&&depositDays>=2;
 const predictedDays=remaining!==null&&dailyNet>0&&enough?Math.ceil(remaining/dailyNet):null;
 const predictedDay=remaining===0?end:predictedDays!==null&&predictedDays<=3650?shiftDay(end,predictedDays):null;
 return {balance,remaining,windowDays,dailyNet,weeklyNet:Math.round(dailyNet*7),weeklyRequired,predictedDay,ready:enough,state:remaining===null?'no-goal':remaining===0?'reached':deadlineDays!==null&&deadlineDays<=0?'overdue':!enough?'insufficient':dailyNet<=0?'no-growth':'growing'};
}
export function trainingSummary(rows:Row[],start:string,end:string){
 const sessions=rows.filter(r=>['gym','sport'].includes(String(r.type))&&String(r.day)>=start&&String(r.day)<=end),other=rows.filter(r=>!['gym','sport'].includes(String(r.type))&&String(r.day)>=start&&String(r.day)<=end);
 const known=sessions.filter(r=>typeof r.minutes==='number'),minutes=known.reduce((n,r)=>n+Number(r.minutes),0),days=new Set(sessions.map(r=>String(r.day)));
 const totals=new Map<string,number>();for(const row of known)totals.set(String(row.day),(totals.get(String(row.day))??0)+Number(row.minutes));
 const points=[];for(let day=start;day<=end;day=shiftDay(day,1))points.push({day,value:totals.get(day)??null});
 return {sessions,other,days:days.size,minutes:known.length?minutes:null,averageMinutes:known.length?minutes/known.length:null,missingDuration:sessions.length-known.length,points};
}
