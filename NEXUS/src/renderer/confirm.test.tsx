import { afterEach,beforeEach,expect,it } from 'vitest';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { ConfirmHost,askConfirm } from './confirm';

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});
afterEach(()=>{cleanup();Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');Reflect.deleteProperty(HTMLDialogElement.prototype,'close');});
it('cancels without executing the action and restores the original text field focus',async()=>{
  render(<><input aria-label="Заметка"/><ConfirmHost/></>);
  const input=screen.getByRole('textbox',{name:'Заметка'});input.focus();
  let answer!:Promise<boolean>;act(()=>{answer=askConfirm('Удалить запись?');});
  fireEvent.click(screen.getByRole('button',{name:'Отмена'}));
  expect(await answer).toBe(false);expect(document.activeElement).toBe(input);
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('queues confirmations so that only the explicitly accepted request can proceed',async()=>{
  render(<ConfirmHost/>);let first!:Promise<boolean>,second!:Promise<boolean>;
  act(()=>{first=askConfirm('Первая операция');second=askConfirm('Вторая операция');});
  expect(screen.getByText('Первая операция')).toBeTruthy();expect(screen.queryByText('Вторая операция')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Продолжить'}));expect(await first).toBe(true);
  expect(screen.getByText('Вторая операция')).toBeTruthy();
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:false,cancelable:true}));expect(await second).toBe(false);
});
