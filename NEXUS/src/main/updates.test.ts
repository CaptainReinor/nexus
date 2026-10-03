import { beforeEach,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({handlers:new Map<string,(value?:unknown)=>void>(),check:vi.fn(),download:vi.fn(),install:vi.fn(),packaged:true}));
vi.mock('electron',()=>({app:{getVersion:()=> '0.4.9',get isPackaged(){return mock.packaged;}}}));
vi.mock('electron-updater',()=>({autoUpdater:{on:(name:string,handler:(value?:unknown)=>void)=>mock.handlers.set(name,handler),checkForUpdates:mock.check,downloadUpdate:mock.download,quitAndInstall:mock.install}}));
import { DesktopUpdates } from './updates';
beforeEach(()=>{mock.handlers.clear();mock.check.mockReset();mock.download.mockReset();mock.install.mockReset();mock.packaged=true;vi.stubEnv('APPIMAGE','/tmp/NEXUS.AppImage');});
it('serializes checks, downloads the candidate and backs up before an explicit install',async()=>{
  const backup=vi.fn(async()=>{}),updates=new DesktopUpdates(backup);
  let downloaded!:()=>void;mock.download.mockImplementation(()=>new Promise<void>(resolve=>{downloaded=()=>{mock.handlers.get('update-downloaded')?.({version:'0.5.0'});resolve();};}));
  let finish!:()=>void;mock.check.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{mock.handlers.get('update-available')?.({version:'0.5.0'});resolve();};}));
  const first=updates.check(),second=updates.check();expect(mock.check).toHaveBeenCalledTimes(1);finish();
  expect((await first).phase).toBe('downloading');expect((await second).version).toBe('0.5.0');expect(mock.install).not.toHaveBeenCalled();
  await expect(updates.install()).rejects.toThrow('не скачано');
  const download=updates.download();expect(mock.download).toHaveBeenCalledTimes(1);downloaded();expect((await download).phase).toBe('ready');await updates.install();
  expect(backup).toHaveBeenCalledTimes(1);expect(mock.install).toHaveBeenCalledWith(false,true);expect(backup.mock.invocationCallOrder[0]).toBeLessThan(mock.install.mock.invocationCallOrder[0]);
});
it('blocks installation if the database backup fails',async()=>{
  const updates=new DesktopUpdates(async()=>{throw new Error('Нет места');});mock.handlers.get('update-downloaded')?.({version:'0.5.0'});
  await expect(updates.install()).rejects.toThrow('Нет места');expect(mock.install).not.toHaveBeenCalled();expect((await updates.status()).phase).toBe('ready');
});
it('never starts update installation from development mode or exposes raw network errors',async()=>{
  mock.packaged=false;const updates=new DesktopUpdates(async()=>{});expect((await updates.check()).phase).toBe('unsupported');expect(mock.check).not.toHaveBeenCalled();
  mock.packaged=true;mock.check.mockRejectedValue(new Error('secret URL'));expect((await updates.check()).message).not.toContain('secret');expect((await updates.status()).phase).toBe('error');expect(mock.install).not.toHaveBeenCalled();
});
