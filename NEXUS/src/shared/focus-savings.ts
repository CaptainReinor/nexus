import type {Row} from './snapshot-sync';

export const savingsAccountId=2;
export function savingsDelta(row:Row):number{
 if(row.type!=='transfer')return 0;
 return (row.target_account_id===savingsAccountId?Number(row.amount_cents):0)-(row.account_id===savingsAccountId?Number(row.amount_cents):0);
}
export function savingsBalance(rows:Row[]):number{return rows.reduce((sum,row)=>sum+savingsDelta(row),0);}
