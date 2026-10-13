import {z} from './validation';
import {fingerprint} from './record-clocks';
import type {Row} from './snapshot-sync';
import {preparedFood} from './food-portions';
import {readVitamins,vitaminSchema,nutritionColumns} from './nutrition';

export const productPreparation=z.enum(['raw','cooked','mixed','unknown']);
const source=z.enum(['user','estimate']);
export const productNutrientsSchema=z.object({kcal:z.number().nonnegative().max(1000).nullable(),protein_g:z.number().nonnegative().max(100).nullable(),fat_g:z.number().nonnegative().max(100).nullable(),carbs_g:z.number().nonnegative().max(100).nullable(),sugar_g:z.number().nonnegative().max(100).nullable(),fiber_g:z.number().nonnegative().max(100).nullable(),vitamins:z.array(vitaminSchema).max(12),sources:z.record(z.string(),source)}).strict();
export type ProductNutrients=z.infer<typeof productNutrientsSchema>;
export const normalizeProductName=(name:string)=>name.toLowerCase().replace(/ё/g,'е').replace(/[«»"'’]/g,'').replace(/\([^)]*(?:смузи|омлет|порци|обед|завтрак)[^)]*\)/g,'').replace(/\d+(?:[.,]\d+)?\s*(?:грамм[а-яё]*|гр\.?|кг|мл|г)(?=$|[\s.,;])/gi,'').replace(/[.,](?=\d)/g,'.').replace(/[^\p{L}\p{N}%.]+/gu,' ').trim();
export function inferredPreparation(name:string):z.infer<typeof productPreparation>{if(/сыро[ейя]|сырой|сырая|сырое/iu.test(name))return 'raw';if(/вар[её]н|запеч[её]н|жарен|готов[а-яё]*\s+(?:филе|кур|рис)/iu.test(name))return 'cooked';if(/смузи|омлет|салат|суп|запеканк/iu.test(name))return 'mixed';return 'unknown';}
export function productKey(name:string,brand:string,preparation:string){return `${normalizeProductName(name)}|${normalizeProductName(brand)}|${preparation}`;}
function productIdentity(key:string){const hex=fingerprint({key,salt:'nexus-product-1'})+fingerprint({key,salt:'nexus-product-2'});return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;}
export function productNutrients(row:Row):ProductNutrients|null{try{return productNutrientsSchema.parse(JSON.parse(String(row.nutrients_json)));}catch{return null;}}
function aliases(row:Row):string[]{try{return z.array(z.string().max(300)).max(30).parse(JSON.parse(String(row.aliases_json)));}catch{return [];}}
export function matchProduct(rows:Row[],name:string,brand='',preparation='unknown'):Row|undefined{
 const full=brand&&!normalizeProductName(name).includes(normalizeProductName(brand))?`${name} ${brand}`:name,key=normalizeProductName(full),b=normalizeProductName(brand);
 const hits=rows.filter(row=>productNutrients(row)&&(preparation==='unknown'||row.preparation===preparation)&&(b?normalizeProductName(String(row.brand))===b:!row.brand||key.includes(normalizeProductName(String(row.brand))))&&(normalizeProductName(String(row.name))===key||aliases(row).some(alias=>normalizeProductName(alias)===key)));
 return hits.length===1?hits[0]:undefined;
}
export function selectedProducts(rows:Row[],text:string):Row[]{
 const words=new Set(normalizeProductName(text).split(' ').filter(word=>word.length>2));
 return rows.map(row=>({row,score:[String(row.name),String(row.brand),...aliases(row)].flatMap(name=>normalizeProductName(name).split(' ')).filter(word=>words.has(word)).length})).filter(item=>item.score>0&&productNutrients(item.row)).sort((a,b)=>b.score-a.score||Number(b.row.uses)-Number(a.row.uses)).slice(0,8).map(({row})=>({id:row.id,name:row.name,brand:row.brand,preparation:row.preparation,aliases:aliases(row),per100g:productNutrients(row)}));
}
export function nutritionForMass(product:Row,grams:number):Row{
 const data=productNutrients(product);if(!data||!Number.isFinite(grams)||grams<=0)throw Error('Не удалось пересчитать продукт.');
 const result:Row={};for(const key of ['kcal',...Object.values(nutritionColumns)]){const value=data[key as keyof ProductNutrients];result[key]=typeof value==='number'?key==='kcal'?Math.round(value*grams/100):Number((value*grams/100).toFixed(3)):null;}
 result.vitamins_json=JSON.stringify(data.vitamins.map(v=>({...v,amount:Number((v.amount*grams/100).toFixed(4))})));
 result.nutrition_sources_json=JSON.stringify(data.sources);result.estimated=data.sources.kcal==='user'?0:1;result.nutrition_estimated=Object.values(data.sources).some(value=>value==='estimate')?1:0;
 result.kcal_low=result.kcal===null?null:result.estimated?Math.round(Number(result.kcal)*.85):result.kcal;result.kcal_high=result.kcal===null?null:result.estimated?Math.round(Number(result.kcal)*1.15):result.kcal;
 return result;
}
export function learnProduct(rows:Row[],food:Row,metadata:{brand?:string;preparation?:string;userFields?:string[];previous?:Row;refreshEstimate?:boolean},now:string):Row|undefined{
 const base=preparedFood(food),grams=Number(base.grams);if(!Number.isFinite(grams)||grams<=0)return;
 const brand=metadata.brand??'',preparation=metadata.preparation&&metadata.preparation!=='unknown'?metadata.preparation:inferredPreparation(String(food.name));
 if(preparation==='mixed'&&!brand)return;
 const displayName=brand&&!normalizeProductName(String(food.name)).includes(normalizeProductName(brand))?`${food.name} ${brand}`:String(food.name);
 const existing=rows.find(row=>row.id===food.product_id)??matchProduct(rows,displayName,brand,preparation);
 const data:ProductNutrients={kcal:null,protein_g:null,fat_g:null,carbs_g:null,sugar_g:null,fiber_g:null,vitamins:[],sources:{}};
 const previous=metadata.previous?preparedFood(metadata.previous):null;
 for(const key of ['kcal',...Object.values(nutritionColumns)]){
  const value=base[key];if(typeof value!=='number'||!Number.isFinite(value))continue;
  const user=metadata.userFields?.includes(key)||(metadata.userFields===undefined&&(key==='kcal'?food.estimated===0:food.nutrition_estimated===0&&['protein_g','fat_g','carbs_g'].includes(key)))||(previous&&previous.grams===base.grams&&previous[key]!==value);
  (data as unknown as Row)[key]=Number((value*100/grams).toFixed(4));data.sources[key]=user?'user':'estimate';
 }
 data.vitamins=readVitamins(base).map(v=>({...v,amount:Number((v.amount*100/grams).toFixed(5))}));for(const v of data.vitamins)data.sources[v.id]=previous&&previous.grams===base.grams&&readVitamins(previous).find(x=>x.id===v.id)?.amount!==v.amount?'user':'estimate';
 if(!Object.keys(data.sources).length)return;
 const old=existing?productNutrients(existing):null;
 if(old){
  for(const key of ['kcal',...Object.values(nutritionColumns)])if((old as unknown as Row)[key]!==null&&((data as unknown as Row)[key]===null||data.sources[key]!=='user'&&(old.sources[key]==='user'||!metadata.refreshEstimate))){(data as unknown as Row)[key]=(old as unknown as Row)[key];data.sources[key]=old.sources[key];}
  for(const v of old.vitamins){const i=data.vitamins.findIndex(item=>item.id===v.id);if(i<0||data.sources[v.id]!=='user'&&(old.sources[v.id]==='user'||!metadata.refreshEstimate)){if(i<0)data.vitamins.push(v);else data.vitamins[i]=v;data.sources[v.id]=old.sources[v.id];}}
 }
 const unique=[...new Set([String(existing?.name??displayName),...aliases(existing??{}),displayName])].slice(-30);
 let seen:string[]=[];try{seen=JSON.parse(String(existing?.seen_json??'[]'));}catch{/* No previous uses. */}
 const parsed=productNutrientsSchema.safeParse(data);if(!parsed.success)return;
 const id=String(food.id),fresh=!seen.includes(id);const row:Row={id:existing?.id??productIdentity(productKey(displayName,brand,preparation)),name:existing?.name??displayName,brand:existing?.brand||brand,preparation:existing?.preparation&&existing.preparation!=='unknown'?existing.preparation:preparation,aliases_json:JSON.stringify(unique),nutrients_json:JSON.stringify(parsed.data),uses:Number(existing?.uses??0)+(fresh?1:0),seen_json:JSON.stringify([...new Set([...seen,id])].slice(-128)),created_at:existing?.created_at??now,updated_at:now};
 const index=rows.findIndex(item=>item.id===row.id);if(index>=0&&!existing&&productKey(String(rows[index].name),String(rows[index].brand),String(rows[index].preparation))!==productKey(displayName,brand,preparation))return; if(index<0)rows.push(row);else rows[index]=row;return row;
}
export function validateProductReference(product:Row,brand:string,preparation:string,name=''){const percent=(value:string)=>/(\d+(?:[.,]\d+)?)\s*%/.exec(value)?.[1].replace(',','.');const actual=percent(name),expected=percent(String(product.name));return (!actual||!expected||actual===expected)&& (!brand||normalizeProductName(brand)===normalizeProductName(String(product.brand))||!product.brand&&normalizeProductName(String(product.name)).includes(normalizeProductName(brand)))&&(preparation==='unknown'||product.preparation===preparation);}
