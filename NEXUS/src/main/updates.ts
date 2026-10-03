import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateAPI,UpdateState } from '../shared/updates';

// The packaged app-update.yml points only to the public CaptainReinor/nexus releases.
export class DesktopUpdates implements UpdateAPI {
  private state:UpdateState={phase:'idle',currentVersion:app.getVersion()};
  private checking:Promise<UpdateState>|null=null;
  private downloading:Promise<UpdateState>|null=null;
  private installing=false;
  constructor(private beforeInstall:()=>Promise<void>){
    autoUpdater.autoDownload=false;
    autoUpdater.autoInstallOnAppQuit=false;
    autoUpdater.allowPrerelease=false;
    autoUpdater.allowDowngrade=false;
    autoUpdater.logger=null;
    autoUpdater.on('checking-for-update',()=>this.set({phase:'checking'}));
    autoUpdater.on('update-available',info=>this.set({phase:'available',version:info.version,message:undefined}));
    autoUpdater.on('update-not-available',()=>this.set({phase:'current',version:undefined,message:undefined}));
    autoUpdater.on('download-progress',progress=>this.set({phase:'downloading',percent:Math.round(progress.percent)}));
    autoUpdater.on('update-downloaded',info=>this.set({phase:'ready',version:info.version,percent:100,message:undefined}));
    autoUpdater.on('error',()=>{this.installing=false;this.set({phase:'error',message:'Не удалось обновить NEXUS. Попробуйте позже.'});});
  }
  private set(patch:Partial<UpdateState>){this.state={...this.state,...patch};}
  async status(){return {...this.state};}
  async check():Promise<UpdateState>{
    if(this.checking)return this.checking;
    if(this.downloading||this.state.phase==='ready')return this.status();
    if(!app.isPackaged||process.platform==='linux'&&!process.env.APPIMAGE){
      this.set({phase:'unsupported',message:'Обновления доступны в установленной версии Windows и переносном AppImage.'});return this.status();
    }
    this.checking=(async()=>{try{await autoUpdater.checkForUpdates();if(this.state.phase==='available')void this.download();}catch{this.set({phase:'error',message:'Не удалось проверить обновления. Проверьте интернет.'});}return this.status();})().finally(()=>{this.checking=null;});
    return this.checking;
  }
  async download():Promise<UpdateState>{
    if(this.downloading)return this.downloading;
    if(this.state.phase==='ready')return this.status();
    if(this.state.phase!=='available')throw new Error('Сначала проверьте обновления.');
    this.set({phase:'downloading',percent:0,message:undefined});
    this.downloading=(async()=>{try{await autoUpdater.downloadUpdate();}catch{this.set({phase:'error',message:'Не удалось скачать обновление. Попробуйте ещё раз.'});}return this.status();})().finally(()=>{this.downloading=null;});
    return this.downloading;
  }
  async install():Promise<void>{
    if(this.installing)return;
    if(this.state.phase!=='ready')throw new Error('Обновление ещё не скачано.');
    this.installing=true;
    try{await this.beforeInstall();autoUpdater.quitAndInstall(false,true);}catch(error){this.installing=false;throw error;}
  }
}
