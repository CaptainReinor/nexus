import {expect,it} from 'vitest';
import type {Snapshot} from './snapshot-sync';
import {focusConfig,focusFacts,saveFocusTurn,type FocusAction} from './focus-mode';
import {publishFocus} from './focus-isolation';
import {focusStats} from './focus-stats';
import {localDay} from './domain';
const day=localDay(),snapshot=():Snapshot=>({format:'nexus-backup',version:14,exportedAt:'',tables:{settings:[],finance_accounts:[],finance_categories:[],finance_transactions:[],weight_entries:[],health_daily_entries:[],workouts:[]}});
const action=(direction:'in'|'out',amountCents:number):Extract<FocusAction,{kind:'saving'}>=>({kind:'saving',id:null,day,direction,amountCents,note:''});
const turn=(actions:FocusAction[])=>({id:crypto.randomUUID(),day,text:'Накопления',reply:'',actions,replace:false,expectedUpdatedAt:null});
it('tracks actual savings independently of income and expenses, preserving manual export isolation',()=>{
 const s=snapshot(),input=turn([action('in',100000)]);saveFocusTurn(s,input);saveFocusTurn(s,input);saveFocusTurn(s,turn([action('out',20000),{kind:'income',id:null,day,amountCents:900000,accountId:1,categoryId:null,note:'Доход'}]));
 const stats=focusStats(s);expect(stats.saved).toBe(80000);expect(stats.goalNet).toBe(80000);expect(stats.income).toBe(900000);expect(stats.expense).toBe(0);expect(stats.money).toHaveLength(1);expect(stats.savings).toHaveLength(2);expect(stats.charts.savings).toEqual([{day,value:80000}]);expect(s.tables.finance_transactions).toEqual([]);expect(s.tables.finance_accounts).toEqual([]);expect(focusFacts(s,day,'Сколько накопил?').savings.balanceCents).toBe(80000);
 publishFocus(s);publishFocus(s);expect(s.tables.finance_transactions).toHaveLength(3);const savings=s.tables.finance_accounts.find(r=>r.name==='Накопления')!,debit=s.tables.finance_accounts.find(r=>r.name==='Дебет')!;expect(s.tables.finance_transactions.filter(r=>r.type==='transfer')).toMatchObject([{account_id:debit.id,target_account_id:savings.id,category_id:null},{account_id:savings.id,target_account_id:debit.id,category_id:null}]);
});
it('rejects excessive withdrawal and corrections that invalidate subsequent withdrawals atomically',()=>{
 const s=snapshot();saveFocusTurn(s,turn([action('in',100000)]));saveFocusTurn(s,turn([action('out',90000)]));const before=structuredClone(s);
 expect(()=>saveFocusTurn(s,turn([action('out',20000)]))).toThrow();expect(s).toEqual(before);
 const first=s.tables.focus_money[0];expect(()=>saveFocusTurn(s,turn([{...action('in',50000),id:Number(first.id)}]))).toThrow();expect(s).toEqual(before);
});
it('keeps correction identities and distinguishes transfers from regular transactions',()=>{
 const s=snapshot(),input=turn([action('in',100000)]);saveFocusTurn(s,input);const old=s.tables.mentor_turns[0],id=s.tables.focus_money[0].id;
 saveFocusTurn(s,{...input,replace:true,expectedUpdatedAt:String(old.updated_at),actions:[action('in',120000)]});expect(s.tables.focus_money).toHaveLength(1);expect(s.tables.focus_money[0]).toMatchObject({id,amount_cents:120000});
 expect(()=>saveFocusTurn(s,turn([{kind:'expense',id:Number(id),day,amountCents:1000,accountId:1,categoryId:1,note:''}]))).toThrow('другой тип');expect(focusConfig(s).targetCents).toBeNull();expect(focusStats(s).saved).toBe(120000);
});
