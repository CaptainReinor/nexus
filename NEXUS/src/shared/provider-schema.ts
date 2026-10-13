export function providerSchema(value:unknown):unknown{
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
