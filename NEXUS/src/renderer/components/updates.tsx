import { createContext,useCallback,useContext,useEffect,useState,type ReactNode } from 'react';
import type { UpdateAPI,UpdateState } from '../../shared/updates';
import { flushPendingEdits } from '../autosave';
import './updates.css';

type Updates={state:UpdateState;busy:boolean;check:()=>Promise<void>;update:()=>Promise<void>};
const Context=createContext<Updates|null>(null);
export function UpdatesProvider({api,children}:{api:UpdateAPI;children:ReactNode}){
  const [state,setState]=useState<UpdateState>({phase:'idle',currentVersion:''}),[busy,setBusy]=useState(false),[dismissed,setDismissed]=useState('');
  const check=useCallback(async()=>{setState(previous=>({...previous,phase:previous.phase==='ready'||previous.phase==='downloading'?previous.phase:'checking'}));try{setState(await api.check());}catch{setState(previous=>({...previous,phase:'error',message:'Не удалось проверить обновления.'}));}},[api]);
  useEffect(()=>{let active=true;const read=()=>void api.status().then(value=>{if(active)setState(value);}).catch(()=>{});read();const initial=setTimeout(()=>void check(),10_000),timer=setInterval(()=>void check(),6*60*60*1000);return()=>{active=false;clearTimeout(initial);clearInterval(timer);};},[api,check]);
  useEffect(()=>{if(state.phase!=='checking'&&state.phase!=='downloading')return;const timer=setInterval(()=>void api.status().then(setState).catch(()=>{}),750);return()=>clearInterval(timer);},[api,state.phase]);
  async function update(){
    if(busy)return;setBusy(true);
    try{
      if(state.phase==='ready'){
        if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        if(!await flushPendingEdits())throw new Error('Сначала сохраните изменения.');
        await api.install();
      }else{setState({...state,phase:'downloading',percent:0});setState(await api.download());}
    }catch(error){const actual=await api.status().catch(()=>null);setState(previous=>({...actual??previous,message:error instanceof Error?error.message:'Не удалось установить обновление.'}));}
    finally{setBusy(false);}
  }
  const visible=['available','downloading','ready'].includes(state.phase)&&dismissed!==state.version;
  return <Context.Provider value={{state,busy,check,update}}>{children}{visible&&<aside className="update-toast" aria-label="Обновление NEXUS"><div><strong>{state.phase==='downloading'?`Скачивание · ${state.percent??0}%`:`NEXUS ${state.version}`}</strong><small>{state.message??(state.phase==='ready'?'Готово к установке':'Доступно обновление')}</small></div><button className="update-action" disabled={busy||state.phase==='downloading'} onClick={()=>void update()}>{state.phase==='ready'?'Установить':'Скачать'}</button><button className="update-close" aria-label="Отложить обновление" onClick={()=>setDismissed(state.version??'')}>×</button></aside>}</Context.Provider>;
}
export function UpdatePanel(){
  const value=useContext(Context);if(!value)return null;
  const {state,busy,check,update}=value;
  const available=['available','ready'].includes(state.phase);
  const label=state.phase==='current'?'Установлена последняя версия':state.phase==='checking'?'Проверяем…':state.phase==='downloading'?`Скачивание · ${state.percent??0}%`:state.message??(available?`Доступна версия ${state.version}`:'');
  return <section className="update-panel"><div><h2>Обновления</h2><span>NEXUS {state.currentVersion}</span>{label&&<p role="status">{label}</p>}</div><button type="button" className="update-action" disabled={busy||state.phase==='checking'||state.phase==='downloading'} onClick={()=>void(available?update():check())}>{state.phase==='ready'?'Установить':state.phase==='available'?'Скачать':'Проверить'}</button></section>;
}
