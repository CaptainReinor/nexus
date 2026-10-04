import {useEffect,useRef,useState} from 'react';
import {displayDay} from '../shared/domain';
import {chartGeometry,type ChartKind,type ChartPoint} from '../shared/chart-geometry';
import {useTheme} from './appearance';
export type SeriesRole='neutral'|'income'|'expense';
export function DateChart({points,formatValue=String,kind='line',role='neutral',label='Показатель',mobile=false,selectionIndex,onSelect}:{points:ChartPoint[];formatValue?:(value:number)=>string;kind?:ChartKind;role?:SeriesRole;label?:string;mobile?:boolean;selectionIndex?:number|null;onSelect?:(index:number|null)=>void}){
  const theme=useTheme(),ref=useRef<SVGSVGElement>(null),[width,setWidth]=useState(mobile?320:600),[selection,setSelection]=useState<{day:string;pinned:boolean}|null>(()=>selectionIndex!=null&&points[selectionIndex]?{day:points[selectionIndex].day,pinned:true}:null),[announcement,setAnnouncement]=useState('');
  const actual=points.map((point,index)=>({point,index})).filter(({point})=>point.value!==null&&Number.isFinite(point.value));
  useEffect(()=>{const svg=ref.current;if(!svg||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.width;if(next>0)setWidth(Math.max(180,next));});observer.observe(svg);return()=>observer.disconnect();},[actual.length>0]);
  const height=(mobile?192:224)+50,geometry=chartGeometry(points,width,height,kind,formatValue===String?undefined:formatValue);
  if(!geometry)return <div className="chart-empty">Нет данных</div>;
  const {positions,left,right,top,plotHeight,ticks,baseline,barWidth,y,formatTick}=geometry;
  const selected=actual.find(item=>item.point.day===selection?.day),chosen=selected??actual.at(-1)!,selectedIndex=actual.indexOf(chosen),pinned=!!selected&&selection?.pinned;
  const pointPosition=positions[chosen.index];
  const nearest=(event:{clientX:number;currentTarget:SVGSVGElement})=>{const bounds=event.currentTarget.getBoundingClientRect(),position=(event.clientX-bounds.left)/bounds.width*width;return actual.reduce((best,item)=>Math.abs(positions[item.index].x-position)<Math.abs(positions[best.index].x-position)?item:best,actual[0]);};
  const select=(item:typeof chosen,pinned:boolean)=>{setSelection({day:item.point.day,pinned});onSelect?.(item.index);};
  const clear=()=>{setSelection(null);onSelect?.(null);};
  const announce=(item:typeof chosen)=>setAnnouncement(`${label}, ${displayDay(item.point.day)}, ${formatValue(item.point.value!)}`);
  const dateLabel=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)?`${day.slice(8)}.${day.slice(5,7)}`:day;
  const count=mobile||width<400?3:5,xTicks=[...new Set(Array.from({length:Math.min(count,actual.length)},(_,i)=>Math.round(i*(actual.length-1)/Math.max(1,Math.min(count,actual.length)-1))))];
  const segments:{x:number;y:number}[][]=[];
  points.forEach((point,index)=>{const position=positions[index];if(position.y===null)return;const prior=points[index-1],gap=index===0||positions[index-1].y===null||(/^\d{4}-\d{2}-\d{2}$/.test(point.day)&&Date.parse(point.day)-Date.parse(prior.day)>86400000);if(gap)segments.push([]);segments.at(-1)!.push({x:position.x,y:position.y});});
  return <div className={`chart date-chart series-${role} ${theme==='dominion'?'dominion-chart':''}`} data-no-swipe>
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} style={{height}} role="img" aria-label={`${label}, график по датам`} onPointerMove={event=>{if(event.pointerType!=='touch'&&!pinned){const item=nearest(event);if(item.point.day!==selection?.day)select(item,false);}}} onClick={event=>{const item=nearest(event);select(item,!(pinned&&selection?.day===item.point.day));announce(item);}} onKeyDown={event=>{if(event.key==='Escape')clear();}}>
      {ticks.map(value=><g key={value}><line className={value===0?'chart-zero':'chart-grid'} x1={left} x2={width-right} y1={y(value)} y2={y(value)}/><text className="chart-axis" x={left-10} y={y(value)+4} textAnchor="end">{formatTick(value)}</text></g>)}
      {kind==='bar'?actual.map(({point,index})=><rect key={`${point.day}:${index}`} className="chart-bar" data-value={point.value} x={positions[index].x-barWidth/2} y={Math.min(positions[index].y!,baseline)} width={barWidth} height={Math.abs(positions[index].y!-baseline)} rx="2"><title>{displayDay(point.day)}: {formatValue(point.value!)}</title></rect>):segments.map((segment,index)=>segment.length>1?<polyline key={index} points={segment.map(p=>`${p.x},${p.y}`).join(' ')}/>:<circle key={index} cx={segment[0].x} cy={segment[0].y} r="3"/>)}
      {kind==='line'&&actual.length<=12&&actual.map(({index,point})=><circle key={`${point.day}:${index}`} cx={positions[index].x} cy={positions[index].y!} r="3"/>)}
      <line className="chart-cursor" x1={pointPosition.x} x2={pointPosition.x} y1={top} y2={top+plotHeight}/><circle className="chart-selected" cx={pointPosition.x} cy={pointPosition.y!} r="4.5"/>
      {xTicks.map(i=>{const {point,index}=actual[i];return <text key={i} className="chart-date" x={positions[index].x} y={height-12} textAnchor={i===0?'start':i===actual.length-1?'end':'middle'}>{dateLabel(point.day)}</text>;})}
    </svg>
    <div className="chart-inspection" aria-live="off"><span>{displayDay(chosen.point.day)}</span><strong>{formatValue(chosen.point.value!)}</strong></div>
    {actual.length>1&&<input className="chart-slider" type="range" aria-label={`${label}: выбрать дату`} aria-valuetext={`${displayDay(chosen.point.day)}: ${formatValue(chosen.point.value!)}`} min="0" max={actual.length-1} value={selectedIndex} onChange={event=>{const item=actual[Number(event.target.value)];select(item,true);announce(item);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();clear();}}}/>}
    <span className="chart-announcement" role="status" aria-live="polite">{announcement}</span>
  </div>;
}
