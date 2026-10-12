import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {WorkPage} from './modules/work';
import {jobStatuses,type NexusAPI,type VacancyDraft,type WorkData} from '../shared/models';
import * as confirmation from './confirm';
const data:WorkData={jobs:[],history:[],entries:[],cases:[],links:[],aiResults:[],weeklyApplications:0,monthlyApplications:0,counts:Object.fromEntries(jobStatuses.map(s=>[s,0])) as WorkData['counts'],stageTotals:Object.fromEntries(jobStatuses.map(s=>[s,0])) as WorkData['stageTotals']};
const draft:VacancyDraft={title:'Аналитик',company:'Компания',url:null,source:null,city:'Москва',work_mode:'Офис',salary_from:null,salary_to:null,currency:null};
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function open(parse:()=>Promise<VacancyDraft>){
 window.nexus={work:{list:async()=>data,saveJob:vi.fn().mockResolvedValue(undefined)},settings:{get:async()=>({weeklyTarget:15})},ai:{parseVacancy:parse}} as unknown as NexusAPI;
 render(<WorkPage/>);await screen.findByText('Вакансий пока нет');fireEvent.click(screen.getByRole('button',{name:'+ Вакансия'}));
 fireEvent.change(screen.getByLabelText('Исходный текст вакансии'),{target:{value:'Нужен аналитик. Формат работы: офис.'}});
 fireEvent.click(screen.getByRole('button',{name:'Разобрать текст с AI'}));
}
it('reviews extracted fields before applying and preserves a manual format edit during the request',async()=>{
 let resolve!:(value:VacancyDraft)=>void;await open(()=>new Promise(r=>{resolve=r;}));
 fireEvent.change(screen.getByLabelText('Формат работы'),{target:{value:'Гибрид'}});resolve(draft);
 await screen.findByText('Результат разбора');expect(screen.getByLabelText('Название позиции')).toHaveProperty('value','');
 fireEvent.click(screen.getByRole('button',{name:'Заполнить поля'}));
 expect(screen.getByLabelText('Название позиции')).toHaveProperty('value','Аналитик');expect(screen.getByLabelText('Формат работы')).toHaveProperty('value','Гибрид');expect(window.nexus.work.saveJob).not.toHaveBeenCalled();
});
it('discards a result if the vacancy source text changes while waiting',async()=>{
 let resolve!:(value:VacancyDraft)=>void;await open(()=>new Promise(r=>{resolve=r;}));
 fireEvent.change(screen.getByLabelText('Исходный текст вакансии'),{target:{value:'Другая вакансия. Удалённая работа.'}});resolve(draft);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Разобрать текст с AI'})).toHaveProperty('disabled',false));expect(screen.queryByText('Результат разбора')).toBeNull();expect(screen.getByLabelText('Название позиции')).toHaveProperty('value','');
});
it('sends a new vacancy only once when the form is submitted twice during saving',async()=>{
 await open(async()=>draft);await screen.findByText('Результат разбора');fireEvent.click(screen.getByRole('button',{name:'Заполнить поля'}));
 let finish!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));window.nexus.work.saveJob=save;
 const form=screen.getByRole('button',{name:'Создать вакансию'}).closest('form')!;fireEvent.submit(form);fireEvent.submit(form);
 expect(save).toHaveBeenCalledOnce();finish();await waitFor(()=>expect(screen.queryByText('Новая вакансия')).toBeNull());
});
it('requires confirmation for deletion, keeps the vacancy after cancel and removes it after accepting',async()=>{
 const job={...draft,id:1,title:'Аналитик',company:'Компания',url:'',source:'',city:'',work_mode:'Офис',salary_from:null,salary_to:null,currency:'RUB',original_text:'Текст',notes:'',status:'saved' as const,created_at:'2026-10-12',updated_at:'2026-10-12'};
 let jobs=[job];const remove=vi.fn(async()=>{jobs=[];});
 window.nexus={work:{list:async()=>({...data,jobs}),deleteJob:remove},settings:{get:async()=>({weeklyTarget:15})}} as unknown as NexusAPI;
 const confirm=vi.spyOn(confirmation,'askConfirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 render(<WorkPage/>);const button=await screen.findByRole('button',{name:'Удалить'});fireEvent.click(button);
 await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());expect(remove).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Удалить'})).toBeTruthy();
 fireEvent.click(button);await waitFor(()=>expect(remove).toHaveBeenCalledWith({id:1}));await screen.findByText('Вакансия удалена.');expect(screen.queryByRole('button',{name:'Удалить'})).toBeNull();
});
