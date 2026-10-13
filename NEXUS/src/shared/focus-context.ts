import type {Row} from './snapshot-sync';
import {foodMeal,preparedFood} from './food-portions';
import {readVitamins} from './nutrition';

// Project only mentor-facing facts. Storage metadata never belongs in a prompt.
export function contextFields(row:Row,fields:readonly string[]):Row{
 return Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
}
const nutrientColumns=['grams','kcal','kcal_low','kcal_high','protein_g','fat_g','carbs_g','sugar_g','fiber_g'] as const;
function nutritionContext(row:Row):Row{return {...contextFields(row,nutrientColumns),vitamins:readVitamins(row)};}
export function foodContext(row:Row):Row&{prepared:Row;vitamins:ReturnType<typeof readVitamins>;meal:string}{
 const food={...contextFields(row,['id','day','name','product_id','quality','estimated','nutrition_estimated','portion_fraction','recipe_batch_id','note']),...nutritionContext(row),meal:foodMeal(row)};
 const base=nutritionContext(preparedFood(row));
 // The full batch equals the eaten values plus these overrides. Most foods
 // have no portion adjustment, so copying every nutrient twice wastes tokens.
 const prepared=Object.fromEntries(Object.entries(base).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify((food as Row)[key])));
 let sources:unknown;try{sources=JSON.parse(String(row.nutrition_sources_json??'null'));}catch{/* Legacy provenance uses estimated flags. */}
 return {...food,vitamins:readVitamins(row),prepared,...(sources&&typeof sources==='object'&&!Array.isArray(sources)?{sources}:{})};
}
export const weightContext=(row:Row)=>contextFields(row,['id','day','weight_kg']);
export const sleepContext=(row:Row)=>contextFields(row,['day','sleep_start','sleep_end','sleep_minutes']);
export const moneyContext=(row:Row)=>contextFields(row,['id','type','amount_cents','occurred_at','account_id','target_account_id','category_id','note']);
export const activityContext=(row:Row)=>contextFields(row,['id','day','title','minutes','type','impact','note']);
