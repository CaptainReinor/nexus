import {useSystemCopy} from '../../NEXUS/src/renderer/appearance';
import { useState } from 'react';
import { nextId, rows, type Row, type Snapshot } from './sync';
import { useAutoSave, useAutosavedEditor } from '../../NEXUS/src/renderer/autosave';
import { SaveIndicator } from '../../NEXUS/src/renderer/ui';
type Props={snapshot:Snapshot;commitLatest:(change:(snapshot:Snapshot)=>void)=>Promise<boolean>};
type Draft={id?:number;entry_id:number|null;title:string;situation:string;task:string;actions:string;result:string;skills:string;tools:string;tags:string};
const empty:Draft={entry_id:null,title:'',situation:'',task:'',actions:'',result:'',skills:'',tools:'',tags:''};
const text=(value:unknown)=>value==null?'':String(value);

export function MobileExperience({snapshot,commitLatest}:Props){
  const copy=useSystemCopy("work");

  const entries=rows(snapshot,'experience_entries'),cases=rows(snapshot,'experience_cases');
  const [draft,setDraft]=useState<Draft|null>(null),[organization,setOrganization]=useState(''),[position,setPosition]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const {queue,status}=useAutoSave();
  useAutosavedEditor(draft,queue,'case',async value=>{if(!value.title.trim())throw new Error('Введите название.');if(!await commitLatest(s=>{const row=rows(s,'experience_cases').find(item=>item.id===value.id);if(!row)throw new Error('Кейс не найден.');Object.assign(row,value);})){throw new Error('Не удалось сохранить.');}});
  function edit(row:Row){setDraft({id:Number(row.id),entry_id:row.entry_id==null?null:Number(row.entry_id),title:text(row.title),situation:text(row.situation),task:text(row.task),actions:text(row.actions),result:text(row.result),skills:text(row.skills),tools:text(row.tools),tags:text(row.tags)});}
  async function save(){if(!draft||!draft.title.trim()||busy)return;setBusy(true);setError('');try{const value={...draft,title:draft.title.trim()};if(await commitLatest(s=>{const list=rows(s,'experience_cases'),existing=list.find(row=>row.id===value.id);if(existing)Object.assign(existing,value);else list.push({...value,id:nextId(list)});}))setDraft(null);else setError('Не удалось сохранить.');}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить.');}finally{setBusy(false);}}
  return <>
    <section className="card"><div className="section-title-row"><h2>{copy("Кейсы")}</h2><button onClick={()=>setDraft({...empty})}>{copy("+ Кейс")}</button></div>
      {cases.length?cases.map(row=><article className="listrow column" key={text(row.id)}><div><strong>{text(row.title)}</strong><small>{text(entries.find(entry=>entry.id===row.entry_id)?.organization)||'Без привязки'}</small></div>{Boolean(row.result)&&<p>{text(row.result)}</p>}<button className="ghost" onClick={()=>edit(row)}>Изменить</button></article>):<p className="empty">Кейсов пока нет.</p>}
    </section>
    {draft&&<section className="card"><h2>{draft.id?copy("Изменить кейс"):copy("Новый кейс")}</h2><form onSubmit={event=>{event.preventDefault();void save();}}>
      <label>Название<input required value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
      <label>Место работы<select value={draft.entry_id??''} onChange={event=>setDraft({...draft,entry_id:event.target.value?Number(event.target.value):null})}><option value="">Без привязки</option>{entries.map(entry=><option key={text(entry.id)} value={Number(entry.id)}>{text(entry.organization)}</option>)}</select></label>
      {([['situation','Ситуация'],['task','Задача'],['actions','Действия'],['result','Результат'],['skills','Навыки'],['tools','Инструменты'],['tags','Теги']] as const).map(([key,label])=><label key={key}>{label}<textarea rows={key==='actions'||key==='result'?3:2} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></label>)}
      {error&&<p className="error" role="alert">{error}</p>}<div className="row">{draft.id?<SaveIndicator status={status} onRetry={()=>queue.retry()}/>:<button disabled={busy||!draft.title.trim()}>{busy?'Сохранение…':copy("Создать кейс")}</button>}<button type="button" className="ghost" disabled={busy} onClick={()=>{void queue.flushAll().then(saved=>{if(saved)setDraft(null);});}}>Закрыть</button></div>
    </form></section>}
    <details className="mobile-fold"><summary>Места работы · {entries.length}</summary><section className="card">{entries.map(entry=><div className="listrow" key={text(entry.id)}><div><strong>{text(entry.position)}</strong><small>{text(entry.organization)}</small></div></div>)}
      <label>Организация<input value={organization} onChange={event=>setOrganization(event.target.value)}/></label><label>Должность<input value={position} onChange={event=>setPosition(event.target.value)}/></label>
      <button disabled={!organization.trim()||!position.trim()} onClick={()=>void commitLatest(s=>{const list=rows(s,'experience_entries');list.push({id:nextId(list),organization:organization.trim(),position:position.trim(),start_date:'',end_date:'',description:'',skills:'',tools:''});}).then(saved=>{if(saved){setOrganization('');setPosition('');}})}>Добавить место работы</button>
    </section></details>
  </>;
}
