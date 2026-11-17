import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {FocusTurnInput} from '../../shared/focus-mode';
import type {Snapshot} from '../../shared/snapshot-sync';
import type {HomePreferences} from '../../shared/home';
import {receiptTitle,weekTrail} from './progress';
import {acceptedFeedback} from '../feedback';

let lastSound=0;
function sound(){
 if(Date.now()-lastSound<700)return;lastSound=Date.now();
 try{const context=new AudioContext(),gain=context.createGain();gain.connect(context.destination);gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.045,context.currentTime+.015);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.24);
 for(const [frequency,delay] of [[660,0],[990,.065]]){const oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(gain);oscillator.start(context.currentTime+delay);oscillator.stop(context.currentTime+delay+.18);}
 void context.resume().catch(()=>{});setTimeout(()=>void context.close().catch(()=>{}),400);
 }catch{/* Sound is optional and never delays saving. */}
}
function markOnce(snapshot:Snapshot,key:string):boolean{
 try{const boundary=String(snapshot.tables.settings?.find(r=>r.key==='focusBoundary')?.value??'current'),storageKey='nexus.return.celebrations.'+boundary;const seen=JSON.parse(localStorage.getItem(storageKey)??'[]') as string[];if(seen.includes(key))return false;localStorage.setItem(storageKey,JSON.stringify([...seen.slice(-59),key]));return true;}catch{return false;}
}
export function SaveFeedback({input,snapshot,preferences,onEdit}:{input:FocusTurnInput;snapshot:Snapshot;preferences:HomePreferences;onEdit:()=>void}){
 const [celebration,setCelebration]=useState(''),played=useRef(''),summary=receiptTitle(input),trail=weekTrail(snapshot,input.day),today=trail.find(r=>r.today),days=trail.filter(r=>r.recorded).length;
 useEffect(()=>{if(played.current===input.id)return;played.current=input.id;if(preferences.haptics)acceptedFeedback('check');if(preferences.sound)sound();},[input.id,preferences.haptics,preferences.sound]);
 useEffect(()=>{if(today?.complete&&markOnce(snapshot,'complete:'+input.day))setCelebration('Всё за сегодня записано');else if([3,5,7].includes(days)&&today?.recorded&&markOnce(snapshot,'week:'+trail[0].day+':'+days))setCelebration(`${days} дней на этой неделе. Уже привычное дело.`);},[input.id,input.day,today?.complete,today?.recorded,days,snapshot,trail]);
 return <div className={`return-receipt ${celebration?'celebration':''}`} role="status" aria-live="polite" key={input.id}>
  <div className="return-receipt-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><circle className="return-receipt-ring" cx="24" cy="24" r="21"/><path className="return-receipt-tick" d="m14 24 7 7 14-15"/></svg>{Array.from({length:12},(_,i)=><i key={i} style={{'--angle':`${i*30}deg`,'--distance':`${35+i%3*9}px`,'--delay':`${i%3*25}ms`} as CSSProperties}/>)}</div>
  <div className="return-receipt-text"><strong>{celebration||summary.title}</strong>{summary.value&&<span>{summary.value}</span>}</div><button className="return-link" type="button" onClick={onEdit}>Исправить</button>
 </div>;
}
export function WeekTrail({snapshot,day}:{snapshot:Snapshot;day:string}){
 const trail=weekTrail(snapshot,day),count=trail.filter(r=>r.recorded).length;
 return <div className="return-week"><div className="return-week-days" aria-label={`${count} дней с записями на этой неделе`}>{trail.map((item,i)=><div key={item.day} className={`${item.recorded?'recorded':''} ${item.complete?'complete':''} ${item.today?'today':''}`} title={`${item.day.split('-').reverse().join('.')}: ${item.recorded?'есть записи':'нет записей'}`}><span className="return-week-dot">{item.complete?<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>:null}</span><small>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</small></div>)}</div>{count>0&&<p>{count} из 7 дней с записями</p>}</div>;
}
