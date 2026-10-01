import { displayDay } from '../../NEXUS/src/shared/domain';
import { useState } from 'react';

export function MobileChart({points,formatValue,kind='line'}:{points:{day:string;value:number}[];formatValue:(value:number)=>string;kind?:'line'|'bar'}){
 const [selected,setSelected]=useState<number|null>(null);
 if(points.length<2)return <p className="muted">Добавьте ещё одну запись для графика.</p>;
 const min=kind==='bar'?Math.min(0,...points.map(x=>x.value)):Math.min(...points.map(x=>x.value)),max=Math.max(...points.map(x=>x.value)),span=max-min||1;
 const first=Date.parse(points[0].day),last=Date.parse(points.at(-1)!.day),range=last-first||1;
 const x=(i:number)=>16+(Date.parse(points[i].day)-first)/range*328,y=(value:number)=>120-(value-min)/span*95;
 const i=Math.min(selected??points.length-1,points.length-1);
 const ticks=[...new Set([0,Math.round((points.length-1)/3),Math.round((points.length-1)*2/3),points.length-1])];
 return <div className="mobile-chart" data-no-swipe><div className="chart-caption"><span>{formatValue(min)}</span><span>{formatValue(max)}</span></div><svg viewBox="0 0 360 154" role="img" aria-label="График по датам" onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect(),position=(e.clientX-r.left)/r.width*360;setSelected(points.reduce((best,_,j)=>Math.abs(x(j)-position)<Math.abs(x(best)-position)?j:best,0));}}><line x1="16" x2="344" y1="120" y2="120"/><line x1="16" x2="344" y1="25" y2="25"/>{kind==='bar'?points.map((p,j)=><rect key={p.day} x={x(j)-Math.min(12,250/points.length)/2} y={y(p.value)} width={Math.min(12,250/points.length)} height={Math.max(1,120-y(p.value))}/>):<polyline points={points.map((p,j)=>`${x(j)},${y(p.value)}`).join(' ')}/>}<circle cx={x(i)} cy={y(points[i].value)} r="4"/>{ticks.map(j=><text key={j} x={x(j)} y="144" textAnchor={j===0?'start':j===points.length-1?'end':'middle'}>{points[j].day.slice(8,10)}.{points[j].day.slice(5,7)}</text>)}</svg><div className="chart-caption"><span>{displayDay(points[i].day)}</span><strong>{formatValue(points[i].value)}</strong></div><input type="range" min="0" max={points.length-1} value={i} aria-label="Выбрать дату на графике" onChange={e=>setSelected(Number(e.target.value))}/></div>;
}
