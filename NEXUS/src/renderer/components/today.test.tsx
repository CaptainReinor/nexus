import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { TodayHabits,TodayTasks,type TodayHabit } from './today';
import type { DayLifeData } from '../../shared/life';

afterEach(cleanup);
const habit:TodayHabit={id:1,name:'Фастфуд',kind:'avoid',format:'avoidance',period:'daily',target:0,value:null,status:null};
it('records an avoided habit as success only when it did not happen',async()=>{
  const save=vi.fn(async()=>{});
  render(<TodayHabits habits={[habit]} onMark={save} onManage={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Было: Фастфуд'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(habit,1,'missed'));
  fireEvent.click(screen.getByRole('button',{name:'Не было: Фастфуд'}));
  await waitFor(()=>expect(save.mock.lastCall?.slice(1)).toEqual([0,'done']));
});
it('retains the attempted mark after a storage error and allows retry',async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error('Нет места')).mockResolvedValueOnce(undefined);
  render(<TodayHabits habits={[habit]} onMark={save} onManage={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Было: Фастфуд'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Нет места'));
  expect(screen.getByRole('button',{name:'Было: Фастфуд'}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'Повторить'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.lastCall?.slice(1)).toEqual([1,'missed']);
});
it('saves the last quantity typed rather than sending every intermediate digit',async()=>{
  const save=vi.fn(async()=>{});
  render(<TodayHabits habits={[{...habit,name:'Чтение',kind:'positive',format:'duration',target:30}]} onMark={save} onManage={()=>{}}/>);
  fireEvent.change(screen.getByRole('spinbutton',{name:'Значение Чтение'}),{target:{value:'3'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'Значение Чтение'}),{target:{value:'35'}});
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.lastCall?.slice(1)).toEqual([35,'done']);
});
it('shows due and overdue tasks and sends only editable fields when completing one',async()=>{
  const task={id:'today',title:'Позвонить',day:'2026-10-01',due_day:'2026-10-01',status:'open' as const,created_at:'2026-10-01T08:00:00',updated_at:'2026-10-01T08:00:00'};
  const data:DayLifeData={details:[],memories:[],reviews:[],markers:[],tasks:[task,{...task,id:'future',title:'Завтра',due_day:'2026-10-02'},{...task,id:'overdue',title:'Вчера',due_day:'2026-09-30'}]};
  const save=vi.fn(async()=>{});
  render(<TodayTasks data={data} day="2026-10-01" onTask={save} onMore={()=>{}}/>);
  expect(screen.queryByText('Завтра')).toBeNull();
  expect(screen.getByText('Вчера')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Выполнить: Позвонить'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith({id:'today',title:'Позвонить',day:'2026-10-01',due_day:'2026-10-01',status:'done'}));
});
