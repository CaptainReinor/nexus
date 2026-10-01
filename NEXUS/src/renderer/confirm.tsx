import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './confirm.css';

type Request={message:string;resolve:(answer:boolean)=>void;origin:HTMLElement|null};
const pending:Request[]=[];
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());

// An HTML dialog stays inside Chromium and does not interrupt the native keyboard focus.
export function askConfirm(message:string):Promise<boolean>{
  return new Promise(resolve=>{pending.push({message,resolve,origin:document.activeElement instanceof HTMLElement?document.activeElement:null});emit();});
}

export function ConfirmHost(){
  const [request,setRequest]=useState<Request|null>(pending[0]??null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const update=()=>setRequest(pending[0]??null);listeners.add(update);update();return()=>{listeners.delete(update);};},[]);
  useEffect(()=>{const element=dialog.current;if(!request||!element)return;element.showModal();return()=>{element.close();};},[request]);
  function finish(answer:boolean){if(!request||pending[0]!==request)return;pending.shift();dialog.current?.close();if(request.origin?.isConnected)request.origin.focus({preventScroll:true});request.resolve(answer);emit();}
  return request?createPortal(<dialog ref={dialog} className="nexus-confirm" aria-labelledby="confirm-title" aria-describedby="confirm-message" onCancel={event=>{event.preventDefault();finish(false);}}><h2 id="confirm-title">Подтверждение</h2><p id="confirm-message">{request.message}</p><div className="nexus-confirm-actions"><button autoFocus type="button" onClick={()=>finish(false)}>Отмена</button><button type="button" className="confirm-accept" onClick={()=>finish(true)}>Продолжить</button></div></dialog>,document.body):null;
}
