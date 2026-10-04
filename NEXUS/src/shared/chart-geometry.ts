export type ChartPoint={day:string;value:number|null};
export type ChartKind='line'|'bar';
export function chartGeometry(points:ChartPoint[],width:number,height:number,kind:ChartKind,axisFormatter?:(value:number)=>string){
  const valid=points.filter(point=>point.value!==null&&Number.isFinite(point.value));
  if(!valid.length)return null;
  const values=valid.map(p=>p.value!),rawMin=Math.min(...values),rawMax=Math.max(...values);
  let min=kind==='bar'?Math.min(0,rawMin):rawMin,max=kind==='bar'?Math.max(0,rawMax):rawMax;
  const padding=max===min?Math.max(Math.abs(max)*.05,.2):(max-min)*.1;
  if(kind==='line'){min-=padding;max+=padding;}else if(min===max){max=1;}else{if(min<0)min-=padding;if(max>0)max+=padding;}
  const niceStep=(value:number)=>{const power=10**Math.floor(Math.log10(value)),fraction=value/power;return (fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power;};
  const formatTick=axisFormatter??((value:number)=>new Intl.NumberFormat('ru-RU',{notation:Math.abs(value)>=10000?'compact':'standard',maximumFractionDigits:Math.abs(value)<10?2:1}).format(value));
  let step=niceStep((max-min)/4);
  const domainMin=min,domainMax=max;
  for(let attempt=0;attempt<20;attempt++){
    min=Math.floor(domainMin/step)*step;max=Math.ceil(domainMax/step)*step;
    if(Math.round((max-min)/step)<2)max=min+step*2;
    const count=Math.round((max-min)/step)+1,labels=Array.from({length:count},(_,i)=>formatTick(+(min+i*step).toPrecision(12)));
    if(count<=5&&new Set(labels).size===count)break;
    step=niceStep(step*1.01);
  }
  const ticks=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>+(min+i*step).toPrecision(12));
  const left=Math.max(48,...ticks.map(v=>formatTick(v).length*7+16)),right=16,top=16,bottom=34,plotWidth=Math.max(1,width-left-right),plotHeight=height-top-bottom;
  const times=points.map(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.day)?Date.parse(p.day):NaN),chronological=times.every(Number.isFinite)&&times.at(-1)!>times[0];
  const x=(index:number)=>left+(points.length===1?.5:chronological?(times[index]-times[0])/(times.at(-1)!-times[0]):index/(points.length-1))*plotWidth;
  const y=(value:number)=>top+(max-value)/(max-min)*plotHeight,baseline=y(0);
  const positions=points.map((p,index)=>({x:x(index),y:p.value!==null&&Number.isFinite(p.value)?y(p.value):null}));
  const steps=positions.slice(1).map((p,i)=>p.x-positions[i].x).filter(n=>n>0);
  const barWidth=Math.max(1,Math.min(40,(steps.length?Math.min(...steps):plotWidth)*.65,(steps.length?Math.min(...steps):plotWidth)-3));
  if(kind==='bar')positions.forEach(position=>{position.x=left+barWidth/2+(position.x-left)/plotWidth*(plotWidth-barWidth);});
  return {min,max,ticks,left,right,top,bottom,plotHeight,plotWidth,positions,baseline,barWidth,y,formatTick};
}
