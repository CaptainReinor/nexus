import {useRef,useState} from 'react';
import {makeFocusResetRequest,type FocusResetRequest} from '../../shared/focus-reset';
import type {FocusAPI} from '../../shared/focus-mode';
import {Modal,errorText} from '../ui';
import {flushPendingEdits} from '../autosave';

export function DiaryReset({api,disabled,onBusy,onReset}:{api:FocusAPI;disabled:boolean;onBusy:(busy:boolean)=>void;onReset:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),request=useRef<FocusResetRequest|null>(null);
 async function reset(){
  if(busy)return;
  if(!await flushPendingEdits()){setError('Дождись сохранения текущей записи.');return;}
  setBusy(true);onBusy(true);setError('');
  try{await api.resetRecords(request.current!);await onReset();request.current=null;setOpen(false);}catch(error){setError(errorText(error));}finally{setBusy(false);onBusy(false);}
 }
 return <><button className="return-link return-danger" disabled={disabled} onClick={()=>{request.current=makeFocusResetRequest();setError('');setOpen(true);}}>Сбросить записи</button>{open&&<Modal title="Начать дневник заново?" onClose={()=>{if(!busy)setOpen(false);}}><div className="return-form"><p>Будут удалены записи текущего дневника, вес, сон, питание, операции, накопления и активности на твоих устройствах.</p><p>Цели, настройки, код доступа и прежняя история сохранятся.</p>{error&&<p className="return-error" role="alert">{error}</p>}<div className="return-actions"><button className="return-button quiet" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="return-button return-danger-button" disabled={busy} onClick={()=>void reset()}>{busy?'Сбрасываю…':'Удалить записи'}</button></div></div></Modal>}</>;
}
