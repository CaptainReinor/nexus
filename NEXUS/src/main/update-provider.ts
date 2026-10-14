import {GitHubProvider} from 'electron-updater/out/providers/GitHubProvider';
import type {AppUpdater} from 'electron-updater';
import type {CustomPublishOptions} from 'builder-util-runtime';
import type {ProviderRuntimeOptions} from 'electron-updater/out/providers/Provider';
import {displayVersion,engineVersion} from '../shared/release-version';

export class NexusUpdateProvider extends GitHubProvider{
 constructor(_options:CustomPublishOptions,updater:AppUpdater,runtimeOptions:ProviderRuntimeOptions){super({provider:'github',owner:'CaptainReinor',repo:'nexus'},updater,runtimeOptions);}
 override async getLatestVersion(){const info=await super.getLatestVersion();return {...info,version:engineVersion(info.version)};}
 override getBlockMapFiles(baseUrl:URL,oldVersion:string,newVersion:string,oldBase:string|null=null){return super.getBlockMapFiles(baseUrl,displayVersion(oldVersion),displayVersion(newVersion),oldBase);}
}
