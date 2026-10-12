import {carryChartValues} from '../../NEXUS/src/shared/chart-series';
import {localDay} from '../../NEXUS/src/shared/domain';
import {DateChart,type SeriesRole} from '../../NEXUS/src/renderer/date-chart';

export function MobileChart({points:sourcePoints,carryForward=false,formatValue,kind='line',role='neutral',label='Показатель'}:{points:{day:string;value:number}[];carryForward?:boolean;formatValue:(value:number)=>string;kind?:'line'|'bar';role?:SeriesRole;label?:string}){
 const points=carryForward?carryChartValues(sourcePoints,localDay()).filter((p):p is {day:string;value:number}=>p.value!==null):sourcePoints;
 return <DateChart points={points} formatValue={formatValue} kind={kind} role={role} label={label} mobile/>;
}
