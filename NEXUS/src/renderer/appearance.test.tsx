import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AppearancePanel,appearanceKey,closeTopSurface,configureAppearanceFeedback,initializeAppearance,readTheme,setTheme,useSystemCopy} from './appearance';
import {useState} from 'react';
afterEach(()=>{cleanup();setTheme('standard');localStorage.clear();vi.restoreAllMocks();});
describe('local appearance without remounting',()=>{
 it('applies the last rapid choice and does not repeat feedback for an unchanged choice',()=>{setTheme('standard');const feedback=vi.fn();configureAppearanceFeedback(feedback);setTheme('dominion');setTheme('dominion');setTheme('standard');setTheme('dominion');expect(feedback).toHaveBeenCalledTimes(3);expect(localStorage.getItem(appearanceKey)).toBe('dominion');configureAppearanceFeedback(()=>{});});
 it('closes the top Android surface before leaving the application',()=>{const cancelled=vi.fn();render(<dialog open onCancel={cancelled}><input/></dialog>);expect(closeTopSurface()).toBe(true);expect(cancelled).toHaveBeenCalledOnce();cleanup();expect(closeTopSurface()).toBe(false);});
 it('defaults safely and restores the selected device-only theme',()=>{expect(readTheme({getItem:()=> 'broken'})).toBe('standard');expect(readTheme({getItem:()=>{throw Error('storage');}})).toBe('standard');localStorage.setItem(appearanceKey,'dominion');initializeAppearance('windows');expect(document.documentElement.dataset.theme).toBe('dominion');});
 it('preserves a focused draft and only translates system copy in its context',()=>{
   function Editor(){const copy=useSystemCopy('today'),[value,setValue]=useState('Сегодня — моя пользовательская запись');return <><p>{copy('Главные дела')}</p><input aria-label="Запись" value={value} onChange={e=>setValue(e.target.value)}/><AppearancePanel/></>;}
   render(<Editor/>);const input=screen.getByLabelText('Запись');input.focus();fireEvent.change(input,{target:{value:'Мой черновик'}});fireEvent.click(screen.getByLabelText('Доминион'));expect(screen.getByText('Приоритеты')).toBeTruthy();expect(screen.getByLabelText('Запись')).toBe(input);expect((input as HTMLInputElement).value).toBe('Мой черновик');expect(document.activeElement).toBe(input);fireEvent.click(screen.getByLabelText('Стандартная'));expect(screen.getByText('Главные дела')).toBeTruthy();
 });
 it('keeps the new theme usable when persistence fails and offers a real retry',()=>{render(<AppearancePanel/>);const save=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});fireEvent.click(screen.getByLabelText('Доминион'));expect(document.documentElement.dataset.theme).toBe('dominion');expect(screen.getByRole('alert').textContent).toContain('Выбор не сохранён');save.mockRestore();fireEvent.click(screen.getByRole('button',{name:'Повторить'}));expect(localStorage.getItem(appearanceKey)).toBe('dominion');expect(screen.queryByRole('alert')).toBeNull();});
});
