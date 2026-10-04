import {useCallback} from 'react';
import {useTheme} from '../appearance';
import {MetricDelta} from '../metric-delta';
import {metricComparison,weightObservations,sleepObservations} from '../../shared/metric-delta';
import {useData} from '../ui';
import {useSystemCopy} from '../appearance';
import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { DashboardData } from '../../shared/models';
import { money } from '../../shared/domain';
type WidgetProps={data:DashboardData;currency:string};
type DashboardWidget={id:string;component:ComponentType<WidgetProps>};
function HealthWidget({data}:WidgetProps){
const theme=useTheme(),loader=useCallback(()=>theme==='dominion'?window.nexus.health.list():Promise.resolve(null),[theme]),history=useData(loader);
const weight=metricComparison('weight',weightObservations(history.data?.weights??[])),sleep=metricComparison('sleep',sleepObservations(history.data?.history??[]));
  const copy=useSystemCopy("dashboard-widgets");
return <><Link className="today-metric" to="/health"><small>{copy("Последний вес")}</small><strong>{data.health.weight==null?'—':`${theme==='dominion'?data.health.weight.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}):data.health.weight} кг`}</strong><MetricDelta kind="weight" {...weight}/></Link><Link className="today-metric" to="/health"><small>{copy("Последний сон")}</small><strong>{data.health.sleepMinutes==null?'—':`${Math.floor(data.health.sleepMinutes/60)} ч ${data.health.sleepMinutes%60} мин`}</strong><MetricDelta kind="sleep" {...sleep}/></Link></>;}
function FinanceWidget({data,currency}:WidgetProps){
  const copy=useSystemCopy("dashboard-widgets");
return <Link className="today-metric" to="/finance"><small>{copy("Траты сегодня")}</small><strong>{money(data.finance.today,currency)}</strong></Link>;}
export const dashboardWidgetRegistry:DashboardWidget[]=[{id:'health',component:HealthWidget},{id:'finance',component:FinanceWidget}];
