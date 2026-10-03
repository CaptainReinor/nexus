import { nextTransactionCreatedAt } from '../shared/finance-order';
import type { DB } from './database';
import type { Account, Budget, Category, FinanceData, Transaction } from '../shared/models';
import { localDay, monthOf, weekStart } from '../shared/domain';

export class FinanceRepository {
  constructor(private db: DB,private firstDay:()=>0|1=()=>1) {}
  periodSummary(start:string,end:string):{expense:number;income:number;categories:{name:string;amount_cents:number}[]} {
    const totals=this.db.prepare("SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS expense,COALESCE(SUM(CASE WHEN type='income' THEN amount_cents END),0) AS income FROM finance_transactions WHERE substr(occurred_at,1,10) BETWEEN ? AND ?").get(start,end) as {expense:number;income:number};
    const categories=this.db.prepare("SELECT COALESCE(c.name,'Без категории') AS name,SUM(t.amount_cents) AS amount_cents FROM finance_transactions t LEFT JOIN finance_categories c ON c.id=t.category_id WHERE t.type='expense' AND substr(t.occurred_at,1,10) BETWEEN ? AND ? GROUP BY c.id ORDER BY amount_cents DESC LIMIT 5").all(start,end) as {name:string;amount_cents:number}[];
    return {...totals,categories};
  }
  list(): FinanceData {
    const today=localDay(), month=monthOf(today), week=weekStart(new Date(),this.firstDay());
    const accounts = this.db.prepare(`SELECT a.*, a.opening_cents + COALESCE(SUM(CASE WHEN t.type='income' AND t.account_id=a.id THEN t.amount_cents WHEN t.type IN ('expense','transfer') AND t.account_id=a.id THEN -t.amount_cents WHEN t.type='transfer' AND t.target_account_id=a.id THEN t.amount_cents ELSE 0 END),0) AS balance_cents FROM finance_accounts a LEFT JOIN finance_transactions t ON t.account_id=a.id OR t.target_account_id=a.id GROUP BY a.id ORDER BY a.active DESC,a.id`).all() as Account[];
    const startDate=new Date();startDate.setHours(12,0,0,0);startDate.setDate(startDate.getDate()-89);
    const start=localDay(startDate);
    const previous=this.db.prepare(`SELECT COALESCE(SUM(CASE type WHEN 'income' THEN amount_cents WHEN 'expense' THEN -amount_cents ELSE 0 END),0) AS delta FROM finance_transactions WHERE substr(occurred_at,1,10) < ?`).get(start) as {delta:number};
    const changes=this.db.prepare(`SELECT substr(occurred_at,1,10) AS day,SUM(CASE type WHEN 'income' THEN amount_cents WHEN 'expense' THEN -amount_cents ELSE 0 END) AS delta FROM finance_transactions WHERE substr(occurred_at,1,10) BETWEEN ? AND ? GROUP BY substr(occurred_at,1,10)`).all(start,today) as {day:string;delta:number}[];
    const expenses=this.db.prepare("SELECT substr(occurred_at,1,10) AS day,SUM(amount_cents) AS amount FROM finance_transactions WHERE type='expense' AND substr(occurred_at,1,10) BETWEEN ? AND ? GROUP BY substr(occurred_at,1,10)").all(start,today) as {day:string;amount:number}[];
    const expensesByDay=new Map(expenses.map(x=>[x.day,x.amount]));
    const byDay=new Map(changes.map(item=>[item.day,item.delta]));
    let balance=accounts.reduce((sum,account)=>sum+account.opening_cents,0)+previous.delta;
    const balance_history:FinanceData['balance_history']=[];
    for(let i=0;i<90;i++){const day=localDay(startDate);balance+=byDay.get(day)??0;balance_history.push({day,balance_cents:balance});startDate.setDate(startDate.getDate()+1);}
    const totals = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='expense' AND substr(occurred_at,1,10)=@today THEN amount_cents END),0) AS today_expense, COALESCE(SUM(CASE WHEN type='expense' AND substr(occurred_at,1,10)>=@week THEN amount_cents END),0) AS week_expense, COALESCE(SUM(CASE WHEN type='expense' AND substr(occurred_at,1,7)=@month THEN amount_cents END),0) AS month_expense, COALESCE(SUM(CASE WHEN type='income' AND substr(occurred_at,1,7)=@month THEN amount_cents END),0) AS month_income FROM finance_transactions`).get({today,week,month}) as Pick<FinanceData,'today_expense'|'week_expense'|'month_expense'|'month_income'>;
    return {
      accounts,
      categories: this.db.prepare('SELECT * FROM finance_categories ORDER BY kind,name').all() as Category[],
      transactions: this.db.prepare(`SELECT t.*,a.name AS account_name,c.name AS category_name,ta.name AS target_name FROM finance_transactions t JOIN finance_accounts a ON a.id=t.account_id LEFT JOIN finance_accounts ta ON ta.id=t.target_account_id LEFT JOIN finance_categories c ON c.id=t.category_id ORDER BY (t.created_at!='') DESC,t.created_at DESC,t.occurred_at DESC,t.id DESC LIMIT 500`).all() as Transaction[],
      budget: (this.db.prepare('SELECT * FROM finance_budgets WHERE month=?').get(month) as Budget)??null,
      category_totals: this.db.prepare(`SELECT COALESCE(c.name,'Без категории') AS name,SUM(t.amount_cents) AS amount_cents FROM finance_transactions t LEFT JOIN finance_categories c ON c.id=t.category_id WHERE t.type='expense' AND substr(t.occurred_at,1,7)=? GROUP BY c.id ORDER BY amount_cents DESC`).all(month) as FinanceData['category_totals'],
      expense_history:balance_history.map(x=>({day:x.day,amount_cents:expensesByDay.get(x.day)??0})),
      balance_history:accounts.length?balance_history:[],
      ...totals
    };
  }
  saveAccount(input: {id?:number;name:string;opening_cents:number;active:number}): void {
    if (input.id) this.db.prepare('UPDATE finance_accounts SET name=?,opening_cents=?,active=? WHERE id=?').run(input.name,input.opening_cents,input.active,input.id);
    else this.db.prepare('INSERT INTO finance_accounts(id,name,opening_cents,active) VALUES (nexus_id(),?,?,?)').run(input.name,input.opening_cents,input.active);
  }
  saveCategory(input: {id?:number;name:string;kind:'expense'|'income';active:number}): void {
    if (input.id) this.db.prepare('UPDATE finance_categories SET name=?,kind=?,active=? WHERE id=?').run(input.name,input.kind,input.active,input.id);
    else this.db.prepare('INSERT INTO finance_categories(id,name,kind,active) VALUES (nexus_id(),?,?,?)').run(input.name,input.kind,input.active);
  }
  saveTransaction(input: Omit<Transaction,'id'|'created_at'|'account_name'|'category_name'|'target_name'>): void {
    if (input.type==='transfer' && (!input.target_account_id || input.target_account_id===input.account_id)) throw new Error('Выберите другой счёт для перевода.');
    if (input.type==='expense' && !input.category_id) throw new Error('Выберите категорию.');
    if(input.type==='expense'&&!this.db.prepare("SELECT id FROM finance_categories WHERE id=? AND kind='expense' AND active=1").get(input.category_id))throw new Error('Выберите активную категорию расхода.');
    const createdAt=nextTransactionCreatedAt(this.db.prepare("SELECT MAX(created_at) AS created_at FROM finance_transactions").all() as {created_at:string}[]);
    this.db.prepare('INSERT INTO finance_transactions(id,created_at,occurred_at,amount_cents,type,account_id,target_account_id,category_id,note) VALUES (nexus_id(),?,?,?,?,?,?,?,?)').run(createdAt,input.occurred_at,input.amount_cents,input.type,input.account_id,input.type==='transfer'?input.target_account_id:null,input.type==='expense'?input.category_id:null,input.note);
  }
  deleteTransaction(id:number):void {
    const result=this.db.prepare('DELETE FROM finance_transactions WHERE id=?').run(id);
    if(result.changes!==1)throw new Error('Операция уже удалена или не найдена.');
  }
  deleteCategory(id:number):void {
    // Retain the name and references in old operations and synchronized snapshots.
    const result=this.db.prepare('UPDATE finance_categories SET active=0 WHERE id=?').run(id);
    if(result.changes!==1)throw new Error('Категория не найдена.');
  }
  setBudget(input: Budget): void { this.db.prepare('INSERT INTO finance_budgets(month,amount_cents) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET amount_cents=excluded.amount_cents').run(input.month,input.amount_cents); }
}
