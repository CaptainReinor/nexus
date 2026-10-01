export function investmentSummary(entries:{day:string;value_cents:number;flow_cents:number}[]):{value:number;flow:number;profit:number}{
  const sorted=[...entries].sort((a,b)=>a.day.localeCompare(b.day));
  if(!sorted.length)return {value:0,flow:0,profit:0};
  const value=sorted.at(-1)!.value_cents,flow=sorted.slice(1).reduce((sum,x)=>sum+x.flow_cents,0);
  return {value,flow,profit:value-sorted[0].value_cents-flow};
}
