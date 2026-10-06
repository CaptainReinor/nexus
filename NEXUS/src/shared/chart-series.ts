import type {ChartPoint} from './chart-geometry';

/** Presentation only: do not turn carried values into observations in storage. */
export function carryChartValues(points:ChartPoint[],throughDay?:string):ChartPoint[]{
  if(!points.length||points.some(p=>!/^\d{4}-\d{2}-\d{2}$/.test(p.day)||!Number.isFinite(Date.parse(p.day))))return points;
  const ordered=[...points].sort((a,b)=>a.day.localeCompare(b.day));
  const byDay=new Map(ordered.map(p=>[p.day,p.value]));
  const end=Math.max(Date.parse(ordered.at(-1)!.day),throughDay?Date.parse(throughDay):0);
  if(!Number.isFinite(end))return points;
  let previous:number|null=null;
  const result:ChartPoint[]=[];
  for(let time=Date.parse(ordered[0].day);time<=end;time+=86400000){
    const day=new Date(time).toISOString().slice(0,10),value=byDay.get(day);
    if(value!=null&&Number.isFinite(value))previous=value;
    result.push({day,value:previous});
  }
  return result;
}
