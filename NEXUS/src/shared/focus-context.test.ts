import {expect,it,vi} from 'vitest';
import {foodContext} from './focus-context';
import {focusFacts,mentorReplySchema,saveFocusTurn} from './focus-mode';
import {initializeFocus,focusSnapshot} from './focus-isolation';
import {preparedFood,scaleFood} from './food-portions';
import {readVitamins} from './nutrition';
import type {Row,Snapshot} from './snapshot-sync';
vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
const day='2026-10-13';
const food:Row={id:crypto.randomUUID(),day,name:'Молоко',meal_name:'Смузи',grams:300,kcal:150,kcal_low:140,kcal_high:160,protein_g:9,fat_g:7.5,carbs_g:14,sugar_g:14,fiber_g:null,vitamins_json:JSON.stringify([{id:'B12',amount:1.2}]),estimated:1,nutrition_estimated:1,quality:'mixed',portion_fraction:1,portion_base_json:null,product_id:null,nutrition_sources_json:JSON.stringify({protein_g:'user',B12:'estimate'}),note:'300 мл, полная порция',updated_at:'2026-10-13T12:00:00Z'};
it('preserves the eaten portion and reconstructs the full recipe without duplicating unchanged nutrients',()=>{
 for(const fraction of [1,.5,2/3]){
  const row=fraction===1?food:scaleFood(food,fraction),before=structuredClone(row),compact=foodContext(row),full={...compact,...compact.prepared};
  const prepared=preparedFood(row);
  for(const key of ['grams','kcal','kcal_low','kcal_high','protein_g','fat_g','carbs_g','sugar_g','fiber_g'])expect(full[key as keyof typeof full]).toEqual(prepared[key]);
  expect(full.vitamins).toEqual(readVitamins(prepared));expect(compact.grams).toEqual(row.grams);expect(compact.sources).toEqual({protein_g:'user',B12:'estimate'});expect(row).toEqual(before);
  if(fraction===1)expect(compact.prepared).toEqual({});
  expect(JSON.stringify(compact)).not.toContain('updated_at');
 }
});
it('retains the whole review period, conversation, expense comments, and references to manually deleted food',()=>{
 const s:Snapshot={format:'nexus-backup',version:15,exportedAt:new Date().toISOString(),tables:{settings:[]}};
 initializeFocus(s,'2026-10-13T09:00:00Z');
 s.tables.food_entries.push({...food});
 s.tables.focus_money.push({id:7,type:'expense',amount_cents:30000,occurred_at:day+'T12:00:00',account_id:1,category_id:1,note:'Обед с другом',updated_at:'technical timestamp'});
 for(let i=0;i<12;i++)s.tables.mentor_turns.push({id:crypto.randomUUID(),day,raw_text:'Важное уточнение '+i,reply:'Ответ наставника '+i,created_at:'2026-10-13T11:'+String(i).padStart(2,'0')+':00Z',updated_at:'2026-10-13T12:00:00Z',links_json:JSON.stringify([{table:'food_entries',primary:'id',key:i===11?'deleted-food':food.id}])});
 const facts=focusFacts(s,day,'Итоги за 28 дней');
 expect(facts.food).toHaveLength(1);expect(facts.food[0]).toMatchObject({id:food.id,meal:'Смузи',grams:300,protein_g:9,fiber_g:null});
 expect(facts.facts.money[0]).toMatchObject({id:7,note:'Обед с другом',amount_cents:30000});
 expect(facts.conversation).toHaveLength(12);expect(facts.conversation[11]).toMatchObject({user:'Важное уточнение 11',mentor:'Ответ наставника 11',savedReferences:[{id:'deleted-food',removed:true}]});
 expect(JSON.stringify(facts)).not.toContain('technical timestamp');expect(facts.period.from).toBe(day);
});
it('keeps all nutrition and stable IDs while substantially reducing repetitive food context',()=>{
 const rows=Array.from({length:40},(_,i)=>({...food,id:'food-'+i}));
 const previous=rows.map(row=>({...row,meal:'Смузи',prepared:preparedFood(row),portion_base_json:undefined}));
 const compact=rows.map(foodContext);
 expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(previous).length*.7);
 expect(compact.map(r=>r.id)).toEqual(rows.map(r=>r.id));
});
it('uses compact facts with the same validated correction, portion and savings operations',()=>{
 const s:Snapshot={format:'nexus-backup',version:15,exportedAt:new Date().toISOString(),tables:{settings:[]}};
 initializeFocus(s,'2026-10-13T09:00:00Z');s.tables.food_entries.push({...food});
 const facts=focusFacts(s,day,'Не новая еда: исправь молоко и учти половину смузи. Отложил 500 рублей.');
 const reply=mentorReplySchema.parse({reply:'Исправил',actions:[{kind:'food',day,id:facts.food[0].id,name:'Молоко',meal:'Смузи',grams:400,kcal:200,low:190,high:210,estimated:true,quality:'mixed',proteinG:12,fatG:10,carbsG:18.6,sugarG:18.6,nutritionEstimated:true,vitamins:[{id:'B12',amount:1.6}],note:''},{kind:'foodPortion',day,ids:[facts.food[0].id],fraction:.5},{kind:'saving',day,id:null,amountCents:50000,direction:'in',note:''}]});
 saveFocusTurn(s,{id:crypto.randomUUID(),day,text:'Исправление и половина смузи, отложил 500',...reply,replace:false,expectedUpdatedAt:null});
 const view=focusSnapshot(s);expect(view.tables.food_entries).toHaveLength(1);expect(view.tables.food_entries[0]).toMatchObject({grams:200,kcal:100});expect(focusFacts(s,day,'Итоги').savings.balanceCents).toBe(50000);
});
