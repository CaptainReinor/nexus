import { useState } from 'react';
import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { LifeBoard } from './life-board';
import { JournalReview } from './journal-review';
import type { JournalAnalysis } from '../../shared/models';
afterEach(()=>cleanup());
it('captures dropdown values before controlled inputs reset and persists every marker',async()=>{
 const patch=vi.fn<(day:string,value:import('../../shared/life').DetailPatch)=>Promise<void>>(async()=>{});
 function Board(){const [details,setDetails]=useState<{day:string;contexts_json:string;achievement:string;appetite:string|null;sleep_quality:string|null;tension:string|null}[]>([]);return <LifeBoard day="2026-09-30" data={{details,tasks:[],memories:[],reviews:[],markers:['appetite','sleep_quality','tension']}} onDay={()=>{}} onPatch={async(day,value)=>{await patch(day,value);setDetails(previous=>[{...(previous[0]??{day,contexts_json:'[]',achievement:'',appetite:null,sleep_quality:null,tension:null}),...value}]);}} onMarkers={async()=>{}} onTask={async()=>{}} onMemory={async()=>{}} onRemove={async()=>{}} onReview={async()=>{}}/>;}
 render(<Board/>);
 for(const [label,key,value] of [['Аппетит','appetite','high'],['Качество сна','sleep_quality','rested'],['Напряжение','tension','calm']]){
  fireEvent.change(screen.getByRole('combobox',{name:label}),{target:{value}});
  await waitFor(()=>expect((screen.getByRole('combobox',{name:label}) as HTMLSelectElement).value).toBe(value));
  expect(patch).toHaveBeenCalledWith('2026-09-30',{[key]:value});
 }
});
it('waits for the last edited fact to be saved before requesting a review',async()=>{
 let release!:()=>void;const saved=new Promise<void>(resolve=>{release=resolve;});
 const patch=vi.fn(()=>saved),review=vi.fn(async()=>{});
 render(<LifeBoard day="2026-09-30" data={{details:[],tasks:[],memories:[],reviews:[],markers:[]}} onDay={()=>{}} onPatch={patch} onMarkers={async()=>{}} onTask={async()=>{}} onMemory={async()=>{}} onRemove={async()=>{}} onReview={review}/>);
 fireEvent.blur(screen.getByRole('textbox',{name:'Результат дня'}),{target:{value:'Завершил проект'}});
 fireEvent.click(screen.getByRole('button',{name:'Разобрать день'}));
 await waitFor(()=>expect(patch).toHaveBeenCalled());expect(review).not.toHaveBeenCalled();
 release();await waitFor(()=>expect(review).toHaveBeenCalledWith('2026-09-30'));
});
it('lets the user correct the identified habit and financial amount before applying',()=>{
 const edited=vi.fn();
 const initial:JournalAnalysis={summary:'test',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:null,energy:null,nutrition:null,workout:null,habits:[{habitId:1,value:1,status:'done',reason:''}]},finance:[{amountCents:50000,type:'expense',accountId:1,categoryId:1,note:''}],work:[],uncertain:[]};
 function Editor(){const [analysis,setAnalysis]=useState(initial),[selected,setSelected]=useState(new Set(['health.habit.1','finance.0']));return <JournalReview analysis={analysis} selected={selected} applied={new Set()} day="2026-09-30" accounts={[{id:1,name:'Счёт'}]} categories={[{id:1,name:'Еда',kind:'expense'}]} jobs={[]} habits={[{id:1,name:'Прогулка',kind:'positive'},{id:2,name:'Фастфуд',kind:'avoid'}]} onSelect={(key,on)=>setSelected(previous=>{const next=new Set(previous);if(on)next.add(key);else next.delete(key);return next;})} onChange={value=>{edited(value);setAnalysis(value);}}/>;}
 render(<Editor/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Привычка'}),{target:{value:'2'}});
 expect(edited.mock.lastCall![0].health.habits[0]).toMatchObject({habitId:2,value:0,status:'done'});
 expect((screen.getByRole('checkbox',{name:/Фастфуд: не было/i}) as HTMLInputElement).checked).toBe(true);
 fireEvent.change(screen.getByRole('spinbutton',{name:'Сумма'}),{target:{value:'650'}});
 expect(edited.mock.lastCall![0].finance[0].amountCents).toBe(65000);
});
it('shows tomorrow tasks and strips storage fields from the mutation payload',async()=>{
 const task=vi.fn(async()=>{});
 render(<LifeBoard day="2026-09-30" data={{details:[],tasks:[{id:'6f83ae34-dd04-4897-923c-c2ab45bf5e91',title:'Позвонить другу',day:'2026-09-30',due_day:'2026-10-01',status:'open',created_at:'2026-09-30T10:00:00Z',updated_at:'2026-09-30T10:00:00Z'}],memories:[],reviews:[],markers:[]}} onDay={()=>{}} onPatch={async()=>{}} onMarkers={async()=>{}} onTask={task} onMemory={async()=>{}} onRemove={async()=>{}} onReview={async()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:/Выполн.*Позвонить другу/}));
 await waitFor(()=>expect(task).toHaveBeenCalledWith({id:'6f83ae34-dd04-4897-923c-c2ab45bf5e91',title:'Позвонить другу',day:'2026-09-30',due_day:'2026-10-01',status:'done'}));
});
