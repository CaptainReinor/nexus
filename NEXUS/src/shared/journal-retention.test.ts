import {expect,it} from 'vitest';
import {journalRetentionCutoff,retainedJournalInputs} from './journal-retention';
import {mergeSnapshots} from './snapshot-sync';
import type {Snapshot} from './snapshot-sync';

it('keeps more than three recent texts, expires only older inputs and does not mutate source rows',()=>{
  const now=Date.parse('2026-10-06T12:00:00Z'),cutoff=journalRetentionCutoff(now);
  const entries=Array.from({length:6},(_,id)=>({id,day:'2020-01-01',created_at:`2026-10-0${id+1}T12:00:00Z`,raw_text:`Текст ${id}`}));
  entries.push({id:10,day:'2026-10-06',created_at:'2026-09-06T11:59:59.999Z',raw_text:'Просрочен'},{id:11,day:'2026-09-06',created_at:cutoff,raw_text:'На границе'});
  const retained=retainedJournalInputs(entries,now);
  expect(retained).toHaveLength(7);expect(retained.map(row=>row.id)).not.toContain(10);
  expect(retained.map(row=>row.id)).toContain(11);expect(entries).toHaveLength(8);
  expect(entries[0].id).toBe(0);
});

it('preserves the full retained journal when merging devices and leaves applied operations untouched',()=>{
  const recent=new Date().toISOString();
  const empty:Snapshot={format:'nexus-backup',version:11,exportedAt:'',tables:{daily_journals:[],finance_transactions:[]}};
  const local=structuredClone(empty),remote=structuredClone(empty);
  local.tables.daily_journals=Array.from({length:3},(_,id)=>({id,day:'2026-10-06',created_at:recent,raw_text:`ПК ${id}`}));
  remote.tables.daily_journals=Array.from({length:3},(_,id)=>({id:id+3,day:'2026-10-06',created_at:recent,raw_text:`Телефон ${id}`}));
  remote.tables.finance_transactions=[{id:1,type:'expense',amount_cents:70000}];
  const merged=mergeSnapshots(empty,local,remote).snapshot;
  expect(merged.tables.daily_journals).toHaveLength(6);
  expect(merged.tables.finance_transactions).toHaveLength(1);
});
