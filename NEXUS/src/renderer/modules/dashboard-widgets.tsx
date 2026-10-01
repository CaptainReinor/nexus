import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { DashboardData } from '../../shared/models';
import { money } from '../../shared/domain';
type WidgetProps={data:DashboardData;currency:string};
type DashboardWidget={id:string;component:ComponentType<WidgetProps>};
function HealthWidget({data}:WidgetProps){return <><Link className="today-metric" to="/health"><small>Последний вес</small><strong>{data.health.weight==null?'—':`${data.health.weight} кг`}</strong></Link><Link className="today-metric" to="/health"><small>Последний сон</small><strong>{data.health.sleepMinutes==null?'—':`${Math.floor(data.health.sleepMinutes/60)} ч ${data.health.sleepMinutes%60} мин`}</strong></Link></>;}
function FinanceWidget({data,currency}:WidgetProps){return <Link className="today-metric" to="/finance"><small>Траты сегодня</small><strong>{money(data.finance.today,currency)}</strong></Link>;}
export const dashboardWidgetRegistry:DashboardWidget[]=[{id:'health',component:HealthWidget},{id:'finance',component:FinanceWidget}];
