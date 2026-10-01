import { expect,it } from 'vitest';
import { syncStateSchema } from './sync-state';
import { groupNumber,ungroupNumber } from './grouped-number';
import { toCents,toSignedCents } from './domain';

it('loads current mobile journal data and rejects unsupported versions and invalid revisions',()=>{
  const state={revision:3,snapshot:{format:'nexus-backup',version:6,exportedAt:'2026-09-30T10:00:00Z',tables:{day_details:[{day:'2026-09-30',appetite:'high'}]}}};
  expect(syncStateSchema.parse(state)).toEqual(state);
  expect(()=>syncStateSchema.parse({...state,snapshot:{...state.snapshot,version:8}})).toThrow();
  expect(()=>syncStateSchema.parse({...state,revision:0.5})).toThrow();
});
it('groups money and salaries without changing their numeric value',()=>{
  expect(groupNumber('50000')).toBe('50 000');
  expect(groupNumber('1234567,50')).toBe('1 234 567,50');
  expect(groupNumber('−20000.25')).toBe('-20 000.25');
  expect(toCents(groupNumber('50000,50'))).toBe(5000050);
  expect(toSignedCents(groupNumber('-20000.25'))).toBe(-2000025);
  expect(ungroupNumber('50\u00a0000')).toBe('50000');
});
