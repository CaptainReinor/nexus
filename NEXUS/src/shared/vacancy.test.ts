import {describe,it,expect} from 'vitest';
import {applyVacancyDraft,parseVacancyResponse,jobInputSchema,vacancyFields} from './vacancy';
import type {JobInput,VacancyDraft} from './models';
const draft:VacancyDraft={title:'Аналитик',company:'Компания',url:null,source:null,city:null,work_mode:null,salary_from:null,salary_to:null,currency:null};
const job:JobInput={title:'Вакансия',company:'Компания',url:'',source:'',city:'',work_mode:'',salary_from:100000,salary_to:150000,currency:'RUB',original_text:'Исходный текст вакансии',notes:'',status:'saved'};
describe('vacancy extraction',()=>{
 it.each([['Формат работы: на месте работодателя','Удалённо','Офис'],['Формат работы:\nУдалённая работа','Полная занятость','Удалённо'],['Формат работы: Гибрид','5/2','Гибрид'],['Режим работы: Полная занятость, 5/2','Офис',null],['Полная занятость. График 5/2. Москва.','Полная занятость',null],['Полная занятость. График 5/2. Москва.','Офис',null],['Формат работы: Разъездной','Офис','Разъездной'],['Формат работы: Офис или удалённо','Офис','Офис или удалённо'],['Формат работы: Офис, затем гибрид','Гибрид','Офис, затем гибрид']])('distinguishes work location in %s', (text,mode,expected)=>{
   expect(parseVacancyResponse(JSON.stringify({...draft,work_mode:mode}),text).work_mode).toBe(expected);
 });
 it('accepts nullable blanks and fenced JSON but rejects invalid money and links',()=>{
   expect(parseVacancyResponse('```json\n'+JSON.stringify({...draft,city:' ',currency:' rub '})+'\n```','Вакансия')).toMatchObject({city:null,currency:'RUB'});
   for(const invalid of [{salary_from:200000,salary_to:100000},{salary_from:-10},{salary_from:0},{url:'file:///secret'},{extra:'invented'}])expect(()=>parseVacancyResponse(JSON.stringify({...draft,...invalid}),'Вакансия')).toThrow();
 });
 it('does not overwrite manual edits and applies a one-sided salary as a pair',()=>{
   const parsed={...draft,title:'Из текста',salary_from:200000,currency:'RUB'};
   expect(applyVacancyDraft({...job,title:'Моя правка'},job,parsed,[...vacancyFields])).toMatchObject({title:'Моя правка',salary_from:200000,salary_to:null});
   expect(applyVacancyDraft({...job,salary_to:300000},job,parsed,[...vacancyFields])).toMatchObject({salary_from:100000,salary_to:300000});
   expect(applyVacancyDraft(job,job,parsed,['city'])).toEqual(job);
 });
 it('validates manually filled salary ranges before storage',()=>{
   expect(jobInputSchema.safeParse(job).success).toBe(true);
   expect(jobInputSchema.safeParse({...job,salary_from:200000}).success).toBe(false);
   expect(jobInputSchema.safeParse({...job,currency:'123'}).success).toBe(false);
 });
});
