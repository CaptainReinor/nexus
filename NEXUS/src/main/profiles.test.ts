import { afterEach,expect,it } from 'vitest';
import { mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileManager } from './profiles';
const roots:string[]=[];
afterEach(()=>{for(const path of roots)rmSync(path,{recursive:true,force:true});roots.length=0;});
it('keeps the old profile in place and never copies its database or key into a new profile',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexus-profiles-'));roots.push(root);
  writeFileSync(join(root,'nexus.sqlite'),'owner data');writeFileSync(join(root,'openrouter-key.bin'),'owner encrypted key');
  const manager=new ProfileManager(root);expect(manager.directory()).toBe(root);
  const friend=manager.create('Друг');manager.select(friend.id);
  const reopened=new ProfileManager(root);expect(reopened.list().active).toBe(friend.id);
  expect(readdirSync(reopened.directory())).toEqual([]);
  reopened.select('local');expect(readFileSync(join(reopened.directory(),'nexus.sqlite'),'utf8')).toBe('owner data');
  expect(()=>reopened.select('../escape')).toThrow();
});
it('rejects a corrupted profile registry rather than opening another folder',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexus-profiles-'));roots.push(root);
  writeFileSync(join(root,'profiles.json'),JSON.stringify({active:'../escape',profiles:[{id:'../escape',name:'Bad'}]}));
  expect(()=>new ProfileManager(root).directory()).toThrow();
});
