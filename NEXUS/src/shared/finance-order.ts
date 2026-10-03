type Operation = { id?: unknown; created_at?: unknown; occurred_at?: unknown };

/** New records retain their insertion time across devices; legacy rows have no such history. */
export function compareTransactionCreation(a:Operation,b:Operation):number {
  const left=typeof a.created_at==='string'?a.created_at:'',right=typeof b.created_at==='string'?b.created_at:'';
  return Number(Boolean(right))-Number(Boolean(left))||right.localeCompare(left)||String(b.occurred_at??'').localeCompare(String(a.occurred_at??''))||Number(b.id)-Number(a.id);
}

export function nextTransactionCreatedAt(operations:readonly Operation[],now=Date.now()):string {
  const latest=operations.reduce((max,row)=>{const time=typeof row.created_at==='string'?Date.parse(row.created_at):NaN;return Number.isFinite(time)?Math.max(max,time):max;},0);
  return new Date(Math.max(now,latest+1)).toISOString();
}

export function ensureFinanceOrder(snapshot:{version:number;tables:Record<string,Record<string,unknown>[]>}):void {
  snapshot.version=Math.max(snapshot.version,10);
  for(const row of snapshot.tables.finance_transactions??[])row.created_at??='';
}
