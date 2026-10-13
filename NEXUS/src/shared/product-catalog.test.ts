import {expect,it} from 'vitest';
import {localDay} from './domain';
import {mentorReplySchema,parseMentorReply,saveFocusTurn,focusFacts,validateMentorActions} from './focus-mode';
import {matchProduct,productNutrients} from './product-catalog';
import {focusSnapshot,publishFocus} from './focus-isolation';
import {nutritionTotals} from './nutrition';
import {fingerprint} from './record-clocks';
import type {Snapshot} from './snapshot-sync';
const day=localDay();
const snapshot=():Snapshot=>({format:'nexus-backup',version:15,exportedAt:'',tables:{settings:[],finance_accounts:[],finance_categories:[],finance_transactions:[],weight_entries:[],health_daily_entries:[],workouts:[]}});
const food=(brand='Рококо',preparation='raw',grams=400,kcal=440)=>mentorReplySchema.parse({reply:'Записал',actions:[{kind:'food',id:null,day,name:'Куриное филе',brand,preparation,grams,kcal,low:400,high:500,estimated:true,quality:'balanced',proteinG:88,fatG:8,carbsG:0,sugarG:0,fiberG:null,vitamins:[{id:'B12',amount:1.6}],nutritionEstimated:true,note:''}]}).actions[0];
const save=(s:Snapshot,action:ReturnType<typeof food>,text='Съел 400гр филе')=>saveFocusTurn(s,{id:crypto.randomUUID(),day,text,reply:'Записал',actions:[action],replace:false,expectedUpdatedAt:null});
it('learns per-100g values privately, reuses them deterministically and preserves vitamins as estimates',()=>{
 const s=snapshot();save(s,food());const p=s.tables.focus_products[0];expect(p.name).toBe('Куриное филе Рококо');expect(productNutrients(p)).toMatchObject({kcal:110,protein_g:22,fat_g:2,carbs_g:0,sugar_g:0,fiber_g:null,vitamins:[{id:'B12',amount:.4}]});
 const raw=mentorReplySchema.parse({reply:'Записал',actions:[{...food(),productId:p.id,grams:200,kcal:null,low:null,high:null,proteinG:null,fatG:null,carbsG:null,vitamins:[]}]}),reply=parseMentorReply(JSON.stringify(raw),'Съел 200гр куриного филе Рококо',[],s.tables.focus_products);expect(reply.actions[0]).toMatchObject({kcal:220,proteinG:44,fatG:4,vitamins:[{id:'B12',amount:.8}]});save(s,reply.actions[0]);expect(s.tables.focus_products).toHaveLength(1);expect(s.tables.focus_products[0].uses).toBe(2);expect(s.tables.finance_transactions).toEqual([]);expect(focusFacts(s,day,'Филе Рококо').productCatalog).toHaveLength(1);expect(focusFacts(s,day,'Итоги сна').productCatalog).toHaveLength(0);publishFocus(s);expect(s.tables.finance_accounts).toEqual([]);
});
it('does not merge different brands, cooking states or fat percentages',()=>{
 const s=snapshot();save(s,food());save(s,food('Другая марка'));save(s,food('Рококо','cooked',400,660));expect(s.tables.focus_products).toHaveLength(3);expect(matchProduct(s.tables.focus_products,'Куриное филе Рококо','Рококо','unknown')).toBeUndefined();expect(matchProduct(s.tables.focus_products,'Куриное филе','', 'raw')).toBeUndefined();
 const a=food('','unknown',400,220);if(a.kind!=='food')throw Error('fixture');save(s,{...a,name:'Молоко 2.5%'});save(s,{...a,name:'Молоко 1.5%'});expect(s.tables.focus_products).toHaveLength(5);
});
it('prioritizes entered label macros over estimates while keeping inferred vitamins approximate',()=>{
 const s=snapshot();save(s,food());const p=s.tables.focus_products[0],a=food();if(a.kind!=='food')throw Error('fixture');save(s,{...a,productId:String(p.id),kcal:480,proteinG:92,fatG:12},'Съел 400гр. На упаковке: 120 ккал на 100 г, белки 23, жиры 3, углеводы 0.');expect(productNutrients(s.tables.focus_products[0])).toMatchObject({kcal:120,protein_g:23,fat_g:3,sources:{kcal:'user',protein_g:'user',fat_g:'user',B12:'estimate'}});
 save(s,{...a,productId:String(p.id),kcal:999,proteinG:60,fatG:4});const row=s.tables.food_entries.at(-1)!;expect(row).toMatchObject({kcal:480,protein_g:92,fat_g:12});expect(nutritionTotals([row]).macros.proteinG.estimated).toBe(false);expect(nutritionTotals([row]).vitamins.find(v=>v.id==='B12')?.estimated).toBe(true);
});
it('does not learn from unknown mass and does not invent a mass just to use the catalog',()=>{
 const s=snapshot(),a=food();if(a.kind!=='food')throw Error('fixture');save(s,{...a,grams:null});expect(s.tables.focus_products).toEqual([]);save(s,a);const parsed=parseMentorReply(JSON.stringify({reply:'Записал',actions:[{...a,productId:s.tables.focus_products[0].id}]}),'Съел филе Рококо',[],s.tables.focus_products);expect(parsed.actions[0]).toMatchObject({grams:null});
});
it('scales the original recipe while preserving the product basis and rejects foreign product identities',()=>{
 const s=snapshot();save(s,food());const row=s.tables.food_entries[0],turn={id:crypto.randomUUID(),day,text:'Съел половину',reply:'Записал',actions:[{kind:'foodPortion' as const,day,ids:[String(row.id)],fraction:.5,estimated:false}],replace:false,expectedUpdatedAt:null};saveFocusTurn(s,turn);expect(s.tables.food_entries[0].kcal).toBe(220);expect(productNutrients(s.tables.focus_products[0])?.kcal).toBe(110);
 const reply=mentorReplySchema.parse({reply:'Записал',actions:[{...food(),productId:crypto.randomUUID()}]});expect(()=>validateMentorActions(reply,s,'Съел 400гр филе',day)).toThrow();expect(focusSnapshot(s).tables.focus_products).toHaveLength(1);
});

