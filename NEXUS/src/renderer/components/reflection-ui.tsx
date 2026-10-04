import {useSystemCopy} from '../appearance';
import {useState} from 'react';
import {localDay} from '../../shared/domain';
import {useDaily,useDailyAction,DailyError} from './daily-context';
export function ReflectionPanel(){
  const copy=useSystemCopy("reflection-ui");
const {data}=useDaily(),day=localDay(),saved=data.answers.find(a=>a.day===day),[editing,setEditing]=useState(false);return <section className="daily-panel reflection-panel"><header className="daily-heading"><h2>{copy("Вопрос вечера")}</h2>{saved&&!editing&&<button className="daily-button subtle" onClick={()=>setEditing(true)}>Изменить</button>}</header>{saved&&!editing?<><p className="reflection-question">{saved.question}</p><p className="reflection-answer">{saved.skipped?'Сегодня без ответа.':saved.answer||'Ответ пока пустой.'}</p></>:<ReflectionForm key={day} onSaved={()=>setEditing(false)}/>}</section>;}
export function ReflectionForm({onSaved}:{onSaved?:()=>void}){
  const copy=useSystemCopy("reflection-ui");
const {data}=useDaily(),{run,error,busy}=useDailyAction(),day=localDay(),saved=data.answers.find(a=>a.day===day),[answer,setAnswer]=useState(saved?.answer??'');const question=saved?.question??data.question;return <form className="daily-form" onSubmit={e=>{e.preventDefault();void run(api=>api.reflection({day,question,answer,skipped:false})).then(ok=>{if(ok)onSaved?.();});}}><p className="reflection-question">{question}</p><textarea aria-label={copy("Ответ на вопрос вечера")} value={answer} onChange={e=>setAnswer(e.target.value)} rows={3} maxLength={2000} placeholder={copy("Пара предложений…")}/><DailyError message={error}/><div className="daily-actions"><button className="daily-button primary" disabled={busy||!answer.trim()}>Сохранить</button><button className="daily-button subtle" type="button" disabled={busy} onClick={()=>void run(api=>api.reflection({day,question,answer:'',skipped:true})).then(ok=>{if(ok)onSaved?.();})}>Пропустить</button></div></form>;}
