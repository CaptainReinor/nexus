import { expect,it } from 'vitest';
import { openDatabase,serializeBackup,importBackupText } from './database';
import { FinanceRepository } from './finance';
it('keeps newest additions on top, including backdated entries, through export and import',()=>{
  const db=openDatabase(':memory:'),copy=openDatabase(':memory:');try{
    const finance=new FinanceRepository(db);finance.saveAccount({name:'Дебет',opening_cents:0,active:1});
    const account_id=finance.list().accounts[0].id;
    const input={type:'income' as const,amount_cents:100,account_id,target_account_id:null,category_id:null,note:''};
    finance.saveTransaction({...input,occurred_at:'2026-10-03T12:00:00',note:'first'});
    finance.saveTransaction({...input,occurred_at:'2025-01-01T12:00:00',note:'last'});
    const entries=finance.list().transactions;
    expect(entries.map(x=>x.note)).toEqual(['last','first']);
    expect(entries[0].created_at!>entries[1].created_at!).toBe(true);
    db.prepare('UPDATE finance_transactions SET note=? WHERE id=?').run('edited',entries[1].id);
    expect(finance.list().transactions[0].id).toBe(entries[0].id);
    importBackupText(copy,serializeBackup(db));
    expect(new FinanceRepository(copy).list().transactions.map(x=>x.id)).toEqual(entries.map(x=>x.id));
    const old=JSON.parse(serializeBackup(db));old.version=9;for(const row of old.tables.finance_transactions)delete row.created_at;
    importBackupText(copy,JSON.stringify(old));
    expect(new FinanceRepository(copy).list().transactions.every(x=>x.created_at==='')).toBe(true);
  }finally{db.close();copy.close();}
});
it('removes a category from new expenses without changing existing amounts, labels or balance',()=>{
  const db=openDatabase(':memory:');try{
    const finance=new FinanceRepository(db);finance.saveAccount({name:'Дебет',opening_cents:100000,active:1});finance.saveCategory({name:'Продукты',kind:'expense',active:1});
    const category=finance.list().categories[0],account=finance.list().accounts[0];
    finance.saveTransaction({type:'expense',amount_cents:13500,occurred_at:'2026-10-03T12:00:00',account_id:account.id,target_account_id:null,category_id:category.id,note:''});
    finance.deleteCategory(category.id);const after=finance.list();expect(after.categories[0].active).toBe(0);expect(after.transactions[0].category_name).toBe('Продукты');expect(after.accounts[0].balance_cents).toBe(86500);
    expect(()=>finance.saveTransaction({type:'expense',amount_cents:100,occurred_at:'2026-10-03T12:00:00',account_id:account.id,target_account_id:null,category_id:category.id,note:''})).toThrow('активную категорию');
    finance.saveCategory({...category,active:1});expect(finance.list().categories[0].active).toBe(1);
  }finally{db.close();}
});
