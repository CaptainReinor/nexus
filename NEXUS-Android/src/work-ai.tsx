import { useState } from 'react';
import { aiEnabled, needsBudgetConfirmation, parseVacancy, recordUsage, runWorkAI, type AIKind, type VacancyDraft } from './ai';
import { nextId, rows, type Row, type Snapshot } from './sync';

type CommitLatest=(change:(snapshot:Snapshot)=>void)=>Promise<boolean>;
const message=(error:unknown)=>error instanceof Error?error.message:'Не удалось выполнить AI-запрос.';
function allowed(snapshot:Snapshot):boolean{
  if(!aiEnabled(snapshot))throw new Error('Включите AI в настройках NEXUS на компьютере.');
  return !needsBudgetConfirmation(snapshot)||confirm('Лимит расходов на AI достигнут или стоимость прошлых запросов неизвестна. Продолжить?');
}
export function VacancyImport({snapshot,text,onParsed,commitLatest}:{snapshot:Snapshot;text:string;onParsed:(draft:VacancyDraft)=>void;commitLatest:CommitLatest}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(){setError('');setBusy(true);try{
    if(!allowed(snapshot))return;
    const result=await parseVacancy(snapshot,text);
    if(await commitLatest(s=>recordUsage(s,result.reply,'vacancy-import',result.model)))onParsed(result.draft);
  }catch(cause){setError(message(cause));}finally{setBusy(false);}}
  return <><button className="ghost" disabled={text.trim().length<20||busy} onClick={()=>void run()}>{busy?'Разбираю…':'Разобрать текст вакансии с AI'}</button>{error&&<p className="error" role="alert">{error}</p>}</>;
}
const labels:{kind:AIKind;label:string}[]=[{kind:'analysis',label:'Анализ'},{kind:'cover',label:'Письмо'},{kind:'interview',label:'Интервью'}];
export function JobAI({snapshot,job,commitLatest}:{snapshot:Snapshot;job:Row;commitLatest:CommitLatest}){
  const [busy,setBusy]=useState<AIKind|null>(null),[error,setError]=useState(''),[display,setDisplay]=useState<AIKind>('analysis');
  const latest=rows(snapshot,'job_ai_analyses').filter(x=>x.job_id===job.id&&x.kind===display).sort((a,b)=>Number(b.id)-Number(a.id))[0];
  async function run(kind:AIKind){setError('');setBusy(kind);try{
    if(!allowed(snapshot))return;
    const result=await runWorkAI(snapshot,job,kind);
    const saved=await commitLatest(s=>{const items=rows(s,'job_ai_analyses');items.push({id:nextId(items),job_id:job.id,kind,content:result.content,created_at:new Date().toISOString()});recordUsage(s,result.reply,kind,result.model);});
    if(saved)setDisplay(kind);
  }catch(cause){setError(message(cause));}finally{setBusy(null);}}
  let rendered:React.ReactNode=null;
  if(latest){
    if(display==='cover')rendered=<p className="ai-letter">{String(latest.content)}</p>;
    else try{
      const value=JSON.parse(String(latest.content)) as Record<string,unknown>;
      rendered=<div className="ai-result">{Object.entries(value).map(([key,item])=><div key={key}><strong>{{requirements:'Требования',matches:'Подтверждённый опыт',relevantCaseIds:'Кейсы',gaps:'Пробелы',emphasize:'Что подчеркнуть',interviewQuestions:'Вопросы на интервью',preparation:'Подготовка',questions:'Возможные вопросы',employerQuestions:'Вопросы работодателю'}[key as keyof typeof value]??key}</strong><ul>{(Array.isArray(item)?item:[]).map((line,index)=><li key={index}>{typeof line==='string'?line:typeof line==='number'?String(line):JSON.stringify(line)}</li>)}</ul></div>)}</div>;
    }catch{rendered=<p className="ai-letter">{String(latest.content)}</p>;}
  }
  return <section className="card"><h2>AI · {String(job.title)}</h2><p className="muted">Ответы используют только сохранённый текст вакансии и вашу Базу опыта.</p><div className="journal-actions">{labels.map(x=><button key={x.kind} className="ghost" disabled={!!busy} onClick={()=>void run(x.kind)}>{busy===x.kind?'Готовлю…':x.label}</button>)}</div>{error&&<p className="error" role="alert">{error}</p>}{labels.some(x=>rows(snapshot,'job_ai_analyses').some(item=>item.job_id===job.id&&item.kind===x.kind))&&<div className="segmented">{labels.map(x=><button key={x.kind} className={display===x.kind?'selected':''} onClick={()=>setDisplay(x.kind)}>{x.label}</button>)}</div>}{rendered}</section>;
}
