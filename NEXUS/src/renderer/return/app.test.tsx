import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ReturnApp} from './app';
import {useCapture} from './capture';
import {returnFixture} from './fixture.test-utils';
import {flushPendingEdits} from '../autosave';
import {localDay} from '../../shared/domain';

beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{value:vi.fn(),configurable:true});});
afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState(null,'','/');});
it('saves a quick weight locally, without paying for an AI call, and updates the checklist',async()=>{
 const {api,props}=returnFixture();render(<ReturnApp {...props}/>);
 fireEvent.change(await screen.findByLabelText('Вес, кг'),{target:{value:'82,1'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await screen.findByRole('status');expect(api.send).not.toHaveBeenCalled();expect(api.save).toHaveBeenCalledOnce();
 await waitFor(()=>expect(screen.getByText('1 из 2')).toBeTruthy());
 expect(screen.getAllByRole('button',{name:/День|Прогресс|Друзья/}).length).toBe(3);
});
it('accepts typed sleep times on a phone and saves the correct overnight duration',async()=>{
 const {api,props,snapshot}=returnFixture();render(<ReturnApp {...props} mobile/>);
 fireEvent.click(screen.getByRole('button',{name:'Сон'}));fireEvent.click(screen.getByText('Время сна'));
 fireEvent.change(screen.getByLabelText('Лёг'),{target:{value:'23:30'}});fireEvent.change(screen.getByLabelText('Проснулся'),{target:{value:'07:15'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await screen.findByRole('status');expect(api.send).not.toHaveBeenCalled();
 expect(snapshot.tables.focus_sleep?.[0].sleep_minutes).toBe(465);
});
it('moves a task with a normal date editor instead of a native prompt',async()=>{
 const {props,snapshot}=returnFixture();const day=localDay();snapshot.tables.day_tasks.push({id:crypto.randomUUID(),day,due_day:day,title:'Зал',status:'open',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 render(<ReturnApp {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Перенести Зал'}));
 fireEvent.change(screen.getByLabelText('Дата'),{target:{value:'2026-12-10'}});fireEvent.click(screen.getByRole('button',{name:'Перенести'}));
 await waitFor(()=>expect(snapshot.tables.day_tasks[0].due_day).toBe('2026-12-10'));
});
it('keeps the screen and close guard locked while a paid request or save is in flight',async()=>{
 const {api,props}=returnFixture();let finish!:(value:Awaited<ReturnType<typeof api.send>>)=>void;
 api.send=vi.fn(()=>new Promise<Awaited<ReturnType<typeof api.send>>>(resolve=>{finish=resolve;}));render(<ReturnApp {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Текст'}));fireEvent.change(screen.getByLabelText('Твоя запись'),{target:{value:'Вес 82,1'}});fireEvent.keyDown(screen.getByLabelText('Твоя запись'),{key:'Enter'});
 await waitFor(()=>expect(api.send).toHaveBeenCalledOnce());expect(await flushPendingEdits()).toBe(false);
 expect((screen.getByRole('button',{name:'Прогресс'}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{finish({reply:'Записал.',actions:[]});});await screen.findByRole('status');expect(await flushPendingEdits()).toBe(true);
});
it('retries a failed local save using the same response and record id without a second AI request',async()=>{
 const {api,props}=returnFixture();const save=api.save;api.save=vi.fn().mockRejectedValueOnce(Error('Запись пока не сохранена')).mockImplementation(save);
 render(<ReturnApp {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Текст'}));const input=screen.getByLabelText('Твоя запись');fireEvent.change(input,{target:{value:'Вес 82,1'}});fireEvent.keyDown(input,{key:'Enter'});
 await screen.findByText('Запись пока не сохранена');fireEvent.keyDown(input,{key:'Enter'});await screen.findByRole('status');
 expect(api.send).toHaveBeenCalledOnce();const calls=vi.mocked(api.save).mock.calls;expect(calls).toHaveLength(2);expect(calls[0][0].id).toBe(calls[1][0].id);
});
it('keeps a successful transcription for retry if only the following mentor request failed',async()=>{
 const {api}=returnFixture();api.send=vi.fn().mockRejectedValueOnce(Error('Нет связи с наставником')).mockResolvedValue({reply:'Записал.',actions:[]});let capture!:ReturnType<typeof useCapture>;
 function Harness(){capture=useCapture(api,localDay(),vi.fn());return <p>{capture.error||capture.message}</p>;}
 render(<Harness/>);await act(async()=>{await capture.upload(new Blob(['voice']),'webm');});expect(screen.getByText('Нет связи с наставником')).toBeTruthy();
 await act(async()=>{await capture.retry();});expect(api.transcribe).toHaveBeenCalledOnce();expect(api.send).toHaveBeenCalledTimes(2);expect(api.save).toHaveBeenCalledOnce();
});
it('opens quick entry from an initial widget action without starting the microphone automatically',async()=>{
 const {props}=returnFixture();const consume=vi.fn().mockResolvedValue('expense');render(<ReturnApp {...props} mobile quickActions={{consume,watch:()=>()=>{}}}/>);
 await screen.findByRole('heading',{name:'Записать расход'});expect(screen.getByLabelText('Сумма, ₽')).toBeTruthy();expect(screen.getByRole('button',{name:'Начитать'})).toBeTruthy();
});
it('shows detailed progress without the old focus controls or mentor chat',async()=>{
 const {props}=returnFixture();render(<ReturnApp {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Прогресс'}));
 await screen.findByRole('heading',{name:'Прогресс'});expect(screen.queryByRole('button',{name:'Выключить режим фокуса'})).toBeNull();expect(screen.queryByLabelText('Сообщение наставнику')).toBeNull();
});
