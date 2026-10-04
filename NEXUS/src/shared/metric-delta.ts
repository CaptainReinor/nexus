export type MetricKind='weight'|'sleep';
export type MetricObservation={id:string|number;day:string;value:number|null};
export type MetricGoal=number|{min:number;max:number};
export type MetricAssessment='favorable'|'unfavorable'|'neutral'|'unknown';
export const metricPolicies={weight:'decrease',sleep:'increase'} as const;
const distance=(value:number,goal:MetricGoal)=>typeof goal==='number'?Math.abs(value-goal):Math.max(goal.min-value,value-goal.max,0);
export function metricDelta(kind:MetricKind,current:number|null,previous:number|null,goal?:MetricGoal){
  if(current===null||previous===null||!Number.isFinite(current)||!Number.isFinite(previous))return null;
  const raw=current-previous,rounded=kind==='weight'?Math.round((raw+Number.EPSILON)*10)/10:Math.round(raw),delta=rounded===0?0:rounded;
  const direction=delta===0?'flat':delta>0?'up':'down';
  let assessment:MetricAssessment='neutral';
  if(delta!==0){
    if(goal!==undefined){const difference=distance(current,goal)-distance(previous,goal);assessment=Math.abs(difference)<1e-9?'neutral':difference<0?'favorable':'unfavorable';}
    else assessment=(metricPolicies[kind]==='decrease'?delta<0:delta>0)?'favorable':'unfavorable';
  }
  const amount=Math.abs(delta),unit=kind==='weight'?`${amount.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})} кг`:amount<60?`${amount} мин`:`${Math.floor(amount/60)} ч${amount%60?` ${amount%60} мин`:''}`;
  return {delta,direction,assessment,text:`${direction==='up'?'↑':direction==='down'?'↓':'→'} ${delta>0?'+':delta<0?'−':''}${unit}`,raw};
}
export function metricComparison(kind:MetricKind,observations:MetricObservation[],asOf='9999-12-31'){
  const valid=observations.filter(row=>row.day<=asOf&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&row.value!==null&&Number.isFinite(row.value)&&(kind==='weight'?row.value>0:row.value>=0)).sort((a,b)=>b.day.localeCompare(a.day)||String(b.id).localeCompare(String(a.id)));
  const current=valid[0],previous=current?valid.find(row=>row.id!==current.id&&row.day<current.day):undefined;
  return {current,previous};
}
export const weightObservations=(rows:{id:number;day:string;weight_kg:number}[]):MetricObservation[]=>rows.map(row=>({id:row.id,day:row.day,value:row.weight_kg}));
export const sleepObservations=(rows:{day:string;sleep_minutes:number|null}[]):MetricObservation[]=>rows.map(row=>({id:row.day,day:row.day,value:row.sleep_minutes}));