it('keeps repeat estimates stable and uses the same product identity on two offline devices',()=>{
 const left=snapshot(),right=snapshot();save(left,food());save(right,food());expect(left.tables.focus_products[0].id).toBe(right.tables.focus_products[0].id);const a=food();if(a.kind!=='food')throw Error('fixture');save(left,{...a,kcal:640,proteinG:60});expect(productNutrients(left.tables.focus_products[0])?.kcal).toBe(110);expect(left.tables.food_entries.at(-1)?.kcal).toBe(440);
});
it('upgrades legacy food links and preserves editing identities while learning the old history once',()=>{
 const s=snapshot(),input={id:crypto.randomUUID(),day,text:'400гр филе',reply:'Записал',actions:[food('','unknown')],replace:false,expectedUpdatedAt:null};saveFocusTurn(s,input);const row=s.tables.food_entries[0],id=row.id,legacy={...row};delete legacy.product_id;delete legacy.nutrition_sources_json;
 s.tables.food_entries=[legacy];s.tables.focus_products=[];s.tables.settings=s.tables.settings.filter(r=>r.key!=='_focusProductsRevision');const turn=s.tables.mentor_turns[0],links=JSON.parse(String(turn.links_json));links[0].hash=fingerprint(legacy);turn.links_json=JSON.stringify(links);
 const action=food('','unknown');if(action.kind!=='food')throw Error('fixture');saveFocusTurn(s,{...input,replace:true,expectedUpdatedAt:String(turn.updated_at),actions:[{...action,grams:200,kcal:440}]});expect(s.tables.food_entries[0]).toMatchObject({id,grams:200,kcal:220});expect(s.tables.focus_products).toHaveLength(1);expect(s.tables.focus_products[0].uses).toBe(1);
});
it('never learns a variable homemade recipe as if it were a constant packaged product',()=>{
 const s=snapshot(),action=food('','mixed');if(action.kind!=='food')throw Error('fixture');save(s,{...action,name:'Домашний смузи'});expect(s.tables.focus_products).toHaveLength(0);expect(s.tables.food_entries).toHaveLength(1);
});

it('reuses exact saved values when the user explicitly says there is no new label',()=>{
 const s=snapshot(),a=food();if(a.kind!=='food')throw Error('fixture');save(s,a);const p=s.tables.focus_products[0];save(s,{...a,productId:String(p.id),kcal:480,proteinG:92},'На упаковке 120 ккал, белки 23 на 100гр. Порция 400гр.');const raw={reply:'Записал',actions:[{...a,productId:p.id,grams:100,kcal:null,proteinG:null,vitamins:[]}]};const parsed=parseMentorReply(JSON.stringify(raw),'Съел ещё 100гр. Никакой новой этикетки нет.',[],s.tables.focus_products);expect(parsed.actions[0]).toMatchObject({kcal:120,proteinG:23,estimated:false});
});

it('never replaces a provided cooked-product label with the generic USDA estimate',()=>{
 const a=food('','cooked',200,220);if(a.kind!=='food')throw Error('fixture');const parsed=parseMentorReply(JSON.stringify({reply:'Записал',actions:[{...a,name:'Готовое куриное филе',proteinG:46,fatG:4}]}),'На упаковке 110 ккал на 100г, белки 23, жиры 2. Съел 200гр.');expect(parsed.actions[0]).toMatchObject({kcal:220,proteinG:46,fatG:4});
});

it('normalizes empty optional identifiers and meals without accepting invented nonempty identities',()=>{
 const a=food();if(a.kind!=='food')throw Error('fixture');const parsed=parseMentorReply(JSON.stringify({reply:'Записал',actions:[{...a,id:'',productId:'',meal:''}]}),'Съел 400гр филе');expect(parsed.actions[0]).toMatchObject({id:null,productId:null,meal:null});expect(()=>parseMentorReply(JSON.stringify({reply:'Записал',actions:[{...a,id:'invented'}]}),'400гр филе')).toThrow();
});
