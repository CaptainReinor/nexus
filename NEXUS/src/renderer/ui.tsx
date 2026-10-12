import {carryChartValues} from '../shared/chart-series';
import {localDay} from '../shared/domain';
import {DateChart,type SeriesRole} from './date-chart';
import {useSystemCopy} from './appearance';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AutoSaveStatus } from './autosave';

export function errorText(error: unknown): string {
  const message=error instanceof Error?error.message:String(error);
  const clean=message.replace(/^Error invoking remote method '[^']+': Error: /,'').replace(/^Error: /,'');
  if (/SQLITE_|undefined|Unhandled|at .*\(/.test(clean)) return 'Не удалось выполнить действие. Проверьте данные и попробуйте ещё раз.';
  return clean;
}
export function useData<T>(loader:()=>Promise<T>): {data:T|null;loading:boolean;error:string;reload:()=>Promise<void>} {
  const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const reload=useCallback(async()=>{setLoading(true);setError('');try{setData(await loader());}catch(e){setError(errorText(e));}finally{setLoading(false);}},[loader]);
  useEffect(()=>{void reload();const refresh=()=>void reload();window.addEventListener('nexus:daily-change',refresh);return()=>window.removeEventListener('nexus:daily-change',refresh);},[reload]);
  return {data,loading,error,reload};
}
export function Panel({title,eyebrow,action,children,className=''}:{title?:string;eyebrow?:string;action?:ReactNode;children:ReactNode;className?:string}) { return <section className={`panel dominion-frame ${className}`}>{(title||eyebrow||action)&&<div className="panel-head"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}{title&&<h2>{title}</h2>}</div>{action}</div>}{children}</section>; }
export function Stat({label,value,sub,tone=''}:{label:string;value:ReactNode;sub?:ReactNode;tone?:string}) {return <div className={`stat ${tone}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub&&<div className="stat-sub">{sub}</div>}</div>}
export function Empty({title,description,action}:{title:string;description?:string;action?:ReactNode}) {return <div className="empty"><div className="empty-mark">◇</div><strong>{title}</strong>{description&&<p>{description}</p>}{action}</div>}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const element=useRef<HTMLDivElement>(null),origin=useRef(document.activeElement),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const box=element.current;if(!box)return;const selector='input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href]';
    (box.querySelector<HTMLElement>('[autofocus]')??box.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled])')??box.querySelector<HTMLElement>(selector)??box).focus({preventScroll:true});
    const keyboard=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close.current();}if(event.key!=='Tab')return;const items=[...box.querySelectorAll<HTMLElement>(selector)].filter(item=>!item.closest('[hidden]')&&item.getClientRects().length>0),first=items[0],last=items.at(-1);if(!first){event.preventDefault();box.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===box)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
    box.addEventListener('keydown',keyboard);const previous=origin.current;return()=>{box.removeEventListener('keydown',keyboard);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={element} tabIndex={-1} className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>{children}</div></div>;
}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Notice({message,onClose}:{message:string;onClose:()=>void}) {return <div className="notice" role="status"><span>{message}</span><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>}
export function SaveIndicator({status,onRetry}:{status:AutoSaveStatus;onRetry:()=>void}) {
  const copy=useSystemCopy("ui");
return <div className={`autosave-status ${status.state}`} role="status" aria-live="polite">{status.state==='saving'?copy("Сохраняется…"):status.state==='saved'?copy("Сохранено автоматически"):<>Не удалось сохранить: {errorText(status.error)} <button type="button" onClick={onRetry}>Повторить</button></>}</div>}
export function Progress({value,max}:{value:number;max:number}) {return <div className="progress"><span style={{width:`${max>0?Math.min(100,Math.max(0,value/max*100)):0}%`}}/></div>}
export function LineChart({values:sourceValues,labels:sourceLabels,carryForward=false,formatValue=(value)=>String(value),kind='line',role='neutral',label='Показатель'}:{values:number[];labels?:string[];carryForward?:boolean;formatValue?:(value:number)=>string;kind?:'line'|'bar';role?:SeriesRole;label?:string}) {
  const points=carryForward&&sourceLabels?carryChartValues(sourceValues.map((value,i)=>({day:sourceLabels[i],value})),localDay()):sourceValues.map((value,i)=>({day:sourceLabels?.[i]??String(i+1),value}));
  return <DateChart points={points} formatValue={formatValue} kind={kind} role={role} label={label}/>;
}
