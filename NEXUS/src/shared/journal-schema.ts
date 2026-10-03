import { z } from './validation';
import { lifeSchema } from './life';
import type { JournalAnalysis } from './models';
export const journalAnalysisSchema = z.object({life:lifeSchema.optional(),summary:z.string(),health:z.object({weightKg:z.number().positive().nullable(),sleepStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),sleepEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),mood:z.number().int().min(1).max(10).nullable(),energy:z.number().int().min(1).max(10).nullable(),nutrition:z.enum(['good','normal','poor']).nullable(),workout:z.object({type:z.string(),minutes:z.number().int().nonnegative().nullable()}).nullable(),habits:z.array(z.object({habitId:z.number().int(),value:z.number().nonnegative(),status:z.enum(['done','missed']),reason:z.string()}))}),finance:z.array(z.object({type:z.enum(['expense','income']),amountCents:z.number().int().nonnegative().nullable(),categoryId:z.number().int().nullable(),accountId:z.number().int().nullable(),note:z.string()})),work:z.array(z.object({jobId:z.number().int(),status:z.enum(['saved','planned','applied','viewed','invited','interview','next','offer','rejected','withdrawn','archived']),reason:z.string()})),uncertain:z.array(z.string())});

// Keep the provider contract identical on Windows and Android. Bounds stay in
// Zod validation; only widely supported JSON Schema keywords are sent upstream.
function providerSchema(value:unknown):unknown {
  if(Array.isArray(value))return value.map(providerSchema);
  if(!value||typeof value!=='object')return value;
  const stripped=new Set(['$schema','default','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','pattern','format']);
  const source=value as Record<string,unknown>;
  const result:Record<string,unknown>=Object.fromEntries(Object.entries(source).filter(([key])=>!stripped.has(key)).map(([key,item])=>[key,providerSchema(item)]));
  if(source.type==='object'&&source.properties){result.required=Object.keys(source.properties);result.additionalProperties=false;}
  return result;
}
export const journalResponseFormat:Record<string,unknown>={type:'json_schema',json_schema:{name:'nexus_day',strict:true,schema:providerSchema(z.toJSONSchema(journalAnalysisSchema,{target:'draft-7'}))}};
export const journalFinanceInstructions='Если прямо указан факт траты или дохода, но сумма неизвестна, добавь предложение в finance с amountCents=null и короткой заметкой о назначении. Пользователь заполнит сумму вручную перед сохранением. Не заменяй неизвестную сумму нулём и не угадывай её. Известная сумма — положительное целое число копеек. Если самого факта траты или дохода нет, finance должен быть пустым массивом []. Сам по себе поход в магазин, еда или готовка не доказывает оплату. Не добавляй шаблонные пустые операции.';
export function isPositiveJournalAmount(value:number|null|undefined):value is number {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}
export function hasIncompleteSelectedFinance(analysis:Pick<JournalAnalysis,'finance'>,keys:Iterable<string>):boolean {
  return [...keys].some(key=>key.startsWith('finance.')&&!isPositiveJournalAmount(analysis.finance[Number(key.slice(8))]?.amountCents));
}
export function parseJournalResponse(content:string){
  const text=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{
    const value:unknown=JSON.parse(text);
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      const day=value as Record<string,unknown>;
      if(Array.isArray(day.finance)){
        day.finance=day.finance.map(item=>{
          if(!item||typeof item!=='object'||Array.isArray(item))return item;
          const amount=(item as Record<string,unknown>).amountCents;
          // Older model answers used zero as an unknown amount. Keep an editable draft.
          return amount===0?{...item,amountCents:null}:item;
        });
      }
    }
    return journalAnalysisSchema.parse(value);
  }catch(error){
    if(error instanceof z.ZodError||error instanceof SyntaxError)throw new Error('ИИ вернул некорректный разбор. Текст сохранён в поле ввода — повторите анализ.');
    throw error;
  }
}
