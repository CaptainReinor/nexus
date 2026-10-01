import type { DB } from './database';
import type { InvestmentData, InvestmentEntry } from '../shared/models';

export class InvestmentRepository {
  constructor(private db:DB){}
  list():InvestmentData{return {
    accounts:this.db.prepare('SELECT * FROM investment_accounts ORDER BY active DESC,id').all() as InvestmentData['accounts'],
    entries:this.db.prepare('SELECT * FROM investment_entries ORDER BY day,id').all() as InvestmentData['entries']
  };}
  saveAccount(input:{id?:number;name:string;active:number}):void{
    if(input.id)this.db.prepare('UPDATE investment_accounts SET name=?,active=? WHERE id=?').run(input.name,input.active,input.id);
    else this.db.prepare('INSERT INTO investment_accounts(id,name,active) VALUES (nexus_id(),?,?)').run(input.name,input.active);
  }
  saveEntry(input:Omit<InvestmentEntry,'id'>):void{
    this.db.prepare(`INSERT INTO investment_entries(id,account_id,day,value_cents,flow_cents,note) VALUES (nexus_id(),@account_id,@day,@value_cents,@flow_cents,@note)
    ON CONFLICT(account_id,day) DO UPDATE SET value_cents=excluded.value_cents,flow_cents=excluded.flow_cents,note=excluded.note`).run(input);
  }
  deleteEntry(id:number):void{this.db.prepare('DELETE FROM investment_entries WHERE id=?').run(id);}
}
