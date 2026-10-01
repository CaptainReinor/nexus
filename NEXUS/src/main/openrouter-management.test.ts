import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenRouterManagement } from './openrouter-management';
const state=vi.hoisted(()=>({directory:''}));
vi.mock('electron',()=>({app:{getPath:()=>state.directory},safeStorage:{getSelectedStorageBackend:()=>'gnome_libsecret',isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}}));
beforeEach(()=>{state.directory=mkdtempSync(join(tmpdir(),'nexus-manager-'));});
afterEach(()=>{vi.unstubAllGlobals();rmSync(state.directory,{recursive:true,force:true});});
const managementKey='sk-or-v1-'+ 'a'.repeat(64),childKey='sk-or-v1-'+ 'b'.repeat(64),hash='c'.repeat(64);
it('creates a separate key with a provider-enforced 50-cent monthly cap and updates it on revocation',async()=>{
  const calls:{url:string;method?:string;body?:unknown}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    expect(url.startsWith('https://openrouter.ai/api/v1/keys')).toBe(true);
    expect((options.headers as Record<string,string>).Authorization).toBe(`Bearer ${managementKey}`);
    calls.push({url,method:options.method,body:options.body?JSON.parse(String(options.body)):undefined});
    if(options.method==='GET')return new Response(JSON.stringify({data:[]}));
    return new Response(JSON.stringify({key:childKey,data:{hash,limit:0.5,limit_reset:'monthly',disabled:options.method==='PATCH',include_byok_in_limit:true}}));
  }));
  const manager=new OpenRouterManagement();await manager.setCredential(managementKey);
  expect(manager.status().configured).toBe(true);
  expect(await manager.create('Friend',50)).toEqual({key:childKey,hash,monthlyLimitCents:50});
  expect(calls[1].body).toMatchObject({limit:0.5,limit_reset:'monthly',include_byok_in_limit:true});
  await manager.disable(hash);expect(calls[2].body).toEqual({disabled:true});
});
it('does not accept a standard inference key rejected by the management endpoint',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:403})));
  const manager=new OpenRouterManagement();await expect(manager.setCredential(managementKey)).rejects.toThrow('ключ управления');
  expect(manager.status().configured).toBe(false);
});
