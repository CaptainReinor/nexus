import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SleepInput} from '../../../NEXUS-Android/src/sleep-input';
afterEach(cleanup);
it('saves both manual sleep times on submit without requiring blur',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);render(<SleepInput day="2026-10-06" start="" end="" onSave={save}/>);
 fireEvent.change(screen.getByLabelText('Лёг спать'),{target:{value:'2330'}});fireEvent.change(screen.getByLabelText('Проснулся'),{target:{value:'0730'}});
 fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));await waitFor(()=>expect(save).toHaveBeenCalledWith('23:30','07:30'));
});
it('keeps invalid edits local and shows failed saves for retry',async()=>{
 const save=vi.fn().mockRejectedValue(new Error('offline'));render(<SleepInput day="2026-10-06" start="23:30" end="07:30" onSave={save}/>);
 fireEvent.change(screen.getByLabelText('Проснулся'),{target:{value:'25:00'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Проснулся'),{target:{value:'08:00'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));await screen.findByText('Не удалось сохранить сон.');expect(screen.getByLabelText('Проснулся')).toHaveProperty('value','08:00');
});
