import { useState } from 'react';
import { askConfirm } from '../confirm';
import type { Habit, HabitLog } from '../../shared/models';
import type { DayLifeData, DayTask } from '../../shared/life';
import { displayDay } from '../../shared/domain';
import { useAutoSave } from '../autosave';
import './today.css';

export type TodayHabit=Pick<Habit,'id'|'name'|'kind'|'format'|'target'|'period'>&{value:number|null;status:HabitLog['status']|null};
type Mark={value:number;status:HabitLog['status']};
const success=(habit:TodayHabit)=>habit.status==='done'&&(habit.kind==='avoid'?habit.value===0:(habit.value??0)>=habit.target);

export function TodayCapture({onOpen}:{onOpen:()=>void}){
  return <section className="today-capture"><div className="today-capture-icon" aria-hidden="true">✎</div><div><h2>Что было сегодня?</h2><p>Текстом или голосом.</p></div><button className="today-button primary" onClick={onOpen}>Записать день <span aria-hidden="true">→</span></button></section>;
}

export function TodayHabits({habits,onMark,onManage}:{habits:TodayHabit[];onMark:(habit:TodayHabit,value:number,status:HabitLog['status'])=>Promise<void|boolean>;onManage:()=>void}){
  const [changes,setChanges]=useState<Record<number,Mark>>({});
  const {queue,status}=useAutoSave();
  const items=habits.map(habit=>({...habit,...changes[habit.id]}));
  const daily=items.filter(habit=>habit.period==='daily'),weekly=items.filter(habit=>habit.period==='weekly');
  const completed=daily.filter(success),pending=daily.filter(habit=>!success(habit));
  function mark(habit:TodayHabit,value:number,nextStatus:HabitLog['status'],delay=0){
    const patch={value,status:nextStatus};setChanges(previous=>({...previous,[habit.id]:patch}));
    queue.enqueue(`today-habit:${habit.id}`,async()=>{await onMark(habit,value,nextStatus);setChanges(previous=>{if(previous[habit.id]!==patch)return previous;const next={...previous};delete next[habit.id];return next;});},delay);
  }
  function row(habit:TodayHabit){return <div className={`today-habit ${success(habit)?'complete':''}`} key={habit.id}>
    <span className="today-habit-name">{habit.name}{habit.format==='duration'&&<small>Цель: {habit.target} мин</small>}{habit.format==='quantity'&&<small>Цель: {habit.target}</small>}</span>
    <div className="today-habit-actions">
      {(habit.format==='quantity'||habit.format==='duration')&&<input className="today-amount" aria-label={`Значение ${habit.name}`} type="number" min="0" value={habit.value??''} placeholder={habit.format==='duration'?'мин':'кол-во'} onChange={event=>{const value=Number(event.target.value);mark(habit,value,event.target.value===''?'skipped':habit.kind==='avoid'?(value===0?'done':'missed'):(value>=habit.target?'done':'missed'),350);}}/>}
      <button className={`today-choice ${success(habit)?'chosen good':''}`} aria-label={`${habit.kind==='avoid'?'Не было':'Сделано'}: ${habit.name}`} aria-pressed={success(habit)} onClick={()=>mark(habit,habit.kind==='avoid'?0:Math.max(1,habit.target),'done')}>{success(habit)&&<span aria-hidden="true">✓ </span>}{habit.kind==='avoid'?'Не было':'Сделано'}</button>
      <button className={`today-choice ${habit.status==='missed'?'chosen bad':''}`} aria-label={`${habit.kind==='avoid'?'Было':'Нет'}: ${habit.name}`} aria-pressed={habit.status==='missed'} onClick={()=>mark(habit,habit.kind==='avoid'?1:0,'missed')}>{habit.kind==='avoid'?'Было':'Нет'}</button>
      {habit.status&&habit.status!=='skipped'&&<button className="today-reset" aria-label={`Сбросить ${habit.name}`} onClick={()=>mark(habit,0,'skipped')}>↺</button>}
    </div>
  </div>;}
  return <section className="today-card today-habits"><header className="today-card-head"><h2>Привычки</h2><span className="today-count">{completed.length} / {daily.length}</span></header>
    {daily.length>0&&<div className="today-progress" aria-label={`Ежедневные привычки: ${completed.length} из ${daily.length}`}><span style={{width:`${completed.length/daily.length*100}%`}}/></div>}
    {pending.slice(0,6).map(row)}
    {pending.length>6&&<details className="today-fold"><summary>Ещё привычки · {pending.length-6}</summary>{pending.slice(6).map(row)}</details>}
    {!daily.length&&<p className="today-empty">Добавьте привычки, которые хотите отмечать каждый день.</p>}
    {daily.length>0&&!pending.length&&<p className="today-done">✓ На сегодня всё сделано</p>}
    {completed.length>0&&<details className="today-fold"><summary>Выполнено · {completed.length}</summary>{completed.map(row)}</details>}
    {weekly.length>0&&<details className="today-fold"><summary>На этой неделе · {weekly.length}</summary>{weekly.map(row)}</details>}
    <footer className="today-card-footer"><button className="today-text-button" onClick={onManage}>Все привычки →</button>{status.state==='saving'&&<span className="today-save" role="status">Сохранение…</span>}{status.state==='error'&&<div className="today-error" role="alert">{status.error}<button className="today-text-button" onClick={()=>queue.retry()}>Повторить</button></div>}</footer>
  </section>;
}

