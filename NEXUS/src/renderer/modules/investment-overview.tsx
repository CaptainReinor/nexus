import { useState } from 'react';
import { money } from '../../shared/domain';
import { investmentSummary } from '../../shared/investments';
import { Empty, Field, LineChart, Panel, Stat, useData } from '../ui';

export function InvestmentOverview({currency}:{currency:string}){
  const {data,error}=useData(window.nexus.investments.list);
  const [selected,setSelected]=useState('');
  const accounts=data?.accounts.filter(a=>a.active)??[],id=Number(selected)||accounts[0]?.id;
  const entries=data?.entries.filter(e=>e.account_id===id)??[],summary=investmentSummary(entries);
  const fmt=(value:number)=>money(value,currency);
  if(data&&!accounts.length)return null;
  return <Panel title="Инвестиции" eyebrow="ОТДЕЛЬНО ОТ ПОВСЕДНЕВНЫХ ДЕНЕГ" className="chart-panel investment-overview">{error&&<p className="help-warning">{error}</p>}{accounts.length?<><Field label="Портфель"><select value={id} onChange={e=>setSelected(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>{entries.length?<><div className="stats-grid"><Stat label="Стоимость портфеля" value={fmt(summary.value)}/><Stat label="Результат без пополнений" value={`${summary.profit>0?'+':''}${fmt(summary.profit)}`} tone={summary.profit<0?'negative':''}/></div><LineChart values={entries.map(e=>e.value_cents)} labels={entries.map(e=>e.day)} formatValue={fmt}/><p className="muted">Стоимость по записанным оценкам. Пополнения и выводы учитываются при расчёте результата.</p></>:<Empty title="Пока нет оценок" description="Внесите стоимость во вкладке «Инвестиции»."/>}</>:<Empty title="Добавьте биржевой счёт" description="Во вкладке «Инвестиции» можно создать портфель и записывать стоимость по дням."/>}</Panel>;
}
