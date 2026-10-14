import {expect,it,vi} from 'vitest';
import {GitHubProvider} from 'electron-updater/out/providers/GitHubProvider';
import {NexusUpdateProvider} from './update-provider';
import type {AppUpdater} from 'electron-updater';
import type {ProviderRuntimeOptions} from 'electron-updater/out/providers/Provider';
import {displayVersion,engineVersion} from '../shared/release-version';
it('normalizes public versions and leaves the verified artifact and release tag intact',async()=>{
 const get=vi.spyOn(GitHubProvider.prototype,'getLatestVersion').mockResolvedValue({version:'0.8.6.2',tag:'v0.8.6.2',path:'NEXUS-Setup-0.8.6.2.exe',sha512:'verified-hash',releaseDate:'2026-10-14T09:00:00Z',files:[{url:'NEXUS-Setup-0.8.6.2.exe',sha512:'verified-hash'}]});
 const provider=new NexusUpdateProvider({provider:'custom'},{} as AppUpdater,{platform:'win32',executor:{} as ProviderRuntimeOptions['executor'],isUseMultipleRangeRequest:false});
 const info=await provider.getLatestVersion();expect(info).toMatchObject({version:'0.8.6-hotfix.2',tag:'v0.8.6.2',files:[{sha512:'verified-hash'}]});get.mockRestore();
 const urls=await provider.getBlockMapFiles(new URL('https://github.com/CaptainReinor/nexus/releases/download/v0.8.6.2/NEXUS-Setup-0.8.6.2.exe'),'0.8.6-hotfix.1','0.8.6-hotfix.2');
 expect(urls.map(url=>url.href)).toEqual(['https://github.com/CaptainReinor/nexus/releases/download/v0.8.6.1/NEXUS-Setup-0.8.6.1.exe.blockmap','https://github.com/CaptainReinor/nexus/releases/download/v0.8.6.2/NEXUS-Setup-0.8.6.2.exe.blockmap']);
});
it('supports future minor versions and rejects unrelated or malformed release identifiers',()=>{
 expect(engineVersion('0.8.7')).toBe('0.8.7-hotfix.0');expect(displayVersion('0.8.6-hotfix.2')).toBe('0.8.6.2');
 for(const version of ['0.8','0.8.6.2.1','0.8.6-beta.1','0.8.99999999999'])expect(()=>engineVersion(version)).toThrow();
});
