import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {RemindersPanel} from './components/reminders-ui';
import {defaultReminders,type ReminderAPI} from '../shared/reminders';
afterEach(cleanup);
it('shows Android permission/channel state and reports a failed test notification',async()=>{
 const api:ReminderAPI={get:async()=>({settings:defaultReminders,enabled:false,exact:false,batteryLimited:true}),save:async()=>{},permission:async()=>({enabled:false}),precision:async()=>{},test:vi.fn().mockRejectedValue(new Error('Разреши уведомления NEXUS в настройках Android.')),systemSettings:vi.fn().mockResolvedValue(undefined)};
 render(<RemindersPanel api={api}/>);await screen.findByText('Уведомления отключены в системе.');await screen.findByText('Экономия батареи может задерживать уведомления.');
 fireEvent.click(screen.getByRole('button',{name:'Проверить уведомление'}));await screen.findByText('Разреши уведомления NEXUS в настройках Android.');
 fireEvent.click(screen.getByRole('button',{name:'Настройки Android'}));expect(api.systemSettings).toHaveBeenCalledWith('notifications');
});
