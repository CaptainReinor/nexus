import {expect,it,vi} from 'vitest';
import {focusFacts,mentorReplySchema,saveFocusTurn,parseMentorReply} from './focus-mode';
import {explicitFullIngredientMass} from './food-portions';
import {initializeFocus,focusSnapshot} from './focus-isolation';
import type {Snapshot} from './snapshot-sync';
vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
const day='2026-10-13';
const fixture=()=>{const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};initializeFocus(s);return s;};
const save=(s:Snapshot,actions:unknown[],text='Выпил смузи')=>{const result=mentorReplySchema.parse({reply:'Записал',actions});const id=crypto.randomUUID();saveFocusTurn(s,{id,day,text,...result,replace:false,expectedUpdatedAt:null});return id;};
const ingredients=()=>[{kind:'food',day,id:null,name:'Молоко',meal:'Смузи',grams:300,kcal:150,low:140,high:160,estimated:true,quality:'mixed',proteinG:9,fatG:6,carbsG:12,sugarG:12,fiberG:0,vitamins:[{id:'B12',amount:1.2}],note:''},{kind:'food',day,id:null,name:'Клубника',meal:'Смузи',grams:100,kcal:30,low:25,high:35,estimated:true,quality:'balanced',proteinG:1,fatG:0,carbsG:7,sugarG:5,fiberG:2,vitamins:[{id:'C',amount:60}],note:''}];
it('learns repeat meals automatically and applies a saved half as new ingredients without scaling twice',()=>{
 const s=fixture();save(s,ingredients());expect(focusFacts(s,day,'Мой обычный смузи').recipes).toHaveLength(0);save(s,ingredients());const recipe=focusFacts(s,day,'Мой обычный смузи').recipes[0];expect(recipe).toBeDefined();
 const id=save(s,[{kind:'recipe',day,recipeId:recipe.id,fraction:.5}]);const replay=s.tables.food_entries.slice(-2);expect(replay[0]).toMatchObject({grams:150,kcal:75});expect(replay[1]).toMatchObject({grams:50,kcal:15});expect(JSON.parse(String(replay[0].portion_base_json)).grams).toBe(300);
 const turn=s.tables.mentor_turns.find(r=>r.id===id)!;saveFocusTurn(s,{id,day,text:'Мой смузи целиком',reply:'Исправил',actions:[{kind:'recipe',day,recipeId:String(recipe.id),fraction:1}],replace:true,expectedUpdatedAt:String(turn.updated_at)});expect(s.tables.food_entries).toHaveLength(6);expect(s.tables.food_entries.slice(-2)[0].grams).toBe(300);expect(s.tables.focus_weights).toHaveLength(0);
});
it('portion corrections do not count as repeat preparation and two new servings remain independent',()=>{
 const s=fixture();save(s,ingredients());const foods=s.tables.food_entries.map(r=>String(r.id));save(s,[{kind:'foodPortion',day,ids:foods,fraction:.5}],'На самом деле выпил половину');expect(focusFacts(s,day,'Обычный смузи').recipes).toHaveLength(0);
 save(s,ingredients());const recipe=s.tables.focus_recipes[0];save(s,[{kind:'recipe',day,recipeId:recipe.id,fraction:1},{kind:'recipe',day,recipeId:recipe.id,fraction:1}]);expect(s.tables.food_entries).toHaveLength(8);expect(new Set(s.tables.food_entries.slice(-4).map(r=>r.recipe_batch_id)).size).toBe(2);
});
it('keeps hidden recipes in the focus snapshot and leaves the main application empty',()=>{const s=fixture();save(s,ingredients());save(s,ingredients());expect(focusSnapshot(s).tables.focus_recipes).toHaveLength(1);expect(s.tables.finance_transactions??[]).toEqual([]);});
it('repairs a consumed-versus-full mass mismatch only when the user explicitly gives the full ingredient mass',()=>{
 const s=fixture();save(s,ingredients());const ids=s.tables.food_entries.map(r=>String(r.id));save(s,[{kind:'foodPortion',day,ids,fraction:.5}],'Выпил половину');
 const milk=s.tables.food_entries.find(r=>r.name==='Молоко')!,text='В полном приготовленном составе было 400гр молока, а не 300гр. Доля выпитого половина.';
 const bad={reply:'Исправил',actions:[{...ingredients()[0],id:milk.id,grams:200,kcal:100}]};const fixed=parseMentorReply(JSON.stringify(bad),text,s.tables.food_entries,s.tables.focus_products);expect(fixed.actions[0]).toMatchObject({grams:400});
 expect(explicitFullIngredientMass('Съел 400гр молока','Молоко')).toBeNull();expect(explicitFullIngredientMass('В полном составе 400гр молока и 100гр клубники','Молоко')).toBe(400);expect(explicitFullIngredientMass('В полном составе 400гр молока и 100гр клубники','Клубника')).toBe(100);
});
