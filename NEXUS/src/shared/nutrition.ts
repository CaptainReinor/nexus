import {z} from './validation';
import type {Row} from './snapshot-sync';

export const vitaminIds=['A','B1','B2','B3','B5','B6','B9','B12','C','D','E','K'] as const;
export const vitaminUnits:Record<typeof vitaminIds[number],string>={A:'мкг RAE',B1:'мг',B2:'мг',B3:'мг',B5:'мг',B6:'мг',B9:'мкг',B12:'мкг',C:'мг',D:'мкг',E:'мг',K:'мкг'};
export const vitaminSchema=z.object({id:z.enum(vitaminIds),amount:z.number().nonnegative().max(100000)}).strict();
const grams=z.number().nonnegative().max(10000).nullable().default(null);
export const nutritionFields={proteinG:grams,fatG:grams,carbsG:grams,sugarG:grams,fiberG:grams,nutritionEstimated:z.boolean().default(true),vitamins:z.array(vitaminSchema).max(12).default([])};
export type NutritionKey='proteinG'|'fatG'|'carbsG'|'sugarG'|'fiberG';
export const nutritionColumns:Record<NutritionKey,string>={proteinG:'protein_g',fatG:'fat_g',carbsG:'carbs_g',sugarG:'sugar_g',fiberG:'fiber_g'};
export function readVitamins(row:Row):z.infer<typeof vitaminSchema>[] {
 try{return z.array(vitaminSchema).parse(JSON.parse(String(row.vitamins_json??'[]')));}catch{return [];}
}
// Totals cover recorded food only. Missing nutrients remain unknown; no RDA or
// deficiency is inferred from an incomplete diary.
function nutrientIsEstimated(row:Row,key:string){try{const sources=JSON.parse(String(row.nutrition_sources_json??'{}'));if(sources[key])return sources[key]!=='user';}catch{/* Legacy flags remain valid. */}return row.nutrition_estimated!==0;}
export function nutritionTotals(foods:Row[]){
 const metric=(column:string)=>{const known=foods.filter(r=>typeof r[column]==='number');return {total:known.length?known.reduce((n,r)=>n+Number(r[column]),0):null,known:known.length,missing:foods.length-known.length,estimated:known.some(r=>nutrientIsEstimated(r,column))};};
 const macros=Object.fromEntries(Object.entries(nutritionColumns).map(([key,column])=>[key,metric(column)])) as Record<NutritionKey,ReturnType<typeof metric>>;
 const vitamins=vitaminIds.map(id=>{const values=foods.map(row=>({row,value:readVitamins(row).find(v=>v.id===id)})).filter(x=>x.value);return {id,unit:vitaminUnits[id],total:values.length?values.reduce((n,x)=>n+x.value!.amount,0):null,known:values.length,missing:foods.length-values.length,estimated:values.some(x=>nutrientIsEstimated(x.row,id))};});
 return {macros,vitamins};
}
