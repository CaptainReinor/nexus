import {z} from './validation';
import type {Row} from './snapshot-sync';
import {fingerprint} from './record-clocks';
import {preparedFood,foodMeal,scaleFood} from './food-portions';
import {normalizeProductName,nutritionForMass} from './product-catalog';

const ingredientSchema=z.object({name:z.string().min(1).max(300),grams:z.number().positive().max(10000),kcal:z.number().nonnegative().nullable(),kcal_low:z.number().nonnegative().nullable(),kcal_high:z.number().nonnegative().nullable(),protein_g:z.number().nonnegative().nullable(),fat_g:z.number().nonnegative().nullable(),carbs_g:z.number().nonnegative().nullable(),sugar_g:z.number().nonnegative().nullable(),fiber_g:z.number().nonnegative().nullable(),vitamins_json:z.string().max(5000),estimated:z.number(),nutrition_estimated:z.number(),quality:z.string(),product_id:z.string().nullable(),nutrition_sources_json:z.string().nullable(),note:z.string().max(2000)});
export const recipeIngredientsSchema=z.array(ingredientSchema).min(1).max(30);
export function focusIdentity(key:string){const hex=fingerprint({key})+fingerprint({key,domain:'focus'});return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;}
export function recipeIngredients(row:Row){try{return recipeIngredientsSchema.parse(JSON.parse(String(row.ingredients_json)));}catch{return null;}}
export function learnRecipes(recipes:Row[],foods:Row[],batchIds:Set<string>,now:string){
 for(const batch of batchIds){
  const group=foods.filter(r=>r.recipe_batch_id===batch),name=group[0]?foodMeal(group[0]):'';if(!name||!group.length||group.length>30)continue;
  const raw=group.map(row=>({...preparedFood(row),name:String(row.name),estimated:row.estimated??1,nutrition_estimated:row.nutrition_estimated??1,quality:row.quality??'unknown',product_id:row.product_id??null,nutrition_sources_json:row.nutrition_sources_json??null,note:String(row.note??'')}));
  const parsed=recipeIngredientsSchema.safeParse(raw);if(!parsed.success)continue;
  const ingredients=parsed.data,key=normalizeProductName(name)+'|'+ingredients.map(r=>normalizeProductName(r.name)).sort().join('|'),id=focusIdentity('recipe:'+key),old=recipes.find(r=>r.id===id);
  let seen:string[]=[];try{seen=JSON.parse(String(old?.seen_json??'[]'));}catch{/* New recipe. */}
  const next={id,name,ingredients_json:JSON.stringify(ingredients),uses:Number(old?.uses??0)+(seen.includes(batch)?0:1),seen_json:JSON.stringify([...new Set([...seen,batch])].slice(-128)),created_at:old?.created_at??now,updated_at:now};
  if(old)Object.assign(old,next);else recipes.push(next);
 }
}
export function selectedRecipes(rows:Row[],text:string){
 const terms=normalizeProductName(text).split(' ').filter(term=>term.length>2);
 return rows.filter(r=>Number(r.uses)>=2&&terms.some(term=>normalizeProductName(String(r.name)).split(' ').some(word=>word.startsWith(term.length>4?term.slice(0,-1):term)))).sort((a,b)=>Number(b.uses)-Number(a.uses)).slice(0,4).flatMap(row=>{const ingredients=recipeIngredients(row);return ingredients?[{id:row.id,name:row.name,ingredients:ingredients.map(r=>({name:r.name,grams:r.grams})),grams:ingredients.reduce((n,r)=>n+r.grams,0)}]:[];});
}
export function foodsFromRecipe(recipe:Row,day:string,turnId:string,fraction:number,now:string,products:Row[]=[]){
 const ingredients=recipeIngredients(recipe);if(!ingredients)throw Error('Не удалось прочитать сохранённое блюдо.');
 return ingredients.map((ingredient,index)=>{
  const product=products.find(p=>p.id===ingredient.product_id);
  const row:Row={...ingredient,...(product?nutritionForMass(product,ingredient.grams):{}),id:focusIdentity('recipe-food:'+turnId+':'+recipe.id+':'+index),day,meal_name:recipe.name,recipe_batch_id:focusIdentity('meal:'+turnId+':'+recipe.id),portion_fraction:1,portion_base_json:null,updated_at:now};
  return fraction===1?row:scaleFood(row,fraction);
 });
}
