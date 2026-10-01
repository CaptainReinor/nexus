import { z } from 'zod';
import { lifeSchema } from './life';
export const journalAnalysisSchema = z.object({life:lifeSchema.optional(),summary:z.string(),health:z.object({weightKg:z.number().positive().nullable(),sleepStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),sleepEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),mood:z.number().int().min(1).max(10).nullable(),energy:z.number().int().min(1).max(10).nullable(),nutrition:z.enum(['good','normal','poor']).nullable(),workout:z.object({type:z.string(),minutes:z.number().int().nonnegative().nullable()}).nullable(),habits:z.array(z.object({habitId:z.number().int(),value:z.number().nonnegative(),status:z.enum(['done','missed']),reason:z.string()}))}),finance:z.array(z.object({type:z.enum(['expense','income']),amountCents:z.number().int().positive(),categoryId:z.number().int().nullable(),accountId:z.number().int().nullable(),note:z.string()})),work:z.array(z.object({jobId:z.number().int(),status:z.enum(['saved','planned','applied','viewed','invited','interview','next','offer','rejected','withdrawn','archived']),reason:z.string()})),uncertain:z.array(z.string())});

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
export function parseJournalResponse(content:string){
  const text=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return journalAnalysisSchema.parse(JSON.parse(text));
}
