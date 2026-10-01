import {expect,it} from 'vitest';
import {parseJournalResponse} from './journal-schema';
const health={weightKg:null,sleepStart:null,sleepEnd:'10:00',mood:null,energy:null,nutrition:null,workout:null,habits:[]};
const day={summary:'Встал, готовил еду и работал над проектом.',health,finance:[],work:[],uncertain:[]};
const expense={type:'expense',amountCents:0,accountId:1,categoryId:1,note:'Поход в магазин'};
it('keeps an editable draft and the rest of the analysis when AI emits a zero amount',()=>{
  const parsed=parseJournalResponse(JSON.stringify({...day,finance:[expense]}));
  expect(parsed.finance).toEqual([{...expense,amountCents:null}]);expect(parsed.health.sleepEnd).toBe('10:00');expect(parsed.summary).toBe(day.summary);
  expect(parsed.uncertain).toEqual([]);
});
it('keeps unknown amounts alongside valid income and expense proposals',()=>{
  const valid=[{...expense,amountCents:500000},{...expense,type:'income',amountCents:250000,categoryId:null}];
  const pending={...expense,amountCents:null};
  const parsed=parseJournalResponse(JSON.stringify({...day,finance:[pending,...valid]}));
  expect(parsed.finance).toEqual([pending,...valid]);expect(parsed.uncertain).toEqual([]);
});
it('keeps empty finance empty without adding warnings',()=>{
  expect(parseJournalResponse(JSON.stringify(day))).toMatchObject({finance:[],uncertain:[]});
});
it.each(['not JSON',JSON.stringify({...day,finance:[{...expense,amountCents:'5000'}]}),JSON.stringify({...day,finance:[{...expense,amountCents:-1}]}),JSON.stringify({...day,health:{...health,sleepEnd:'25:30'}})])('shows a readable error for invalid output without exposing validation internals',content=>{
  try{parseJournalResponse(content);throw new Error('unexpected success');}catch(error){
    expect(error).toBeInstanceOf(Error);expect((error as Error).message).toBe('ИИ вернул некорректный разбор. Текст сохранён в поле ввода — повторите анализ.');
    expect((error as Error).message).not.toContain('amountCents');
  }
});
