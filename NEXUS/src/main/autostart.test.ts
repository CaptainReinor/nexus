import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mock=vi.hoisted(()=>({get:vi.fn(()=>({openAtLogin:true})),set:vi.fn()}));
vi.mock('electron',()=>({app:{getLoginItemSettings:mock.get,setLoginItemSettings:mock.set}}));
import { getAutostart, setAutostart } from './autostart';
let directory:string;
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'nexus-autostart-'));vi.clearAllMocks();});
afterEach(()=>rmSync(directory,{recursive:true,force:true}));
it('uses the AppImage path and does not call Windows login APIs on Linux',()=>{
  const env={platform:'linux' as const,configHome:directory,executable:'/home/alex/My Apps/NEXUS.AppImage'};
  expect(getAutostart(env)).toBe(false);
  setAutostart(true,env);
  const path=join(directory,'autostart','ru.nexus.desktop.desktop');
  expect(readFileSync(path,'utf8')).toContain('Exec="/home/alex/My Apps/NEXUS.AppImage"\n');
  expect(getAutostart(env)).toBe(true);
  writeFileSync(path,readFileSync(path,'utf8')+'Hidden=true\n');
  expect(getAutostart(env)).toBe(false);
  setAutostart(false,env);expect(existsSync(path)).toBe(false);
  expect(mock.get).not.toHaveBeenCalled();expect(mock.set).not.toHaveBeenCalled();
});
it('rejects entry injection and escapes characters in executable names',()=>{
  const env={platform:'linux' as const,configHome:directory,executable:'/home/alex/NEXUS\nHidden=true'};
  expect(()=>setAutostart(true,env)).toThrow('путь');
  setAutostart(true,{...env,executable:'/home/alex/NEXUS "$`.AppImage'});
  const contents=readFileSync(join(directory,'autostart','ru.nexus.desktop.desktop'),'utf8');
  expect(contents).toContain('Exec="/home/alex/NEXUS \\\\"\\\\$\\\\`.AppImage"\n');
});
it('preserves native Windows autostart',()=>{
  const env={platform:'win32' as const,configHome:directory,executable:'C:\\NEXUS.exe'};
  expect(getAutostart(env)).toBe(true);setAutostart(false,env);
  expect(mock.set).toHaveBeenCalledWith({openAtLogin:false});
});
