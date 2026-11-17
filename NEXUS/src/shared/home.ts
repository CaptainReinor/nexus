import {z} from './validation';
import {put} from './daily-core';
import type {Snapshot} from './snapshot-sync';
import type {FocusAction} from './focus-mode';
import {toCents} from './domain';

export const checklistKinds=['weight','sleep','food','expense','activity','saving','text'] as const;
export const checklistSchema=z.array(z.enum(checklistKinds)).max(7).refine(items=>new Set(items).size===items.length);
export const homePreferencesSchema=z.object({dailyChecklist:checklistSchema.default(['weight','sleep']),progress:z.boolean().default(true),work:z.boolean().default(false),investments:z.boolean().default(false),care:z.boolean().default(true),animations:z.boolean().default(true),haptics:z.boolean().default(true),sound:z.boolean().default(false)}).strict();
// Patch fields have no defaults: changing one option must retain all other choices.
export const homePreferencesPatchSchema=z.object({dailyChecklist:checklistSchema.optional(),progress:z.boolean().optional(),work:z.boolean().optional(),investments:z.boolean().optional(),care:z.boolean().optional(),animations:z.boolean().optional(),haptics:z.boolean().optional(),sound:z.boolean().optional()}).strict();
export type HomePreferences=z.infer<typeof homePreferencesSchema>;
export function homePreferences(s:Snapshot):HomePreferences{try{return homePreferencesSchema.parse(JSON.parse(String(s.tables.settings?.find(r=>r.key==='returnPreferences')?.value)));}catch{return homePreferencesSchema.parse({});}}
export function saveHomePreferences(s:Snapshot,patch:z.infer<typeof homePreferencesPatchSchema>){put(s,'settings',{key:'returnPreferences',value:JSON.stringify({...homePreferences(s),...homePreferencesPatchSchema.parse(patch)})},'key');}
export type CaptureKind='weight'|'sleep'|'expense'|'food'|'text'|'activity'|'saving';
export function directCapture(kind:CaptureKind,value:string,day:string,note='',start='',end=''):FocusAction[]{
 const numeric=Number(value.replace(/\s/g,'').replace(',','.'));
 if(kind==='weight'){if(!Number.isFinite(numeric)||numeric<1||numeric>500)throw Error('Укажите вес от 1 до 500 кг.');return [{kind:'weight',day,kg:numeric}];}
 if(kind==='sleep'){
  if(start||end){if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||[start,end].some(t=>Number(t.slice(0,2))>23||Number(t.slice(3))>59))throw Error('Укажите оба времени в формате ЧЧ:ММ.');return [{kind:'sleep',day,start,end,minutes:null}];}
  if(!Number.isFinite(numeric)||numeric<=0||numeric>24)throw Error('Укажите длительность сна от 0 до 24 часов.');return [{kind:'sleep',day,start:null,end:null,minutes:Math.round(numeric*60)}];
 }
 if(kind==='expense')return [{kind:'expense',id:null,day,amountCents:toCents(value),accountId:1,categoryId:9,note}];
 if(kind==='saving')return [{kind:'saving',id:null,day,amountCents:toCents(value),direction:'in',note}];
 if(kind==='activity'){if(!value.trim())throw Error('Назовите активность.');const gym=/(?:трениров|спортзал|(?:^|\s)зал(?:\s|$)|gym|фитнес)/iu.test(value);return [{kind:'activity',id:null,day,title:value.trim(),type:gym?'gym':'other',minutes:null,impact:'helpful',note}];}
 return [];
}
export const captureLabels:Record<CaptureKind,string>={weight:'Вес',sleep:'Сон',expense:'Расход',food:'Еда',text:'Запись',activity:'Тренировка',saving:'Накопления'};
export const checklistLabels:Record<CaptureKind,string>={weight:'Отметить вес',sleep:'Записать сон',food:'Записать питание',expense:'Записать расходы',activity:'Записать активность',saving:'Записать накопления',text:'Запись в дневнике'};
export function dailyChecklist(s:Snapshot,day:string,kinds=homePreferences(s).dailyChecklist){
 const rows=(table:string)=>s.tables[table]??[];
 const done:Record<CaptureKind,boolean>={weight:rows('weight_entries').some(r=>r.day===day),sleep:rows('health_daily_entries').some(r=>r.day===day&&typeof r.sleep_minutes==='number'&&r.sleep_minutes>0),food:rows('food_entries').some(r=>r.day===day),expense:rows('finance_transactions').some(r=>String(r.occurred_at).slice(0,10)===day&&r.type==='expense'),saving:rows('finance_transactions').some(r=>String(r.occurred_at).slice(0,10)===day&&r.type==='transfer'),activity:rows('activity_entries').some(r=>r.day===day),text:rows('mentor_turns').some(r=>r.day===day&&String(r.raw_text??'').trim())};
 return kinds.map(key=>({key,label:checklistLabels[key],done:done[key]}));
}
