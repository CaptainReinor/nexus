import { requireSecureStorage } from './secure-storage';
import { app,safeStorage } from 'electron';
import { existsSync,readFileSync,writeFileSync,renameSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const metadata=z.object({hash:hashSchema,disabled:z.boolean(),limit:z.number().nonnegative().nullable(),limit_reset:z.string().nullable(),usage_monthly:z.number().nonnegative().optional(),include_byok_in_limit:z.boolean().optional()});
export type UserAIKey={key:string;hash:string;monthlyLimitCents:number};

/** Administrative credential stays in the owner's native process, never on VPS/invites. */
export class OpenRouterManagement {
  private path=join(app.getPath('userData'),'openrouter-management-key.bin');
  status(){return {configured:existsSync(this.path)};}
  private credential(){
    requireSecureStorage();
    if(!existsSync(this.path))throw new Error('Сначала добавьте ключ управления OpenRouter в разделе «Друзья».');
    return safeStorage.decryptString(readFileSync(this.path));
  }
  private async request(path:string,method='GET',body?:unknown,key=this.credential()):Promise<unknown>{
    let response:Response;
    try{response=await fetch(`https://openrouter.ai/api/v1/keys${path}`,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)});}
    catch{throw new Error('Нет связи с управлением OpenRouter. Проверьте VPN на этом компьютере.');}
    if(response.status===401||response.status===403)throw new Error('OpenRouter отклонил ключ управления или эту сеть. Нужен Management API Key и доступ через VPN.');
    if(!response.ok)throw new Error(`Управление OpenRouter: ошибка ${response.status}.`);
    if(Number(response.headers.get('content-length')??0)>1_000_000)throw new Error('Ответ OpenRouter слишком большой.');
    return response.json();
  }
  async setCredential(key:string){
    key=key.trim();
    if(!key){rmSync(this.path,{force:true});return;}
    requireSecureStorage();
    if(!/^sk-or-v1-[a-zA-Z0-9_-]{20,480}$/.test(key))throw new Error('Укажите ключ управления OpenRouter.');
    z.object({data:z.array(z.unknown())}).parse(await this.request('?offset=0','GET',undefined,key));
    const temporary=`${this.path}.tmp`;
    try{writeFileSync(temporary,safeStorage.encryptString(key),{mode:0o600});renameSync(temporary,this.path);}finally{rmSync(temporary,{force:true});}
  }
  async create(name:string,monthlyLimitCents:number):Promise<UserAIKey>{
    z.number().int().min(0).max(10000).parse(monthlyLimitCents);
    const reply=z.object({key:z.string().regex(/^sk-or-v1-[a-zA-Z0-9_-]{20,480}$/),data:metadata}).parse(await this.request('','POST',{name:`NEXUS / ${name.slice(0,80)} / ${randomUUID()}`,limit:monthlyLimitCents/100,limit_reset:'monthly',include_byok_in_limit:true}));
    if(reply.data.disabled||reply.data.limit!==monthlyLimitCents/100||reply.data.limit_reset!=='monthly'||reply.data.include_byok_in_limit!==true){
      await this.disable(reply.data.hash);throw new Error('OpenRouter не подтвердил лимит ключа. Приглашение не создано.');
    }
    return {key:reply.key,hash:reply.data.hash,monthlyLimitCents};
  }
  async update(hash:string,changes:{active?:boolean;monthlyLimitCents?:number}){
    hashSchema.parse(hash);
    const reply=z.object({data:metadata}).parse(await this.request(`/${hash}`,'PATCH',{...(changes.active===undefined?{}:{disabled:!changes.active}),...(changes.monthlyLimitCents===undefined?{}:{limit:changes.monthlyLimitCents/100,limit_reset:'monthly',include_byok_in_limit:true})}));
    if(changes.active!==undefined&&reply.data.disabled===changes.active||changes.monthlyLimitCents!==undefined&&(reply.data.limit!==changes.monthlyLimitCents/100||reply.data.limit_reset!=='monthly'))throw new Error('OpenRouter не подтвердил изменение ключа.');
  }
  async disable(hash:string){await this.update(hash,{active:false});}
  async usage(hash:string){hashSchema.parse(hash);const reply=z.object({data:metadata}).parse(await this.request(`/${hash}`));return Math.ceil((reply.data.usage_monthly??0)*1_000_000);}
}
