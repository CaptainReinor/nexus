import {expect,it} from 'vitest';
import {compareTransactionCreation,ensureFinanceOrder,nextTransactionCreatedAt} from './finance-order';
import {mergeSnapshots,type Snapshot} from './snapshot-sync';

it('uses insertion time across devices instead of operation dates or random IDs',()=>{
  const base:Snapshot={format:'nexus-backup',version:9,exportedAt:'',tables:{settings:[],finance_transactions:[{id:900,occurred_at:'2099-01-01'}]}};
  const left=structuredClone(base),right=structuredClone(base);ensureFinanceOrder(left);ensureFinanceOrder(right);
  left.tables.finance_transactions.push({id:800,occurred_at:'2026-10-03',created_at:nextTransactionCreatedAt([],1000)});
  right.tables.finance_transactions.push({id:1,occurred_at:'2025-01-01',created_at:nextTransactionCreatedAt([],2000)});
  const merged=mergeSnapshots(base,left,right).snapshot;
  expect(merged.tables.finance_transactions.sort(compareTransactionCreation).map(x=>x.id)).toEqual([1,800,900]);
  expect(merged.version).toBe(10);
});

it('orders a batch of operations in insertion order even within the same millisecond',()=>{
  const rows=[{created_at:nextTransactionCreatedAt([],1000)}];
  expect(nextTransactionCreatedAt(rows,1000)).toBe('1970-01-01T00:00:01.001Z');
  expect(nextTransactionCreatedAt(rows,500)).toBe('1970-01-01T00:00:01.001Z');
});
