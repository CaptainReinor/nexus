import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import {returnFixture} from './return/fixture.test-utils';

vi.mock('./connection-gate',()=>({ConnectionGate:()=>null}));

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('keeps the unified desktop app visible when scrolling returns a promise',async()=>{
  const {props}=returnFixture();
  vi.stubGlobal('nexus',{focus:props.api,social:props.social,daily:props.daily,reminders:props.reminders,life:{task:props.tasks!.save,remove:vi.fn()},health:{saveHabit:vi.fn()},quick:{consume:async()=>null,watch:()=>()=>{},status:async()=>({shortcut:'',available:false})}});
  vi.spyOn(window,'scrollTo').mockImplementation((()=>Promise.resolve()) as typeof window.scrollTo);
  render(<App/>);await screen.findByLabelText('Вес, кг');
  fireEvent.click(screen.getByRole('button',{name:'Прогресс'}));
  await screen.findByRole('heading',{name:'Прогресс'});
  fireEvent.click(screen.getByRole('navigation',{name:'Разделы'}).querySelector('button')!);
  expect(await screen.findByRole('heading',{name:'Сегодня'})).toBeTruthy();
});
