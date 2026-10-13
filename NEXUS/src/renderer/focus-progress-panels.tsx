import {useState,memo} from 'react';
import {focusStats} from '../shared/focus-stats';
import {displayDay} from '../shared/domain';
import {DateChart} from './date-chart';
type Stats=ReturnType<typeof focusStats>;
const money=(v:number)=>`${(v/100).toLocaleString('ru-RU',{maximumFractionDigits:0})} ₽`;
const kg=(v:number)=>`${v.toLocaleString('ru-RU',{maximumFractionDigits:1})} кг`;
export const WeightTrendCard=memo(function WeightTrendCard({stats,mobile}:{stats:Stats;mobile:boolean}){
 const [smooth,setSmooth]=useState(true),trend=stats.weightTrend;
 return <section><header className="focus-section-header"><h3>Вес</h3><div className="focus-inline-switch" aria-label="График веса"><button className={!smooth?'selected':''} aria-pressed={!smooth} onClick={()=>setSmooth(false)}>Измерения</button><button className={smooth?'selected':''} aria-pressed={smooth} onClick={()=>setSmooth(true)}>Среднее 7 дней</button></div></header>
 <DateChart points={smooth?trend.points:stats.charts.weight} mobile={mobile} label={smooth?'Средний вес за 7 дней':'Вес'} formatValue={kg}/>
 <div className="focus-trend-summary"><span title={`${trend.current.count} измерений за последние 7 дней`}>Среднее · {trend.current.value===null?'—':kg(trend.current.value)}</span>{trend.change!==null&&<span className={trend.change<0?'favorable':trend.change>0?'unfavorable':''} title="Сравнение средних значений последних и предыдущих семи дней">{trend.change>0?'↑ +':trend.change<0?'↓ ':''}{kg(trend.change)} за неделю</span>}</div></section>;
});
export const SavingsForecast=memo(function SavingsForecast({stats}:{stats:Stats}){
 const f=stats.forecast;if(stats.config.targetCents===null)return null;
 return <details className="focus-forecast"><summary>Прогноз цели</summary><div className="focus-mini-metrics"><div><small>Осталось</small><strong>{money(f.remaining??0)}</strong></div><div><small>При текущем темпе</small><strong>{f.state==='reached'?'Цель достигнута':f.predictedDay?`≈ ${displayDay(f.predictedDay)}`:'—'}</strong></div>{f.weeklyRequired!==null&&<div><small>Нужно в неделю</small><strong>{money(f.weeklyRequired)}</strong></div>}</div>{f.state==='insufficient'?<small>Для прогноза пока мало пополнений.</small>:f.state==='no-growth'?<small>Накопления пока не растут.</small>:f.state==='overdue'?<small>Срок цели прошёл.</small>:f.state==='growing'?<small>По темпу последних {f.windowDays} дней.</small>:null}</details>;
});
export const TrainingPanel=memo(function TrainingPanel({stats,mobile}:{stats:Stats;mobile:boolean}){
 const [training,setTraining]=useState(true),data=stats.training,rows=training?data.sessions:data.other;
 return <section><header className="focus-section-header"><div className="focus-inline-switch" aria-label="Тип активности"><button className={training?'selected':''} aria-pressed={training} onClick={()=>setTraining(true)}>Тренировки</button><button className={!training?'selected':''} aria-pressed={!training} onClick={()=>setTraining(false)}>Остальные активности</button></div></header>{training&&<div className="focus-mini-metrics"><div><small>Тренировок</small><strong>{data.sessions.length}</strong></div><div><small>Дней</small><strong>{data.days}</strong></div><div><small>Время</small><strong>{data.minutes===null?'—':`${data.minutes} мин`}</strong></div></div>}
 {training&&<DateChart kind="bar" points={data.points} mobile={mobile} label="Тренировки" formatValue={v=>`${v} мин`}/>}
 {rows.slice().sort((a,b)=>String(b.day).localeCompare(String(a.day))).map(row=><div className="focus-record" key={String(row.id)}><div><strong>{String(row.title)}</strong><small>{displayDay(String(row.day))}{row.type==='gym'?' · Зал':row.type==='sport'?' · Спорт':''}</small></div><strong>{typeof row.minutes==='number'?`${row.minutes} мин`:'—'}</strong></div>)}{!rows.length&&<div className="chart-empty">Нет записей</div>}</section>;
});
