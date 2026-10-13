import * as confirmations from './confirm';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FocusPage,FocusSettings} from './focus-mode';
import {focusSnapshot,publishFocus} from '../shared/focus-isolation';
import {saveFocusTurn,removeFocusFood,updateFocusConfig,configureFocus,focusConfig,mentorReplySchema,type FocusAPI} from '../shared/focus-mode';
import type {Snapshot} from '../shared/snapshot-sync';
import * as statistics from '../shared/focus-stats';
import {saveFocusLabel,labelDraftSchema} from '../shared/focus-label';
import {FocusLabelPanel} from './focus-label-panel';
vi.mock('./label-photo',()=>({prepareLabelPhoto:vi.fn().mockResolvedValue('data:image/png;base64,AA==')}));
import {localDay} from '../shared/domain';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
function fixture(){
 const s:Snapshot={format:'nexus-backup',version:12,exportedAt:'',tables:{settings:[],weight_entries:[],health_daily_entries:[],finance_transactions:[],mentor_turns:[],food_entries:[],activity_entries:[],workouts:[]}};
 Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{value:vi.fn(),configurable:true});
 const api:FocusAPI={scanLabel:vi.fn(),saveLabel:vi.fn(),updateConfig:vi.fn(async patch=>updateFocusConfig(s,patch)),removeFood:vi.fn(async input=>removeFocusFood(s,input)),snapshot:async()=>focusSnapshot(s),publish:vi.fn(async()=>publishFocus(s)),configure:vi.fn(async config=>configureFocus(s,config)),send:vi.fn().mockResolvedValue({reply:'Отметил вес. Продолжим наблюдать за динамикой.',actions:[{kind:'weight',day:localDay(),kg:84.2}]}),save:vi.fn(async x=>{saveFocusTurn(s,x);}),transcribe:vi.fn().mockResolvedValue('Тестовый голос')};return {s,api};
}
it('sends on Enter once, while Shift+Enter and composing keyboard input keep the draft',async()=>{
 const {api}=fixture();render(<FocusPage api={api}/>);await screen.findByText('Начнём с твоего дня');const field=screen.getByLabelText('Сообщение наставнику');
 fireEvent.change(field,{target:{value:'Вес 84.2'}});
 fireEvent.keyDown(field,{key:'Enter',shiftKey:true});fireEvent.keyDown(field,{key:'Enter',isComposing:true});fireEvent.keyDown(field,{key:'Enter',keyCode:229});fireEvent.keyDown(field,{key:'Enter',repeat:true});
 expect(api.send).not.toHaveBeenCalled();expect((field as HTMLTextAreaElement).value).toBe('Вес 84.2');
 fireEvent.keyDown(field,{key:'Enter'});fireEvent.keyDown(field,{key:'Enter'});
 await screen.findByText('Отметил вес. Продолжим наблюдать за динамикой.');expect(api.send).toHaveBeenCalledOnce();expect((field as HTMLTextAreaElement).value).toBe('');
});
it('does not recompute statistics on every typed character',async()=>{
 const compute=vi.spyOn(statistics,'focusStats'),{api}=fixture();render(<FocusPage api={api}/>);await screen.findByText('Начнём с твоего дня');const baseline=compute.mock.calls.length;
 for(const value of ['С','Се','Сег','Сегодня','Сегодня съел курицу'])fireEvent.change(screen.getByLabelText('Сообщение наставнику'),{target:{value}});
 expect(compute.mock.calls.length).toBe(baseline);
});
it('lets the user review a label, change a number, and save a product without logging a meal',async()=>{
 const {s,api}=fixture();api.scanLabel=vi.fn().mockResolvedValue(labelDraftSchema.parse({name:'Йогурт',basisGrams:200,kcal:180,proteinG:12,fatG:4,carbsG:24}));api.saveLabel=vi.fn(async input=>{saveFocusLabel(s,input.draft);});const saved=vi.fn().mockResolvedValue(undefined);
 const page=render(<FocusLabelPanel api={api} busy={false} onBusy={()=>{}} onSaved={saved}/>);const upload=page.container.querySelector('input[type=file]')!;
 fireEvent.change(upload,{target:{files:[new File(['synthetic'], 'label.png',{type:'image/png'})]}});await screen.findByLabelText('Продукт');fireEvent.change(screen.getByLabelText('Ккал'),{target:{value:'200'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить продукт'}));await screen.findByText('Продукт сохранён.');
 expect(JSON.parse(String(s.tables.focus_products[0].nutrients_json)).kcal).toBe(100);expect(s.tables.food_entries).toHaveLength(0);expect(saved).toHaveBeenCalledOnce();expect(JSON.stringify(s.tables)).not.toContain('data:image');
});
it('saves a mentor turn immediately and lets the user edit its actual measurement afterwards',async()=>{const {s,api}=fixture();render(<FocusPage api={api}/>);await screen.findByText('Начнём с твоего дня');fireEvent.change(screen.getByLabelText('Сообщение наставнику'),{target:{value:'Вес 84.2'}});fireEvent.click(screen.getByRole('button',{name:'Отправить'}));await screen.findByText('Отметил вес. Продолжим наблюдать за динамикой.');expect(s.tables.focus_weights[0].weight_kg).toBe(84.2);fireEvent.click(screen.getByRole('button',{name:/Исправить запись/}));fireEvent.change(screen.getByLabelText('Вес, кг'),{target:{value:'83.8'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить исправления'}));await waitFor(()=>expect(s.tables.focus_weights[0].weight_kg).toBe(83.8));expect(s.tables.mentor_turns).toHaveLength(1);});
it('retries a failed local save without paying for another mentor response',async()=>{const {s,api}=fixture();api.save=vi.fn().mockRejectedValueOnce(Error('Не удалось сохранить')).mockImplementation(async x=>saveFocusTurn(s,x));render(<FocusPage api={api}/>);fireEvent.change(screen.getByLabelText('Сообщение наставнику'),{target:{value:'Вес 84.2'}});fireEvent.click(screen.getByRole('button',{name:'Отправить'}));await screen.findByText('Не удалось сохранить');fireEvent.click(screen.getByRole('button',{name:'Отправить'}));await screen.findByText('Отметил вес. Продолжим наблюдать за динамикой.');expect(api.send).toHaveBeenCalledOnce();expect(s.tables.focus_weights).toHaveLength(1);});
it('enters and leaves the single-page mode without removing data',async()=>{const {api}=fixture();render(<FocusSettings api={api}/>);await waitFor(()=>expect((screen.getByRole('button',{name:'Включить'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Включить'}));await waitFor(()=>expect(localStorage.getItem('nexus.focus.mode.v1')).toBe('on'));cleanup();render(<FocusPage api={api}/>);fireEvent.click(screen.getByRole('button',{name:'Выключить режим фокуса'}));expect(localStorage.getItem('nexus.focus.mode.v1')).toBe('off');});

it('exports to the main app only after clicking the settings action',async()=>{const {s,api}=fixture();saveFocusTurn(s,{id:crypto.randomUUID(),day:localDay(),text:'Вес',reply:'Записано',actions:[{kind:'weight',day:localDay(),kg:84}],replace:false,expectedUpdatedAt:null});render(<FocusSettings api={api}/>);expect(s.tables.weight_entries).toHaveLength(0);expect(api.publish).not.toHaveBeenCalled();await waitFor(()=>expect((screen.getByRole('button',{name:'Передать данные в NEXUS'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Передать данные в NEXUS'}));await screen.findByText('Данные переданы.');expect(s.tables.weight_entries[0].weight_kg).toBe(84);});

it('removes a food entry from the statistics list after explicit confirmation',async()=>{const {s,api}=fixture();const actions=mentorReplySchema.parse({reply:'Записано',actions:[{kind:'food',id:null,day:localDay(),name:'Клубника',grams:100,kcal:32,low:null,high:null,estimated:true,quality:'mixed',note:''}]}).actions;saveFocusTurn(s,{id:crypto.randomUUID(),day:localDay(),text:'Съел клубнику',reply:'Записано',actions,replace:false,expectedUpdatedAt:null});vi.spyOn(confirmations,'askConfirm').mockResolvedValue(true);render(<FocusPage api={api}/>);await screen.findByText('Съел клубнику');fireEvent.click(screen.getByRole('button',{name:'Питание'}));fireEvent.click(await screen.findByRole('button',{name:'Удалить Клубника'}));await waitFor(()=>expect(s.tables.food_entries).toHaveLength(0));expect(api.removeFood).toHaveBeenCalledOnce();expect(confirmations.askConfirm).toHaveBeenCalledWith('Удалить «Клубника» из питания?');expect(s.tables.weight_entries).toHaveLength(0);});

it('autosaves focus preferences on blur and restores them after remount without a save click',async()=>{
 const {s,api}=fixture();const page=render(<FocusSettings api={api}/>);await waitFor(()=>expect((screen.getByLabelText('Модель OpenRouter') as HTMLInputElement).disabled).toBe(false));
 fireEvent.change(screen.getByLabelText('Модель OpenRouter'),{target:{value:'synthetic/custom'}});fireEvent.change(screen.getByLabelText('Питание и предпочтения'),{target:{value:'Без помидоров. Текст должен сохраниться.'}});fireEvent.change(screen.getByLabelText('Зал, раз в неделю'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('Накопить, ₽'),{target:{value:'25000'}});fireEvent.blur(screen.getByLabelText('Питание и предпочтения'));
 await waitFor(()=>expect(focusConfig(s)).toMatchObject({model:'synthetic/custom',dietNote:'Без помидоров. Текст должен сохраниться.',gymPerWeek:3,targetCents:2500000}));page.unmount();render(<FocusSettings api={api}/>);await waitFor(()=>expect((screen.getByLabelText('Питание и предпочтения') as HTMLTextAreaElement).value).toBe('Без помидоров. Текст должен сохраниться.'));expect((screen.getByLabelText('Модель OpenRouter') as HTMLInputElement).value).toBe('synthetic/custom');
});
it('refreshes synced settings while keeping an active local field and saves only that field',async()=>{
 const {s,api}=fixture();configureFocus(s,{...focusConfig(s),model:'synthetic/old',dietNote:'Старый текст'});const page=render(<FocusSettings api={api} revision={1}/>);await waitFor(()=>expect((screen.getByLabelText('Модель OpenRouter') as HTMLInputElement).value).toBe('synthetic/old'));
 fireEvent.change(screen.getByLabelText('Питание и предпочтения'),{target:{value:'Моя незаконченная правка'}});updateFocusConfig(s,{model:'synthetic/from-pc',targetCents:4000000});page.rerender(<FocusSettings api={api} revision={2}/>);await waitFor(()=>expect((screen.getByLabelText('Модель OpenRouter') as HTMLInputElement).value).toBe('synthetic/from-pc'));expect((screen.getByLabelText('Питание и предпочтения') as HTMLTextAreaElement).value).toBe('Моя незаконченная правка');fireEvent.blur(screen.getByLabelText('Питание и предпочтения'));await waitFor(()=>expect(focusConfig(s).dietNote).toBe('Моя незаконченная правка'));expect(focusConfig(s).model).toBe('synthetic/from-pc');expect(api.updateConfig).toHaveBeenCalledWith({dietNote:'Моя незаконченная правка'});
});
it('flushes a pending setting when leaving the page before the debounce',async()=>{
 const {s,api}=fixture();const page=render(<FocusSettings api={api}/>);await waitFor(()=>expect((screen.getByLabelText('Питание и предпочтения') as HTMLTextAreaElement).disabled).toBe(false));fireEvent.change(screen.getByLabelText('Питание и предпочтения'),{target:{value:'Сохранить при выходе'}});page.unmount();await waitFor(()=>expect(focusConfig(s).dietNote).toBe('Сохранить при выходе'));
});
