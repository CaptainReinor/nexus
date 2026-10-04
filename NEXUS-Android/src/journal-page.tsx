import {useNavigationCopy} from '../../NEXUS/src/renderer/appearance';
import {useSystemCopy} from '../../NEXUS/src/renderer/appearance';
import { hasIncompleteSelectedFinance } from '../../NEXUS/src/shared/journal-schema';
import { journalTimestamp } from '../../NEXUS/src/shared/life';
import { JournalReview } from '../../NEXUS/src/renderer/components/journal-review';
import '../../NEXUS/src/renderer/components/life.css';
import { useState, type ChangeEvent } from 'react';
import { aiEnabled, analyzeDay, needsBudgetConfirmation, recordUsage, transcribeAudio, type JournalAnalysis } from './ai';
import { applyJournalSuggestions } from './journal-domain';
import { nextId, rows, today, type Snapshot } from './sync';

type Props={snapshot:Snapshot;commit:(change:(snapshot:Snapshot)=>void)=>Promise<void>;commitLatest:(change:(snapshot:Snapshot)=>void)=>Promise<boolean>};
const text=(value:unknown)=>value==null?'':String(value);
const audioFormats=['webm','wav','mp3','m4a','ogg','aac','flac'] as const;
type AudioFormat=typeof audioFormats[number];

