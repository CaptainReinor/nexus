import { habitPeriodState, localDay, weekStart } from '../../shared/domain';
import type { Habit, HabitLog } from '../../shared/models';

export function HabitCalendar({habit,logs}:{habit:Habit;logs:HabitLog[]}){
  const weekly=habit.period==='weekly',today=localDay();
  const cells=Array.from({length:weekly?12:28},(_,i)=>{
    const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()-(weekly?11-i:27-i)*(weekly?7:1));
    const day=weekly?weekStart(date,1):localDay(date);
    const result=habitPeriodState(habit,logs,day,today),state=result==='unmarked'?'unmarked':result;
    return {day,state};
  });
  const observed=cells.filter(c=>c.state!=='unmarked').length,completed=cells.filter(c=>c.state==='success').length;
  const dateLabel=(day:string)=>new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  return <article className="habit-calendar"><div className="calendar-heading"><div><strong>{habit.name}</strong><small>{weekly?'Раз в неделю':'Каждый день'}</small></div><b>{observed?`${Math.round(completed/observed*100)}%`:'—'}</b></div><div className={`habit-cells ${weekly?'weekly':''}`}>{cells.map(c=>{const description=c.state==='success'?'успех':c.state==='failure'?'не выполнено':'нет отметки';return <span className={`habit-cell ${c.state}`} key={c.day} title={`${weekly?'Неделя с ':''}${dateLabel(c.day)}: ${description}`} aria-label={`${c.day}: ${description}`}>{weekly?`${c.day.slice(8)}.${c.day.slice(5,7)}`:Number(c.day.slice(8))}{c.state==='success'&&<i>✓</i>}{c.state==='failure'&&<i>×</i>}</span>;})}</div><div className="calendar-caption"><span>{dateLabel(cells[0].day)} — {dateLabel(cells.at(-1)!.day)}</span><span>{completed} / {observed} оценено</span></div></article>;
}
