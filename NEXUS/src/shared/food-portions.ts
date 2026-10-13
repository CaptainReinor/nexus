import type {Row} from './snapshot-sync';
import {nutritionColumns,readVitamins} from './nutrition';

const columns=['grams','kcal','kcal_low','kcal_high',...Object.values(nutritionColumns)] as const;
export function preparedFood(row:Row):Row{
 let raw:Row=row;
 try{const parsed=JSON.parse(String(row.portion_base_json??'null'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))raw=parsed;}catch{/* A legacy entry has no prepared portion. */}
 return {...Object.fromEntries(columns.map(key=>[key,typeof raw[key]==='number'?raw[key]:null])),vitamins_json:JSON.stringify(readVitamins(raw))};
}
export function scaleFood(row:Row,fraction:number,estimated=false):Row{
 if(!Number.isFinite(fraction)||fraction<=0||fraction>1)throw Error('Проверьте съеденную долю блюда.');
 const base=preparedFood(row),scaled:Row={};
 for(const key of columns){const value=base[key];scaled[key]=typeof value==='number'?key.startsWith('kcal')?Math.round(value*fraction):Number((value*fraction).toFixed(3)):null;}
 scaled.vitamins_json=JSON.stringify(readVitamins(base).map(v=>({...v,amount:Number((v.amount*fraction).toFixed(4))})));
 return {...row,...scaled,portion_fraction:fraction,portion_base_json:JSON.stringify(base),estimated:estimated?1:row.estimated,nutrition_estimated:estimated?1:row.nutrition_estimated};
}
export function foodMeal(row:Row):string{
 if(typeof row.meal_name==='string'&&row.meal_name.trim())return row.meal_name.trim();
 const text=String(row.name)+' '+String(row.note??'');
 if(/смузи|смуси/i.test(text))return 'Смузи';
 if(/омлет/i.test(text))return 'Омлет';
 return '';
}
export function initializeFoodPortions(rows:Row[]){for(const row of rows){row.meal_name??=foodMeal(row);row.portion_fraction??=1;row.portion_base_json??=null;row.product_id??=null;row.nutrition_sources_json??=null;}}
export function removeLegacyDeletedFoods(rows:Row[],turns:Row[]):Row[]{
 const requested=new Set<string>();
 for(const turn of turns){
  if(!/удал|убери|убрать|отмен/iu.test(String(turn.raw_text)))continue;
  try{const actions=JSON.parse(String(turn.actions_json)) as Row[];for(const action of actions)if(action.kind==='food'&&typeof action.id==='string'&&action.kcal===0&&action.note==='Удалено по запросу пользователя.')requested.add(action.id);}catch{/* Invalid legacy history cannot authorize removal. */}
 }
 return rows.filter(row=>!(requested.has(String(row.id))&&row.kcal===0&&row.note==='Удалено по запросу пользователя.'));
}
