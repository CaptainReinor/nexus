import { habitPeriodState,displayDay } from '../../NEXUS/src/shared/domain';
import type { Habit,HabitLog } from '../../NEXUS/src/shared/models';
import { rows, today, type Snapshot } from './sync';
const dateOf=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function HabitStatistics({snapshot}:{snapshot:Snapshot}){
 const habits=rows(snapshot,'habits').filter(x=>x.active===1),logs=rows(snapshot,'habit_logs');
 return <section className="card"><h2>Регулярность привычек</h2><p className="muted">Зелёный — успех, красный — не выполнено, серый — период ещё не завершён.</p>{habits.map(h=>{
  const weekly=h.period==='weekly';
  const cells=Array.from({length:weekly?8:28},(_,i)=>{const date=new Date(`${today()}T12:00:00`);date.setDate(date.getDate()-(weekly?7-i:27-i)*(weekly?7:1));if(weekly)date.setDate(date.getDate()-(date.getDay()+6)%7);const day=dateOf(date),result=habitPeriodState(h as unknown as Habit,logs as unknown as HabitLog[],day,today());return {day,state:result==='unmarked'?'empty':result};});
  const observed=cells.filter(x=>x.state!=='empty').length,done=cells.filter(x=>x.state==='success').length;
  return <div className="habit-calendar" key={String(h.id)}><div className="chart-caption"><strong>{String(h.name)}</strong><span>{observed?`${Math.round(done/observed*100)}%`:'—'}</span></div><div className={`habit-cells ${weekly?'weekly':''}`}>{cells.map(c=><div key={c.day} className={`habit-cell ${c.state}`} title={displayDay(c.day)} aria-label={`${displayDay(c.day)}: ${c.state==='success'?'успех':c.state==='failure'?'срыв':'нет отметки'}`}>{Number(c.day.slice(8))}</div>)}</div><small className="muted">{weekly?'8 календарных недель':'28 дней'} · {displayDay(cells[0].day)} — {displayDay(cells.at(-1)!.day)}</small></div>;
 })}{!habits.length&&<p className="muted">Добавьте привычку, чтобы увидеть календарь.</p>}</section>;
}
