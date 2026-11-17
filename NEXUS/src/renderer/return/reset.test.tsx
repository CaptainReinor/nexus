import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {ReturnApp} from './app';
import {returnFixture} from './fixture.test-utils';
import {saveFocusTurn} from '../../shared/focus-mode';
import {localDay} from '../../shared/domain';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(){vi.spyOn(window,'scrollTo').mockImplementation(()=>{});return returnFixture();}
it('keeps the daily checklist configurable, synchronized and empty if all points are removed',async()=>{
 const {props,snapshot}=setup();render(<ReturnApp {...props}/>);
 expect(screen.queryByText('Короткая запись дня')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Настроить На сегодня'}));
 const modal=screen.getByRole('dialog',{name:'На сегодня'});fireEvent.click(within(modal).getByLabelText('Отметить вес'));fireEvent.click(within(modal).getByLabelText('Записать сон'));fireEvent.click(within(modal).getByRole('button',{name:'Сохранить'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(JSON.parse(String(snapshot.tables.settings.find(r=>r.key==='returnPreferences')?.value)).dailyChecklist).toEqual([]);
 expect(screen.queryByRole('progressbar',{name:'Записи за сегодня'})).toBeNull();expect(screen.queryByText('Всё записано')).toBeNull();
});
it('requires explicit reset confirmation, keeps old history and opens a fresh diary after deletion',async()=>{
 const {props,api,snapshot}=setup();saveFocusTurn(snapshot,{id:crypto.randomUUID(),day:localDay(),text:'Вчерашняя личная запись',reply:'',actions:[{kind:'weight',day:localDay(),kg:84}],replace:false,expectedUpdatedAt:null});
 const reset=vi.spyOn(api,'resetRecords');render(<ReturnApp {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Настройки'}));
 fireEvent.click(await screen.findByRole('button',{name:'Сбросить записи'}));expect(reset).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(reset).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Сбросить записи'}));fireEvent.click(screen.getByRole('button',{name:'Удалить записи'}));
 await screen.findByRole('heading',{name:'Сегодня'});expect(snapshot.tables.mentor_turns).toHaveLength(0);expect(reset).toHaveBeenCalledOnce();expect(snapshot.tables.settings.find(r=>r.key==='_nexus_focus_reset')).toBeTruthy();
});
