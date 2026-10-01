import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireSecureStorage } from './secure-storage';

export const deviceAIKeySchema=z.string().regex(/^sk-or-v1-[a-zA-Z0-9_-]{20,480}$/);
const cacheSchema=z.object({version:z.literal(1),binding:z.string().length(64),key:deviceAIKeySchema}).strict();
export function deviceAIBinding(endpoint:string,token:string,profileId?:string):string {
  return createHash('sha256').update(JSON.stringify([endpoint,token,profileId??''])).digest('hex');
}
/** Credentials stay in the current OS profile, outside the database and exports. */
export class DeviceAIKeyCache {
  private path=join(app.getPath('userData'),'device-ai-key.bin');
  read(binding:string):string|undefined {
    if(!existsSync(this.path))return;
    requireSecureStorage();
    try{
      const value=cacheSchema.parse(JSON.parse(safeStorage.decryptString(readFileSync(this.path))));
      return value.binding===binding?value.key:undefined;
    }catch{return;}
  }
  save(binding:string,key:string):void {
    requireSecureStorage();
    const value=cacheSchema.parse({version:1,binding,key}),temporary=`${this.path}.tmp`;
    try{writeFileSync(temporary,safeStorage.encryptString(JSON.stringify(value)),{mode:0o600});renameSync(temporary,this.path);}
    finally{rmSync(temporary,{force:true});}
  }
  clear():void {rmSync(this.path,{force:true});}
}
