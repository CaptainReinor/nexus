import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {initializeAppearance,setTheme} from './appearance';
import {MetricDelta} from './metric-delta';

afterEach(()=>{cleanup();setTheme('standard');});
it('announces the goal assessment separately from the direction of change',()=>{
  initializeAppearance('windows');setTheme('dominion');
  render(<MetricDelta kind="weight" current={{id:2,day:'2026-10-04',value:78.6}} previous={{id:1,day:'2026-10-02',value:78.2}} goal={80}/>);
  const indicator=screen.getByLabelText(/Вес:.*Рост.*Благоприятное изменение/);
  expect(indicator.getAttribute('aria-label')).toContain('2 октября');
  cleanup();
  render(<MetricDelta kind="weight" current={{id:2,day:'2026-10-04',value:77.6}} previous={{id:1,day:'2026-10-02',value:78.2}} goal={78}/>);
  expect(screen.getByLabelText(/Вес:.*Снижение.*Неблагоприятное изменение/)).toBeTruthy();
});
