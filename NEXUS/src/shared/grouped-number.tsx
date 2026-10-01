import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

export function ungroupNumber(value:string):string { return value.replace(/\s/g,'').replace(/−/g,'-'); }
export function groupNumber(value:string|number|null|undefined):string {
  const raw=ungroupNumber(String(value??''));
  if(!/^-?\d*(?:[.,]\d*)?$/.test(raw))return raw;
  const match=/^(-?)(\d*)(.*)$/.exec(raw)!;
  return match[1]+match[2].replace(/\B(?=(\d{3})+(?!\d))/g,' ')+match[3];
}

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:string|number|null;onValueChange:(value:string)=>void};
/** Keep raw values in forms; grouping is presentation only, including when editing in the middle. */
export function GroupedNumberInput({value,onValueChange,inputMode='decimal',...props}:Props){
  const input=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null);
  const displayed=groupNumber(value);
  useLayoutEffect(()=>{
    if(caret.current===null||!input.current)return;
    const count=caret.current;caret.current=null;
    let position=0,seen=0;
    while(position<displayed.length&&seen<count){if(displayed[position]!==' ')seen++;position++;}
    input.current.setSelectionRange(position,position);
  },[displayed]);
  return <input {...props} ref={input} type="text" inputMode={inputMode} value={displayed} onChange={event=>{
    caret.current=ungroupNumber(event.target.value.slice(0,event.target.selectionStart??event.target.value.length)).length;
    onValueChange(ungroupNumber(event.target.value));
  }}/>;
}
