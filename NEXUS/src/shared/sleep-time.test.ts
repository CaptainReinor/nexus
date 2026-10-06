import {it,expect} from 'vitest';
import {normalizeSleepTime} from './sleep-time';
it('accepts manual clock input and rejects impossible times without discarding existing sleep',()=>{
  expect(normalizeSleepTime('2330')).toBe('23:30');expect(normalizeSleepTime('8:05')).toBe('08:05');
  expect(normalizeSleepTime('08.05')).toBe('08:05');expect(normalizeSleepTime('')).toBeNull();
  for(const value of ['24:00','08:60','8','abcd'])expect(normalizeSleepTime(value)).toBeUndefined();
});
