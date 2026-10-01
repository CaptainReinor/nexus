import type { Row, Snapshot } from './snapshot-sync';

export const defaultExpenseCategories=['Продукты','Кафе и рестораны','Транспорт','Жильё и счета','Здоровье','Покупки','Развлечения','Подписки','Прочее'] as const;
export const defaultDebit={id:700_000_000_000,name:'Дебет',opening_cents:0,active:1};
export const defaultCategories=defaultExpenseCategories.map((name,index)=>({id:700_000_000_100+index,name,kind:'expense',active:1}));
export function ensureFinanceDefaults(snapshot:Snapshot):boolean {
  let changed=false;
  const accounts=snapshot.tables.finance_accounts??(snapshot.tables.finance_accounts=[]);
  const categories=snapshot.tables.finance_categories??(snapshot.tables.finance_categories=[]);
  if(!accounts.length){accounts.push({...defaultDebit});changed=true;}
  if(!categories.some(row=>row.kind==='expense')){categories.push(...defaultCategories.map(row=>({...row})));changed=true;}
  return changed;
}
export function isStarterFinanceRow(table:string,row:Row):boolean {
  const defaults=table==='finance_accounts'?[defaultDebit]:table==='finance_categories'?defaultCategories:[];
  return defaults.some(example=>Object.keys(row).length===Object.keys(example).length&&Object.entries(example).every(([key,value])=>row[key]===value));
}
