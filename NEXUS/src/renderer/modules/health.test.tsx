import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HealthPage } from './health';
import type { NexusAPI } from '../../shared/models';
import { localDay } from '../../shared/domain';
afterEach(()=>{cleanup();vi.useRealTimers();});
it('saves habit marks and daily fields without a save button',async()=>{
  const saveHabitLog=vi.fn().mockResolvedValue(undefined),saveDayField=vi.fn().mockResolvedValue(undefined);
  const day=localDay();
  window.nexus={health:{list:vi.fn().mockResolvedValue({habits:[{id:1,name:'Чтение',description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1,sort_order:0,created_at:''}],logs:[],daily:null,weights:[],workouts:[],history:[]}),saveDayField,saveHabitLog,saveHabit:vi.fn(),moveHabit:vi.fn(),archiveHabit:vi.fn()},settings:{get:vi.fn().mockResolvedValue({firstDayOfWeek:1})}} as unknown as NexusAPI;
  render(<HealthPage/>);
  await screen.findByText('Чтение');
  expect(screen.queryByText('Была тренировка')).toBeNull();
  expect(screen.queryByRole('button',{name:'Сохранить день'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Сделано'}));
  fireEvent.change(screen.getByPlaceholderText('Например, 78.4'),{target:{value:'78.4'}});
  await waitFor(()=>expect(saveHabitLog).toHaveBeenCalledWith(expect.objectContaining({day,habit_id:1,status:'done'})));
  await waitFor(()=>expect(saveDayField).toHaveBeenCalledWith({day,field:'weight',value:78.4}));
});
it('lets the user change the order of active habits',async()=>{
  const moveHabit=vi.fn().mockResolvedValue(undefined);
  const habit=(id:number,name:string,order:number)=>({id,name,description:'',kind:'positive',format:'boolean',target:1,period:'daily',active:1,sort_order:order,created_at:''});
  window.nexus={health:{list:vi.fn().mockResolvedValue({habits:[habit(1,'Чтение',0),habit(2,'Прогулка',1)],logs:[],daily:null,weights:[],workouts:[],history:[]}),saveDay:vi.fn(),saveHabit:vi.fn(),moveHabit,archiveHabit:vi.fn()},settings:{get:vi.fn().mockResolvedValue({firstDayOfWeek:1})}} as unknown as NexusAPI;
  render(<HealthPage/>);
  fireEvent.click(screen.getByRole('button',{name:'Уход и привычки'}));
  fireEvent.click(await screen.findByText('История и порядок'));
  await screen.findByRole('button',{name:'Поднять привычку Прогулка'});
  fireEvent.click(screen.getByRole('button',{name:'Поднять привычку Прогулка'}));
  await waitFor(()=>expect(moveHabit).toHaveBeenCalledWith({id:2,direction:'up'}));
});

it('opens a fresh weekly habit after midnight without carrying Sunday marks into Monday',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,8,27,23,59,50));
  const sunday=localDay();
  const weekly={id:1,name:'Недельная',description:'',kind:'positive',format:'boolean',target:1,period:'weekly',active:1,sort_order:0,created_at:''};
  const data={habits:[weekly],logs:[{id:1,habit_id:1,day:sunday,value:1,status:'done',comment:''}],daily:null,weights:[],workouts:[],history:[]};
  window.nexus={health:{list:vi.fn().mockResolvedValue(data)}} as unknown as NexusAPI;
  await act(async()=>{render(<HealthPage/>);});
  expect(screen.queryByText('Недельная')).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
  expect(screen.getByText('Недельная')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Сделано'}).classList.contains('selected')).toBe(false);
});