export function TodayTasks({data,day,onTask,onRemove,onMore}:{data:DayLifeData;day:string;onTask:(input:Pick<DayTask,'id'|'title'|'day'|'due_day'|'status'>|{title:string;day:string;due_day:string})=>Promise<void>;onRemove:(id:string)=>Promise<void>;onMore:()=>void}){
  const [adding,setAdding]=useState(false),[title,setTitle]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[due,setDue]=useState(day);
  const tasks=data.tasks.filter(task=>task.status==='open'&&task.due_day<=day).sort((a,b)=>a.due_day.localeCompare(b.due_day)||a.created_at.localeCompare(b.created_at));
  const done=data.tasks.filter(task=>task.status==='done'&&task.due_day===day);
  async function change(task:DayTask,status:'open'|'done',date=task.due_day){setBusy(task.id);try{await onTask({id:task.id,title:task.title,day:task.day,due_day:date,status});setEditing(null);setError('');}catch(error){setError(error instanceof Error?error.message:'Не удалось сохранить дело.');}finally{setBusy(null);}}
  async function remove(task:DayTask){if(!await askConfirm(`Удалить «${task.title}»?`))return;setBusy(task.id);try{await onRemove(task.id);setEditing(null);setError('');}catch(error){setError(error instanceof Error?error.message:'Не удалось удалить дело.');}finally{setBusy(null);}}
  async function add(){if(!title.trim()||busy)return;setBusy('new');try{await onTask({title:title.trim(),day,due_day:day});setTitle('');setAdding(false);setError('');}catch(error){setError(error instanceof Error?error.message:'Не удалось добавить дело.');}finally{setBusy(null);}}
  function row(task:DayTask){return <div className="today-task-wrap" key={task.id}><div className={`today-task ${task.status==='done'?'complete':''}`}>
    {task.status==='open'?<button className="today-task-check" disabled={!!busy} aria-label={`Выполнить: ${task.title}`} onClick={()=>void change(task,'done')}><span aria-hidden="true">✓</span></button>:<span className="today-complete-mark" aria-hidden="true">✓</span>}
    <div className="today-task-title"><span>{task.title}</span>{task.due_day<day&&<small className="today-overdue">{displayDay(task.due_day)}</small>}</div>
    {task.status==='done'&&<button className="today-text-button" disabled={!!busy} onClick={()=>void change(task,'open')}>Вернуть</button>}
    <button className="today-task-options" aria-label={`Действия: ${task.title}`} aria-expanded={editing===task.id} disabled={!!busy} onClick={()=>{setEditing(editing===task.id?null:task.id);setDue(task.due_day);}}>⋯</button>
    </div>{editing===task.id&&<form className="today-task-editor" onSubmit={event=>{event.preventDefault();if(due)void change(task,task.status,due);}}><label>На другой день<input aria-label={`Перенести: ${task.title}`} type="date" required value={due} onChange={event=>setDue(event.target.value)}/></label><button className="today-button" disabled={!!busy||!due||due===task.due_day}>Перенести</button><button type="button" className="today-text-button today-task-delete" disabled={!!busy} onClick={()=>void remove(task)}>Удалить</button></form>}</div>;}
  return <section className="today-card today-tasks"><header className="today-card-head"><h2>Главные дела</h2><button className="today-text-button" aria-expanded={adding} onClick={()=>setAdding(!adding)}>+ Добавить</button></header>
    {tasks.length?tasks.slice(0,5).map(row):<p className="today-empty">На сегодня дел нет.</p>}
    {tasks.length>5&&<details className="today-fold"><summary>Ещё дела · {tasks.length-5}</summary>{tasks.slice(5).map(row)}</details>}
    {adding&&<form className="today-task-add" onSubmit={event=>{event.preventDefault();void add();}}><input aria-label="Новое дело на сегодня" autoFocus value={title} maxLength={300} onChange={event=>setTitle(event.target.value)} placeholder="Что хотите сделать сегодня?"/><button className="today-button" disabled={!!busy||!title.trim()}>Добавить</button></form>}
    {done.length>0&&<details className="today-fold"><summary>Сделано · {done.length}</summary>{done.map(row)}</details>}
    {error&&<p className="today-error" role="alert">{error}</p>}
    <footer className="today-card-footer"><button className="today-text-button" onClick={onMore}>Планы и заметки →</button></footer>
  </section>;
}
