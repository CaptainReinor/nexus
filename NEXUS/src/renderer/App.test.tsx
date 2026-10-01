import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('./connection-gate',()=>({ConnectionGate:()=>null}));

vi.mock('./registry',()=>({moduleRegistry:[
  {id:'today',path:'/',label:'Сегодня',glyph:'◈',component:()=> <div>Главная страница</div>},
  {id:'health',path:'/health',label:'Здоровье',glyph:'✚',component:()=> <div>Страница здоровья</div>}
]}));

afterEach(()=>{cleanup();vi.restoreAllMocks();window.location.hash='';});

it('keeps the app visible when navigating and scrollTo returns a promise',()=>{
  window.location.hash='';
  vi.spyOn(window,'scrollTo').mockImplementation((()=>Promise.resolve()) as typeof window.scrollTo);
  render(<HashRouter><App/></HashRouter>);
  expect(screen.getByText('Главная страница')).toBeTruthy();
  fireEvent.click(screen.getByRole('link',{name:/Здоровье/}));
  expect(screen.getByText('Страница здоровья')).toBeTruthy();
  fireEvent.click(screen.getByRole('link',{name:/Сегодня/}));
  expect(screen.getByText('Главная страница')).toBeTruthy();
});
