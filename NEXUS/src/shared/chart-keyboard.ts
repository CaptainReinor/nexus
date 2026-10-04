export function chartKeyIndex(key:string,current:number,count:number):number|null{
  if(count<1)return null;
  if(key==='Home')return 0;
  if(key==='End')return count-1;
  if(key==='ArrowLeft'||key==='ArrowDown')return Math.max(0,current-1);
  if(key==='ArrowRight'||key==='ArrowUp')return Math.min(count-1,current+1);
  return null;
}
