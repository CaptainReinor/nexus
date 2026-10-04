import {useEffect,useId,useRef,useState} from 'react';
import {useTheme} from './appearance';
import {metricDelta,type MetricGoal,type MetricKind,type MetricObservation} from '../shared/metric-delta';
export function MetricDelta({kind,current,previous,goal}:{kind:MetricKind;current?:MetricObservation;previous?:MetricObservation;goal?:MetricGoal}){
  const theme=useTheme(),[open,setOpen]=useState(false),id=useId();
  const change=metricDelta(kind,current?.value??null,previous?.value??null,goal);
  const element=useRef<HTMLSpanElement>(null),prior=useRef('');
  const identity=`${theme}:${current?.day}:${current?.value}:${previous?.day}:${previous?.value}:${change?.text}:${change?.assessment}`;
  useEffect(()=>{const changed=prior.current&&prior.current!==identity;prior.current=identity;if(!changed||theme!=='dominion'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const animation=element.current?.animate?.([{opacity:.6},{opacity:1}],{duration:220,easing:'ease-out'});return()=>animation?.cancel();},[identity,theme]);
  if(theme!=='dominion'||!change||!previous)return null;
  const date=new Date(`${previous.day}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),label=kind==='weight'?'Вес':'Сон';
  const direction={up:'Рост',down:'Снижение',flat:'Без изменения'}[change.direction];
  const assessment={favorable:'Благоприятное изменение',unfavorable:'Неблагоприятное изменение',neutral:'Нейтральное изменение',unknown:'Оценка неизвестна'}[change.assessment];
  return <span ref={element} className={`metric-delta ${change.assessment}`} tabIndex={0} aria-label={`${label}: ${current?.value} ${kind==='weight'?'кг':'мин'}, ${direction}, изменение ${change.text}, ${assessment}, к ${date}`} aria-describedby={open?id:undefined} title={`К ${date}`} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(value=>!value);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);}if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();setOpen(value=>!value);}}}><span>{change.text}</span>{open&&<span className="metric-comparison-date" id={id} role="tooltip">К {date}</span>}</span>;
}
