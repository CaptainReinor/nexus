import { expect,it } from 'vitest';
import { openDatabase } from './database';
import { FinanceRepository } from './finance';
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
