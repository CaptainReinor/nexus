import {useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {JournalReview} from './journal-review';
import {hasIncompleteSelectedFinance,parseJournalResponse} from '../../shared/journal-schema';
afterEach(cleanup);
it('lets the user fill a missing amount and prevents saving until it is positive',()=>{
  const original=parseJournalResponse(JSON.stringify({summary:'Покупал продукты.',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:null,energy:null,nutrition:null,workout:null,habits:[]},finance:[{type:'expense',amountCents:0,accountId:1,categoryId:2,note:'Продукты'}],work:[],uncertain:[]}));
  const save=vi.fn();
  function Preview(){
    const [analysis,setAnalysis]=useState(original),[selected,setSelected]=useState(new Set<string>());
    return <><JournalReview analysis={analysis} accounts={[{id:1,name:'Дебет'}]} categories={[{id:2,name:'Еда',kind:'expense'}]} habits={[]} jobs={[]} selected={selected} applied={new Set()} onSelect={(key,checked)=>setSelected(checked?new Set([key]):new Set())} onChange={setAnalysis} day="2026-10-01"/>
      <button disabled={!selected.size||hasIncompleteSelectedFinance(analysis,selected)} onClick={()=>save(analysis.finance[0])}>Сохранить</button></>;
  }
  render(<Preview/>);
  fireEvent.click(screen.getByRole('checkbox',{name:/Продукты · укажите сумму/}));
  const amount=screen.getByLabelText('Сумма') as HTMLInputElement,button=screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement;
  expect(amount.value).toBe('');expect(button.disabled).toBe(true);
  fireEvent.change(amount,{target:{value:'35.75'}});expect(button.disabled).toBe(false);
  fireEvent.click(button);expect(save).toHaveBeenCalledWith(expect.objectContaining({amountCents:3575}));
  fireEvent.change(amount,{target:{value:''}});expect(button.disabled).toBe(true);
});
