import {z} from './validation';
import {dateSchema} from './growth';
import {localDay,sleepDuration} from './domain';
import {numericId,put,records,shiftDay} from './daily-core';
import {fingerprint} from './record-clocks';
import {focusSnapshot,initializeFocus,focusBoundary,storeFocusView,focusSourceTables} from './focus-isolation';
import {foodMeal,preparedFood,scaleFood} from './food-portions';
import {savingsBalance} from './focus-savings';
import {productPreparation,normalizeProductName,learnProduct,matchProduct,nutritionForMass,selectedProducts,validateProductReference} from './product-catalog';
import {FocusActionError} from './focus-diagnostics';
import {nutritionFields,nutritionColumns,vitaminUnits,nutritionTotals} from './nutrition';
import type {Row,Snapshot} from './snapshot-sync';
import {foodContext,weightContext,sleepContext,moneyContext,activityContext,contextFields} from './focus-context';
export {mentorInstructions} from './focus-prompt';

export const focusTables=['mentor_turns','food_entries','activity_entries',...focusSourceTables,'focus_products'] as const;
import {defaultMentorModel} from './focus-model';
export {defaultMentorModel} from './focus-model';
const name=z.string().trim().min(1).max(300),note=z.string().max(2000),clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
const identity=z.string().uuid(),numberId=z.number().int().positive().safe();
const financeFields={id:numberId.nullable(),day:dateSchema,amountCents:z.number().int().positive().safe().nullable(),accountId:numberId.nullable(),categoryId:numberId.nullable(),note};
export const focusConfigSchema=z.object({startDay:dateSchema,days:z.number().int().min(1).max(3650).nullable(),targetCents:z.number().int().positive().safe().nullable(),gymPerWeek:z.number().int().min(1).max(7).nullable(),model:z.string().trim().min(1).max(120),dietNote:z.string().max(2000).default('')}).strict();
export type FocusConfig=z.infer<typeof focusConfigSchema>;
export const focusConfigPatchSchema=focusConfigSchema.omit({startDay:true,days:true}).partial().extend({dietNote:z.string().max(2000).optional()}).strict();
export type FocusConfigPatch=z.infer<typeof focusConfigPatchSchema>;
export const focusActionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('weight'),day:dateSchema,kg:z.number().min(1).max(500)}).strict(),
 z.object({kind:z.literal('sleep'),day:dateSchema,start:clock,end:clock,minutes:z.number().int().min(1).max(1440).nullable()}).strict().refine(x=>x.start!==null||x.end!==null||x.minutes!==null,'Укажите время или длительность сна.'),
 z.object({kind:z.literal('expense'),...financeFields}).strict(),
 z.object({kind:z.literal('income'),...financeFields}).strict(),
 z.object({kind:z.literal('saving'),id:numberId.nullable(),day:dateSchema,amountCents:z.number().int().positive().safe(),direction:z.enum(['in','out']),note}).strict(),
 z.object({kind:z.literal('food'),id:identity.nullable(),day:dateSchema,name,productId:identity.nullable().default(null),brand:z.string().max(100).default(''),preparation:productPreparation.default('unknown'),meal:name.nullable().default(null),grams:z.number().positive().max(10000).nullable(),kcal:z.number().int().nonnegative().max(20000).nullable(),low:z.number().int().nonnegative().max(20000).nullable(),high:z.number().int().nonnegative().max(20000).nullable(),estimated:z.boolean(),quality:z.enum(['balanced','mixed','limited','unknown']),...nutritionFields,note}).strict().refine(x=>x.low===null||x.high===null||x.low<=x.high,'Проверьте диапазон калорий.').refine(x=>new Set(x.vitamins.map(v=>v.id)).size===x.vitamins.length,'Витамин указан дважды.'),
 z.object({kind:z.literal('removeFood'),id:identity,day:dateSchema}).strict(),
 z.object({kind:z.literal('foodPortion'),ids:z.array(identity).min(1).max(30),day:dateSchema,fraction:z.number().min(.001).max(1),estimated:z.boolean().default(false)}).strict().refine(x=>new Set(x.ids).size===x.ids.length,'Ингредиент указан дважды.'),
 z.object({kind:z.literal('activity'),id:identity.nullable(),day:dateSchema,title:name,minutes:z.number().int().min(1).max(1440).nullable(),type:z.enum(['gym','walk','sport','other']),impact:z.enum(['helpful','neutral','hindering']).default('neutral'),note}).strict()
]);
export type FocusAction=z.infer<typeof focusActionSchema>;
export const mentorReplySchema=z.object({reply:z.string().trim().min(1).max(10000),actions:z.array(focusActionSchema).max(40)}).strict();
// Keep provider schemas to broadly supported structural keywords; application
// validation still checks dates, bounds and cross-field relationships.
function providerSchema(value:unknown):unknown{
 if(Array.isArray(value))return value.map(providerSchema);if(!value||typeof value!=='object')return value;
 const source=value as Record<string,unknown>,result:Record<string,unknown>={},optional=new Set<string>();
 for(const [key,child] of Object.entries(source)){
  if(key==='properties')result[key]=Object.fromEntries(Object.entries(child as Record<string,Record<string,unknown>>).map(([name,schema])=>{
   // Anthropic caps nullable/union parameters. Omitted unknown fields are
   // restored to null before application validation, never converted to zero.
   if(Array.isArray(schema.anyOf)&&schema.anyOf.some(x=>(x as Record<string,unknown>).type==='null')){optional.add(name);const choices=(schema.anyOf as Record<string,unknown>[]).filter(x=>x.type!=='null');return [name,providerSchema(choices.length===1?choices[0]:{anyOf:choices})];}
   if(Array.isArray(schema.type)&&schema.type.includes('null')){optional.add(name);return [name,providerSchema({...schema,type:schema.type.filter(t=>t!=='null')[0]})];}
   return [name,providerSchema(schema)];
  }));
  else if(key==='const')result.enum=[child];
  else if(key==='oneOf')result.anyOf=providerSchema(child);
  else if(['type','items','additionalProperties','anyOf','enum'].includes(key))result[key]=providerSchema(child);
 }
 if(Array.isArray(source.required))result.required=source.required.filter(name=>!optional.has(String(name)));
 return result;
}
export const mentorResponseFormat={type:'json_schema',json_schema:{name:'nexus_focus_reply',strict:true,schema:providerSchema(z.toJSONSchema(mentorReplySchema,{unrepresentable:'any'}))}};
export type MentorReply=z.infer<typeof mentorReplySchema>;
// USDA SR Legacy: cooked skinless chicken breast (FDC 171477), 165 kcal/100g;
// plain cooked white rice: 242 kcal/186g, rounded to 130 kcal/100g.
// These are estimates, not a replacement for a product label or recipe.
export const nutritionReferences=[{food:'Готовая куриная грудка/филе без кожи, без масла',kcalPer100g:165,source:'USDA FDC 171477',proteinG:31.02,fatG:3.57,carbsG:0,sugarG:0,fiberG:0,vitamins:[{id:'A' as const,amount:6},{id:'B1' as const,amount:.07},{id:'B2' as const,amount:.114},{id:'B3' as const,amount:13.712},{id:'B5' as const,amount:.965},{id:'B6' as const,amount:.6},{id:'B9' as const,amount:4},{id:'B12' as const,amount:.34},{id:'C' as const,amount:0},{id:'D' as const,amount:.1},{id:'E' as const,amount:.27},{id:'K' as const,amount:.3}]},{food:'Обычный варёный белый рис без масла',kcalPer100g:130,source:'USDA SR Legacy 20451'}];
export function parseMentorReply(content:string,text:string,knownFoods:Row[]=[],knownProducts:Row[]=[]):MentorReply{
 const raw=JSON.parse(content.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'')) as Record<string,unknown>;
 const nullable:Record<string,string[]>={sleep:['start','end','minutes'],expense:['id','amountCents','accountId','categoryId'],income:['id','amountCents','accountId','categoryId'],saving:['id'],food:['id','productId','meal','grams','kcal','low','high','proteinG','fatG','carbsG','sugarG','fiberG'],activity:['id','minutes']};
 if(Array.isArray(raw?.actions))raw.actions=raw.actions.map(action=>{if(!action||typeof action!=='object')return action;const next={...action};for(const field of nullable[next.kind]??[])if(next[field]===undefined||next[field]==='')next[field]=null;return next;});
 const result=mentorReplySchema.parse(raw);
 const reportedKcal=[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ккал|калори[йия]*)/gi)].map(match=>Number(match[1].replace(',','.')));
 const hasMass=/\d+(?:[.,]\d+)?\s*(?:грамм[а-яё]*|гр\.?|г\.?|кг\.?|kg|g|grams?)(?=$|[\s,.;:!?])/i.test(text)||/(?:сто|двести|триста|четыреста|пятьсот|[а-яё]*десят|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)\s+(?:грамм|килограмм)[а-яё]*/i.test(text);
 result.actions=result.actions.map(action=>{
  if(action.kind!=='food')return action;
  const hasLabel=/\d+(?:[.,]\d+)?\s*ккал|(?:калори[а-я]*|ккал|к[бж]{2}у|бжу|белк[а-я]*|жир[ыаов]*|углевод[а-я]*|сахар[а-я]*|клетчатк[а-я]*)\s*[:=—-]?\s*\d/iu.test(text);
  const next={...action,nutritionEstimated:action.nutritionEstimated||!hasLabel,grams:hasMass?action.grams:action.id!==null?(knownFoods.find(r=>r.id===action.id)?Number.isFinite(preparedFood(knownFoods.find(r=>r.id===action.id)!).grams)?Number(preparedFood(knownFoods.find(r=>r.id===action.id)!).grams):null:action.grams):null,estimated:action.estimated||action.kcal===null||(!hasLabel&&!reportedKcal.includes(action.kcal))};
  const label=action.name.toLowerCase().replace(/ё/g,'е'),plain=!/жар|паниров|соус|сыр|салат|плов|масл/.test(label.replace(/без\s+(?:масл[ао]|соуса?|сыра?|панировки)/g,''));
  const reference=plain&&/готов|варен|запеч/.test(label)?/курин/.test(label)&&/филе|грудк/.test(label)&&!/рис|макарон/.test(label)?nutritionReferences[0]:/рис/.test(label)&&!/курин|мяс|рыб/.test(label)?nutritionReferences[1]:null:null;
  if(next.grams!==null&&reference&&!hasLabel&&!next.productId&&!next.brand&&!reportedKcal.includes(next.kcal??-1)){
   next.kcal=Math.round(next.grams*reference.kcalPer100g/100);next.low=Math.round(next.kcal*.85);next.high=Math.round(next.kcal*1.15);next.estimated=true;
   if(reference===nutritionReferences[0]&&next.nutritionEstimated){const nutrition=nutritionReferences[0];const scale=next.grams/100;next.proteinG=Number((nutrition.proteinG!*scale).toFixed(1));next.fatG=Number((nutrition.fatG!*scale).toFixed(1));next.carbsG=nutrition.carbsG!*scale;next.sugarG=nutrition.sugarG!*scale;next.fiberG=nutrition.fiberG!*scale;next.vitamins=nutrition.vitamins!.map(v=>({...v,amount:Number((v.amount*scale).toFixed(3))}));}
   const note=`Ориентир для готового продукта: ${reference.kcalPer100g} ккал/100 г. Рецептура может отличаться.`;
   if(!next.note.includes(note))next.note=next.note.slice(0,1800)+' '+note;
  }
  const product=next.productId?knownProducts.find(row=>row.id===next.productId):matchProduct(knownProducts,next.name,next.brand,next.preparation);
  if(product){if(!validateProductReference(product,next.brand,next.preparation,next.name))throw new FocusActionError([{path:'actions.productId',code:'product_mismatch',message:'Выбранная карточка отличается брендом, жирностью или приготовлением. Для другого варианта пропусти productId, сохрани ID исправляемой порции в id.'}]);next.productId=String(product.id);next.brand=String(product.brand);next.preparation=productPreparation.parse(product.preparation);if(next.grams!==null&&!hasLabel&&!reportedKcal.length){const value=nutritionForMass(product,next.grams);next.name=String(product.name);next.kcal=value.kcal as number|null;next.low=value.kcal_low as number|null;next.high=value.kcal_high as number|null;next.estimated=value.estimated===1;for(const [key,column] of Object.entries(nutritionColumns))Object.assign(next,{[key]:value[column]});next.vitamins=JSON.parse(String(value.vitamins_json));next.nutritionEstimated=value.nutrition_estimated===1;}}
  return next;
 });
 return result;
}
export const mentorRequestSchema=z.object({text:z.string().trim().min(1).max(16000),day:dateSchema,overrideBudget:z.boolean().optional()}).strict();
export const focusTurnSchema=z.object({id:identity,day:dateSchema,text:z.string().trim().min(1).max(16000),reply:z.string().max(10000),actions:z.array(focusActionSchema).max(40),replace:z.boolean().default(false),expectedUpdatedAt:z.string().nullable().default(null)}).strict();
export type FocusTurnInput=z.infer<typeof focusTurnSchema>;
export type FocusTurn={id:string;day:string;raw_text:string;reply:string;actions_json:string;links_json:string;created_at:string;updated_at:string};
export interface FocusAPI{updateConfig(patch:FocusConfigPatch):Promise<void>;snapshot():Promise<Snapshot>;removeFood(input:{id:string;expectedUpdatedAt:string}):Promise<void>;publish():Promise<{written:number;skipped:number}>;configure(config:FocusConfig,enableAI?:boolean):Promise<void>;send(input:z.infer<typeof mentorRequestSchema>):Promise<MentorReply>;save(input:FocusTurnInput):Promise<void>;transcribe(input:{base64:string;format:'webm'|'wav'|'mp3';overrideBudget?:boolean}):Promise<string>}
export function focusConfig(s:Snapshot):FocusConfig{
 try{return focusConfigSchema.parse(JSON.parse(String(s.tables.settings?.find(r=>r.key==='focusConfig')?.value)));}catch{return {startDay:localDay(),days:null,targetCents:null,gymPerWeek:null,model:defaultMentorModel,dietNote:''};}
}
export function configureFocus(s:Snapshot,config:FocusConfig,enableAI=false){initializeFocus(s);config={...config,startDay:focusBoundary(s)!.day};put(s,'settings',{key:'focusConfig',value:JSON.stringify(focusConfigSchema.parse(config))},'key');if(enableAI)put(s,'settings',{key:'aiEnabled',value:'true'},'key');}
export function updateFocusConfig(s:Snapshot,patch:FocusConfigPatch){configureFocus(s,{...focusConfig(s),...focusConfigPatchSchema.parse(patch)});}
function ensure(s:Snapshot){for(const table of focusTables)records(s,table);s.version=Math.max(15,s.version);}
type Link={table:string;key:string|number;primary:string;before:Row|null;hash:string};
function write(s:Snapshot,links:Link[],table:string,row:Row,primary='id'){
 if(table==='food_entries')row={product_id:null,nutrition_sources_json:null,...row};
 const before=records(s,table).find(r=>r[primary]===row[primary]);links.push({table,key:row[primary] as string|number,primary,before:before?structuredClone(before):null,hash:fingerprint(row)});put(s,table,row,primary);
}
function saveOwnedTurn(s:Snapshot,raw:FocusTurnInput,now:string){
 const x=focusTurnSchema.parse(raw);ensure(s);const old=records(s,'mentor_turns').find(r=>r.id===x.id) as FocusTurn|undefined;
 const replaced:Record<string,Row[]>={};
 if(old&&x.replace)for(const link of JSON.parse(old.links_json) as Link[]){const row=records(s,link.table).find(r=>r[link.primary]===link.key);if(row)(replaced[link.table]??=[]).push(structuredClone(row));}
 if(old&&!x.replace)return;
 if(x.replace&&!old)throw new Error('Запись уже удалена.');
 if(old){
  if(old.updated_at!==x.expectedUpdatedAt)throw new Error('Запись изменена на другом устройстве. Откройте её снова.');
  const links=JSON.parse(old.links_json) as Link[];
  for(const link of [...links].reverse()){
   const row=records(s,link.table).find(r=>r[link.primary]===link.key);
   if(fingerprint(row)!==link.hash)throw new Error('Данные этой записи уже исправлены отдельно. Попросите наставника исправить текущую запись, чтобы не затереть более свежие правки.');
   if(link.before)put(s,link.table,link.table==='food_entries'?{product_id:null,nutrition_sources_json:null,...link.before}:link.before,link.primary);else s.tables[link.table]=records(s,link.table).filter(r=>r[link.primary]!==link.key);
  }
 }
 const links:Link[]=[],warnings:string[]=[];
 const ordered=x.actions.map((action,index)=>({action,index})).sort((a,b)=>Number(a.action.kind==='foodPortion')-Number(b.action.kind==='foodPortion')||a.index-b.index);
 for(const {action} of ordered){
  if(action.day<focusBoundary(s)!.day)throw new Error('Запись раньше начала режима фокуса.');
  if(action.day>localDay())throw new Error('Планы на будущее нельзя записывать как выполненные действия.');
  if(action.kind==='removeFood'){
   const before=records(s,'food_entries').find(r=>r.id===action.id);if(!before)throw new FocusActionError([{path:'actions.id',code:'missing_food',message:'Запись питания для удаления не найдена.'}]);
   if(before.day!==action.day)throw new FocusActionError([{path:'actions.day',code:'wrong_day',message:'Дата удаления не совпадает с датой записи.'}]);
   links.push({table:'food_entries',key:action.id,primary:'id',before:structuredClone(before),hash:fingerprint(null)});s.tables.food_entries=records(s,'food_entries').filter(r=>r.id!==action.id);
  }else if(action.kind==='foodPortion'){
   for(const id of action.ids){const before=records(s,'food_entries').find(r=>r.id===id);if(!before||before.day!==action.day)throw new FocusActionError([{path:'actions.ids',code:'missing_ingredient',message:'Не найден ингредиент блюда за выбранный день.'}]);write(s,links,'food_entries',{...scaleFood(before,action.fraction,action.estimated),updated_at:now});}
  }else if(action.kind==='saving'){
   const before=action.id===null?undefined:records(s,'finance_transactions').find(r=>r.id===action.id);
   if(action.id!==null&&(!before||before.type!=='transfer'))throw Error('Запись накоплений для исправления не найдена.');
   const source=action.direction==='in'?1:2,target=action.direction==='in'?2:1,rows=records(s,'finance_transactions').filter(r=>r.id!==action.id&&String(r.occurred_at).slice(0,10)<=action.day);
   if(action.direction==='out'&&savingsBalance(rows)<action.amountCents)throw new FocusActionError([{path:'actions.amountCents',code:'insufficient_savings',message:'В накоплениях недостаточно денег для снятия.'}]);
   const retained=replaced.finance_transactions?.find(r=>r.type==='transfer');if(retained)replaced.finance_transactions=replaced.finance_transactions.filter(r=>r!==retained);
   const row={id:before?.id??retained?.id??numericId(records(s,'finance_transactions')),occurred_at:`${action.day}T12:00:00`,created_at:before?.created_at??retained?.created_at??now,type:'transfer',amount_cents:action.amountCents,account_id:source,target_account_id:target,category_id:null,note:action.note};
   const prospective=[...records(s,'finance_transactions').filter(r=>r.id!==row.id),row];
   if([...new Set(prospective.map(r=>String(r.occurred_at).slice(0,10)))].some(day=>savingsBalance(prospective.filter(r=>String(r.occurred_at).slice(0,10)<=day))<0))throw new FocusActionError([{path:'actions.amountCents',code:'insufficient_savings',message:'Изменение оставляет отрицательный остаток накоплений.'}]);
   write(s,links,'finance_transactions',row);
  }else if(action.kind==='weight'){
   const existing=records(s,'weight_entries').find(r=>r.day===action.day);write(s,links,'weight_entries',{id:existing?.id??replaced.weight_entries?.find(r=>r.day===action.day)?.id??numericId(records(s,'weight_entries')),day:action.day,weight_kg:action.kg});
  }else if(action.kind==='sleep'){
   const before=records(s,'health_daily_entries').find(r=>r.day===action.day);
   const durationOnly=action.minutes!==null&&action.start===null&&action.end===null;
   const start=durationOnly?null:action.start??before?.sleep_start??null,end=durationOnly?null:action.end??before?.sleep_end??null;
   write(s,links,'health_daily_entries',{...{day:action.day,mood:null,energy:null,nutrition:null,comment:''},...before,sleep_start:start,sleep_end:end,sleep_minutes:typeof start==='string'&&typeof end==='string'?sleepDuration(start,end):action.minutes??null},'day');
  }else if(action.kind==='expense'||action.kind==='income'){
   const accounts=records(s,'finance_accounts').filter(r=>r.active===1&&r.id===1);let preferred:unknown=null;try{preferred=JSON.parse(String(s.tables.settings?.find(r=>r.key==='primaryAccountId')?.value));}catch{/* First active account is the default. */}
   const account=accounts.find(r=>r.id===action.accountId)??(action.accountId===null?(accounts.find(r=>r.id===preferred)??accounts[0]):undefined);
   const category=action.kind==='income'?null:records(s,'finance_categories').find(r=>r.id===action.categoryId&&r.kind==='expense'&&r.active===1);
   if(!action.amountCents||!account||(action.kind==='expense'&&!category)){warnings.push(`${action.note||'Операция'}: уточни ${!action.amountCents?'сумму':!account?'счёт':'категорию'}.`);continue;}
   const before=action.id===null?undefined:records(s,'finance_transactions').find(r=>r.id===action.id);const retained=replaced.finance_transactions?.find(r=>r.type===action.kind&&String(r.occurred_at).slice(0,10)===action.day&&r.note===action.note)??replaced.finance_transactions?.find(r=>r.type===action.kind);if(retained)replaced.finance_transactions=replaced.finance_transactions.filter(r=>r!==retained);if(action.id!==null&&(!before||before.type!==action.kind))throw new Error('Операция для исправления не найдена или имеет другой тип.');
   write(s,links,'finance_transactions',{...before,id:before?.id??retained?.id??numericId(records(s,'finance_transactions')),occurred_at:`${action.day}T12:00:00`,created_at:before?.created_at??now,type:action.kind,amount_cents:action.amountCents,account_id:account.id,target_account_id:null,category_id:category?.id??null,note:action.note});
  }else if(action.kind==='food'){
   if(action.id!==null&&!records(s,'food_entries').some(r=>r.id===action.id))throw new Error('Приём пищи для исправления не найден.');
   const title=action.brand&&!normalizeProductName(action.name).includes(normalizeProductName(action.brand))?`${action.name} ${action.brand}`:action.name;const retained=action.id===null?replaced.food_entries?.find(r=>r.day===action.day&&normalizeProductName(String(r.name))===normalizeProductName(title)&&String(r.meal_name??'')===(action.meal??'')):undefined;if(retained)replaced.food_entries=replaced.food_entries.filter(r=>r!==retained);const previous=records(s,'food_entries').find(r=>r.id===action.id)??retained;let food:Row={id:action.id??retained?.id??crypto.randomUUID(),day:action.day,name:action.name,grams:action.grams,kcal:action.kcal,kcal_low:action.low,kcal_high:action.high,estimated:action.estimated?1:0,quality:action.quality,protein_g:action.proteinG,fat_g:action.fatG,carbs_g:action.carbsG,sugar_g:action.sugarG,fiber_g:action.fiberG,nutrition_estimated:action.nutritionEstimated?1:0,vitamins_json:JSON.stringify(action.vitamins),meal_name:action.meal??(previous?foodMeal(previous):''),product_id:action.productId??(previous&&normalizeProductName(action.name)===normalizeProductName(String(previous.name))?previous.product_id:null)??null,nutrition_sources_json:null,portion_fraction:1,portion_base_json:null,note:action.note,updated_at:now};
   if(action.productId&&!records(s,'focus_products').some(row=>row.id===action.productId))throw new FocusActionError([{path:'actions.productId',code:'missing_product',message:'Выбранного продукта нет в личной базе.'}]);
   const userFields=Object.entries({kcal:/\d+(?:[.,]\d+)?\s*ккал|(?:ккал|калори[а-я]*)\s*[:=]?\s*\d/iu,protein_g:/белк[а-я]*\s*[:=]?\s*\d|\d+(?:[.,]\d+)?\s*г\s*белк/iu,fat_g:/жир[ыаов]*\s*[:=]?\s*\d/iu,carbs_g:/углевод[а-я]*\s*[:=]?\s*\d/iu,sugar_g:/сахар[а-я]*\s*[:=]?\s*\d/iu,fiber_g:/клетчатк[а-я]*\s*[:=]?\s*\d/iu}).filter(([,pattern])=>pattern.test(x.text)).map(([field])=>field);if(/к[бж]{2}у\s*[:=]?\s*\d/iu.test(x.text))userFields.push('kcal','protein_g','fat_g','carbs_g');else if(/бжу\s*[:=]?\s*\d/iu.test(x.text))userFields.push('protein_g','fat_g','carbs_g');
   const referenced=records(s,'focus_products').find(row=>row.id===food.product_id)??matchProduct(records(s,'focus_products'),title,action.brand,action.preparation);if(referenced)food.product_id=referenced.id;if(referenced&&!validateProductReference(referenced,action.brand,action.preparation,action.name))throw new FocusActionError([{path:'actions.productId',code:'product_mismatch',message:'Проверьте бренд и способ приготовления продукта.'}]);
   if(x.replace&&previous&&referenced&&food.grams!==null){const old=preparedFood(previous);if(old.grams!==food.grams&&['kcal',...Object.values(nutritionColumns)].every(key=>old[key]===food[key]))food={...food,...nutritionForMass(referenced,Number(food.grams))};}
   const product=learnProduct(records(s,'focus_products'),food,{brand:action.brand,preparation:action.preparation,userFields,previous:x.replace?previous:undefined,refreshEstimate:x.replace||action.id!==null&&/исправ|уточн|замени|пересчитай/iu.test(x.text)},now);
   if(product){food.product_id=product.id;food.name=String(product.name);const value=nutritionForMass(product,Number(food.grams));food={...food,...value};}
   if(previous&&Number(previous.portion_fraction??1)<1)food=scaleFood(food,Number(previous.portion_fraction));write(s,links,'food_entries',food);
  }else{
   if(action.id!==null&&!records(s,'activity_entries').some(r=>r.id===action.id))throw new Error('Активность для исправления не найдена.');
   write(s,links,'activity_entries',{id:action.id??crypto.randomUUID(),day:action.day,title:action.title,minutes:action.minutes,type:action.type,impact:action.impact,note:action.note,updated_at:now});
   if(action.type==='gym'||action.type==='sport'){
    const before=records(s,'workouts').find(r=>r.day===action.day);put(s,'workouts',{id:before?.id??numericId(records(s,'workouts')),day:action.day,done:1,type:action.title,minutes:action.minutes,comment:action.note});
   }
  }
 }
 const reply=x.reply+(warnings.length?`\n\nНе записано в деньги: ${warnings.join(' ')}`:'');
 put(s,'mentor_turns',{id:x.id,day:x.day,raw_text:x.text,reply,actions_json:JSON.stringify(x.actions),links_json:JSON.stringify(links),created_at:old?.created_at??now,updated_at:now});
}
export function saveFocusTurn(s:Snapshot,raw:FocusTurnInput,now=new Date().toISOString()){
 const x=focusTurnSchema.parse(raw);initializeFocus(s,now);
 const old=s.tables.mentor_turns?.find(r=>r.id===x.id);
 if(old&&!x.replace)return;
 const before=focusSnapshot(s),after=structuredClone(before);
 saveOwnedTurn(after,x,now);storeFocusView(s,after);
}
export const removeFocusFoodSchema=z.object({id:identity,expectedUpdatedAt:z.string().min(1).max(40)}).strict();
export function removeFocusFood(s:Snapshot,input:{id:string;expectedUpdatedAt:string},now=new Date().toISOString()){
 const x=removeFocusFoodSchema.parse(input),row=focusSnapshot(s).tables.food_entries.find(r=>r.id===x.id);if(!row)return;
 if(row.updated_at!==x.expectedUpdatedAt)throw Error('Запись изменилась. Обновите список и повторите удаление.');
 s.tables.food_entries=records(s,'food_entries').filter(r=>r.id!==x.id);
 const edits=JSON.parse(String(s.tables.settings?.find(r=>r.key==='focusFoodEdits')?.value??'[]')) as Row[];
 put(s,'settings',{key:'focusFoodEdits',value:JSON.stringify([...edits,{id:x.id,day:row.day,name:row.name,action:'removed',at:now}].slice(-100))},'key');
}
export function validateMentorActions(reply:MentorReply,snapshot:Snapshot,text:string,day:string){
 const view=focusSnapshot(snapshot),issues:InstanceType<typeof FocusActionError>['issues']=[];
 const correction=/исправ|уточн|меняем|замени|не нов[а-яё]*|не отдельн|это для|для смузи|для омлета/iu.test(text),newPortion=/(?:съел|съела|выпил|выпила)\s+ещ[её]|ещ[её]\s+(?:\d|одн|порц)|нов[а-яё]*\s+порци|отдельн[а-яё]*\s+(?:порц|при[её]м)|съел снова|выпил снова/iu.test(text);
 for(const [index,a] of reply.actions.entries()){
  if(a.kind==='food'&&a.productId!==null&&!view.tables.focus_products.some(row=>row.id===a.productId))issues.push({path:`actions.${index}.productId`,code:'missing_product',message:'Продукт не найден в productCatalog.'});
  if(a.kind==='food'&&a.id!==null&&!view.tables.food_entries.some(r=>r.id===a.id)||a.kind==='removeFood'&&!view.tables.food_entries.some(r=>r.id===a.id))issues.push({path:`actions.${index}.id`,code:'missing_food',message:'ID не относится к существующей записи питания. Используй ID из food.'});
  if((a.kind==='expense'||a.kind==='income'||a.kind==='saving')&&a.id!==null&&!view.tables.finance_transactions.some(r=>r.id===a.id))issues.push({path:`actions.${index}.id`,code:'missing_transaction',message:'ID финансовой операции не найден в facts.money.'});

  if(a.kind==='removeFood'&&!/удал|убер|убир|убрать|дубл|лишн|не нов[а-яё]*|не отдельн|это уточн|отмен/iu.test(text))issues.push({path:`actions.${index}`,code:'removal_not_requested',message:'Удаление питания не запрошено. Убери removeFood из ответа.'});
  if(a.kind==='foodPortion'){const meals=new Set(a.ids.map(id=>view.tables.food_entries.find(r=>r.id===id)).filter(r=>r!==undefined).map(foodMeal).filter(Boolean));if(meals.size>1)issues.push({path:`actions.${index}.ids`,code:'mixed_meals',message:'Доля блюда не должна затрагивать ингредиенты других блюд.'});}

  if(a.kind==='food'&&a.id===null&&correction&&!newPortion){const tokens=a.name.toLowerCase().match(/[а-яёa-z]{3,}/g)??[];const existing=view.tables.food_entries.filter(r=>r.day===a.day&&tokens.some(t=>!['замороженная','свежая','готовое','готовая','куриное','куриные','куриная','куриный','для','без','смузи','порция'].includes(t)&&(String(r.name).toLowerCase().match(/[а-яёa-z]{3,}/g)??[]).some(word=>word.startsWith(t.length>4?t.slice(0,-1):t))));if(existing.length)issues.push({path:`actions.${index}.id`,code:'correction_requires_id',message:'Уточнение похоже на существующий продукт. Используй его ID, не создавай новую порцию.'});}
 }
 if(issues.length)throw new FocusActionError(issues);
 try{saveFocusTurn(structuredClone(view),{id:crypto.randomUUID(),day,text,reply:reply.reply,actions:reply.actions,replace:false,expectedUpdatedAt:null});}catch(error){if(error instanceof FocusActionError)throw error;throw new FocusActionError([{path:'actions',code:'invalid_reference',message:error instanceof Error?error.message:'Не удалось проверить ссылки на записи.'}]);}
 return reply;
}
export function focusFacts(s:Snapshot,day:string,text:string){
 s=focusSnapshot(s);const config={...focusConfig(s),startDay:focusBoundary(s)?.day??localDay()};let span=28;
 const request=text.toLowerCase();const numeric=/(?:за|последни[ех]|итоги?)\s+(\d+)\s*(дн|недел|месяц)/.exec(request);
 if(numeric)span=Math.min(90,Number(numeric[1])*(numeric[2]==='дн'?1:numeric[2]==='недел'?7:30));
 if(/два месяца|двух месяцев/.test(request))span=60;if(/три месяца|тр[её]х месяцев/.test(request))span=90;
 const from=[config.startDay,shiftDay(day,-Math.max(1,span)+1)].sort().at(-1)!;
 const range=(table:string,field='day')=>(s.tables[table]??[]).filter(r=>String(r[field]).slice(0,10)>=from&&String(r[field]).slice(0,10)<=day);
 const allRows=(table:string,key='day')=>(s.tables[table]??[]).filter(r=>String(r[key]).slice(0,10)>=config.startDay&&String(r[key]).slice(0,10)<=day);
 const allSleep=allRows('health_daily_entries').filter(r=>typeof r.sleep_minutes==='number'),allFood=allRows('food_entries').filter(r=>typeof r.kcal==='number'),allMoney=allRows('finance_transactions','occurred_at');
 const allWeights=allRows('weight_entries').slice().sort((a,b)=>String(a.day).localeCompare(String(b.day)));
 const allTime={savingsCents:savingsBalance(allMoney),nutrition:nutritionTotals(allRows('food_entries')),start:config.startDay,end:day,expenseCents:allMoney.filter(r=>r.type==='expense').reduce((n,r)=>n+Number(r.amount_cents),0),incomeCents:allMoney.filter(r=>r.type==='income').reduce((n,r)=>n+Number(r.amount_cents),0),sleepDays:allSleep.length,averageSleepMinutes:allSleep.length?allSleep.reduce((n,r)=>n+Number(r.sleep_minutes),0)/allSleep.length:null,foodEntries:allFood.length,recordedKcal:allFood.reduce((n,r)=>n+Number(r.kcal),0),gymDays:new Set(allRows('activity_entries').filter(r=>r.type==='gym').map(r=>r.day)).size,weights:{count:allWeights.length,first:allWeights[0]?weightContext(allWeights[0]):null,last:allWeights.at(-1)?weightContext(allWeights.at(-1)!):null}};
 return {productCatalog:selectedProducts(s.tables.focus_products??[],text),today:localDay(),selectedDay:day,text,config,nutritionReferences,vitaminUnits,period:{from,to:day},allTime,
  savings:{balanceCents:savingsBalance(allMoney),entries:range('finance_transactions','occurred_at').filter(r=>r.type==='transfer').map(moneyContext)},
  facts:{weights:range('weight_entries').map(weightContext),sleep:range('health_daily_entries').map(sleepContext),money:range('finance_transactions','occurred_at').filter(r=>r.type!=='transfer').map(moneyContext)},
  food:range('food_entries').map(foodContext),activities:range('activity_entries').map(activityContext),
  accounts:(s.tables.finance_accounts??[]).filter(r=>r.active===1).map(r=>contextFields(r,['id','name'])),categories:(s.tables.finance_categories??[]).filter(r=>r.active===1&&r.kind==='expense').map(r=>contextFields(r,['id','name'])),
  manualFoodEdits:JSON.parse(String(s.tables.settings?.find(r=>r.key==='focusFoodEdits')?.value??'[]')),
  conversation:(s.tables.mentor_turns??[]).slice().sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).slice(-12).map(r=>({day:r.day,user:r.raw_text,mentor:r.reply,savedReferences:(JSON.parse(String(r.links_json??'[]')) as Link[]).filter(l=>['food_entries','activity_entries','finance_transactions'].includes(l.table)).map(l=>{const row=s.tables[l.table]?.find(r=>r[l.primary]===l.key);return {table:l.table,id:l.key,removed:!row,name:row?.name??row?.title??row?.note};})}))};
}