export function JournalPage({snapshot,commit,commitLatest}:Props){
 const navCopy=useNavigationCopy();
  const copy=useSystemCopy("journal");

  const [draft,setDraft]=useState(''),[day,setDay]=useState(today()),[analysis,setAnalysis]=useState<{entryId:number;value:JournalAnalysis}|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const entries=[...rows(snapshot,'daily_journals')].sort((a,b)=>text(b.created_at).localeCompare(text(a.created_at))||Number(b.id)-Number(a.id));
  const entry=entries.find(x=>x.id===analysis?.entryId);
  let applied=new Set<string>();
  try{applied=new Set(JSON.parse(text(entry?.applied_json??'[]')) as string[]);}catch{ /* older malformed entry stays read-only */ }
  const canAI=aiEnabled(snapshot);
  function budgetAllowed():boolean{
    if(!canAI){setMessage('Включите AI в настройках NEXUS на компьютере.');return false;}
    return !needsBudgetConfirmation(snapshot)||confirm('Лимит расходов на AI достигнут или стоимость прошлых запросов неизвестна. Продолжить?');
  }
  async function analyze(){
    if(!draft.trim()||!budgetAllowed())return;
    setBusy('analyze');setMessage('');
    try{
      const result=await analyzeDay(snapshot,draft.trim(),day);let id=0;
      const saved=await commitLatest(s=>{const journals=rows(s,'daily_journals');id=nextId(journals);journals.push({id,day,raw_text:draft.trim(),source:'text',analysis_json:JSON.stringify(result.analysis),applied_json:'[]',created_at:journalTimestamp(s)});recordUsage(s,result.reply,'journal-analysis',result.model);});
      if(saved){setAnalysis({entryId:id,value:result.analysis});setSelected(new Set());setMessage('Разбор готов. Выберите, что сохранить в разделы.');}
    }catch(error){setMessage(error instanceof Error?error.message:'Не удалось разобрать день.');}
    finally{setBusy('');}
  }
  async function transcribe(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!budgetAllowed())return;
    const extension=file.name.split('.').at(-1)?.toLowerCase();
    if(!audioFormats.includes(extension as AudioFormat)||file.size>18_000_000){setMessage('Выберите запись MP3, M4A, WAV, OGG, AAC, FLAC или WEBM до 18 МБ.');return;}
    setBusy('transcribe');setMessage('');
    try{
      const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');reader.onerror=()=>reject(new Error('Не удалось прочитать запись.'));reader.readAsDataURL(file);});
      const result=await transcribeAudio(snapshot,base64,extension as AudioFormat);
      const saved=await commitLatest(s=>recordUsage(s,result.reply,'journal-transcription',result.model));
      if(saved){setDraft(current=>current.trim()?`${current.trim()}\n\n${result.text}`:result.text);setAnalysis(null);setMessage('Речь распознана. Проверьте текст перед разбором.');}
    }catch(error){setMessage(error instanceof Error?error.message:'Не удалось распознать запись.');}
    finally{setBusy('');}
  }
  async function saveDraft(){
    if(!draft.trim())return;
    await commit(s=>{const journals=rows(s,'daily_journals');journals.push({id:nextId(journals),day,raw_text:draft.trim(),source:'text',analysis_json:null,applied_json:'[]',created_at:journalTimestamp(s)});});
    setDraft('');setAnalysis(null);setSelected(new Set());
  }
  async function apply(){
    if(!analysis||!selected.size)return;
    setBusy('apply');setMessage('');
    try{
      const saved=await commitLatest(s=>applyJournalSuggestions(s,analysis.entryId,analysis.value,[...selected]));
      if(saved){setSelected(new Set());setMessage('Выбранные данные сохранены.');}
    }catch(error){setMessage(error instanceof Error?error.message:'Не удалось сохранить предложения.');}
    finally{setBusy('');}
  }
  function loadEntry(id:number){
    const item=entries.find(x=>x.id===id);if(!item)return;
    setDraft(text(item.raw_text));setDay(text(item.day));setSelected(new Set());setMessage('');
    try{setAnalysis(item.analysis_json?{entryId:id,value:JSON.parse(text(item.analysis_json)) as JournalAnalysis}:null);}
    catch{setAnalysis(null);setMessage('Сохранённый разбор повреждён.');}
  }
  function editReview(value:JournalAnalysis){if(!analysis)return;const id=analysis.entryId;setAnalysis({entryId:id,value});void commit(s=>{const current=rows(s,'daily_journals').find(x=>x.id===id);if(current)current.analysis_json=JSON.stringify(value);});}
  return <>
    <div className="heading"><small>05 / ДНЕВНИК</small><h1>{navCopy('journal','Дневник',true)}</h1>{copy("Расскажите о дне. AI предложит изменения, а вы выберете нужные.")&&<p>{copy("Расскажите о дне. AI предложит изменения, а вы выберете нужные.")}</p>}</div>
    <section className="card dominion-frame"><h2>Запись дня</h2>
      <label>Дата<input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
      <label>Что произошло<textarea rows={7} value={draft} onChange={e=>{setDraft(e.target.value);setAnalysis(null);}} placeholder="Встал в 8 утра. Потратил 5000 рублей на еду…"/></label>
      <div className="actions journal-actions"><button disabled={!draft.trim()||!!busy} onClick={()=>void analyze()}>{busy==='analyze'?'Разбираю…':copy("Разобрать с AI")}</button><button className="ghost" disabled={!draft.trim()||!!busy} onClick={()=>void saveDraft()}>Сохранить текст</button></div>
      <label className="audio-file">Начитать или загрузить запись<input type="file" accept="audio/*,.webm,.wav,.mp3,.m4a,.ogg,.aac,.flac" onChange={e=>void transcribe(e)} disabled={!!busy}/></label>
      {busy==='transcribe'&&<p className="muted">Распознаю речь…</p>}{message&&<p className="muted" role="status">{message}</p>}
    </section>
    {analysis&&<section className="card dominion-frame"><h2>Предложения AI</h2><p>{analysis.value.summary}</p>{analysis.value.uncertain.length>0&&<div className="notice"><span>Нужно уточнить: {analysis.value.uncertain.join('; ')}</span></div>}
      <JournalReview analysis={analysis.value} accounts={rows(snapshot,'finance_accounts').filter(x=>x.active===1).map(x=>({id:Number(x.id),name:String(x.name)}))} categories={rows(snapshot,'finance_categories').filter(x=>x.active===1).map(x=>({id:Number(x.id),name:String(x.name),kind:String(x.kind)}))} habits={rows(snapshot,'habits').map(x=>({id:Number(x.id),name:String(x.name),kind:String(x.kind)}))} jobs={rows(snapshot,'jobs').map(x=>({id:Number(x.id),title:String(x.title)}))} selected={selected} applied={applied} onSelect={(key,checked)=>setSelected(previous=>{const next=new Set(previous);if(checked)next.add(key);else next.delete(key);return next;})} onChange={editReview} busy={!!busy} day={day} transactions={rows(snapshot,'finance_transactions').map(x=>({day:String(x.occurred_at).slice(0,10),amount:Number(x.amount_cents),type:String(x.type),accountId:Number(x.account_id)}))}/>
<button disabled={!selected.size||!!busy||hasIncompleteSelectedFinance(analysis.value,selected)} onClick={()=>void apply()}>Сохранить выбранное</button>
    </section>}
    <section className="card dominion-frame"><h2>Последние 3 записи</h2>{entries.length?entries.slice(0,3).map(item=><button className="journal-entry-button" key={text(item.id)} onClick={()=>loadEntry(Number(item.id))}><small>{text(item.day)} · {item.analysis_json?'Разобрано':'Текст'}</small><span>{text(item.raw_text).slice(0,120)}</span></button>):<p className="empty">{copy("Записей пока нет.")}</p>}</section>
  </>;
}
